from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore[misc, assignment]

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from app import db
from app import sheets_oauth
from app.ws_hub import hub

BACKEND_DIR = Path(__file__).resolve().parents[1]
if load_dotenv is not None:
    load_dotenv(BACKEND_DIR / ".env")

REPO_ROOT = Path(__file__).resolve().parents[3]
MYDATA_JSON = REPO_ROOT / "assets" / "js" / "mydata.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    if db.contestant_count() == 0 and MYDATA_JSON.is_file():
        raw = json.loads(MYDATA_JSON.read_text(encoding="utf-8"))
        if isinstance(raw, list) and raw:
            db.import_contestants(raw)
    if db.round1_pair_meta_count() == 0:
        try:
            if not db.seed_round1_pairs_from_public_files():
                db.seed_round1_pairs_numbered_defaults()
        except Exception:
            try:
                db.seed_round1_pairs_numbered_defaults()
            except Exception:
                pass
    if db.round2_lineup_meta_count() == 0:
        try:
            if not db.seed_round2_lineup_from_public_files():
                db.seed_round2_lineup_empty_defaults()
        except Exception:
            try:
                db.seed_round2_lineup_empty_defaults()
            except Exception:
                pass
    if db.final_lineup_meta_count() == 0:
        try:
            db.seed_final_lineup_from_round2()
        except Exception:
            try:
                db.replace_final_lineup([{"name": f"选手 {i}", "img": ""} for i in range(1, 7)])
            except Exception:
                pass
    yield


app = FastAPI(title="Voice of NYC API", lifespan=lifespan)

_DEFAULT_CORS_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
]
_extra_cors = [
    o.strip()
    for o in os.environ.get("CORS_EXTRA_ORIGINS", "").split(",")
    if o.strip()
]
_cors_origins = list(_DEFAULT_CORS_ORIGINS) + _extra_cors
_cors_regex = os.environ.get("CORS_ALLOW_ORIGIN_REGEX", "").strip()
_cors_kw: dict = {
    "allow_origins": _cors_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if _cors_regex:
    _cors_kw["allow_origin_regex"] = _cors_regex

app.add_middleware(CORSMiddleware, **_cors_kw)


async def _broadcast_state() -> None:
    try:
        text = db.state_json()
    except Exception:
        return
    asyncio.create_task(hub.broadcast(text))


@app.get("/api/state")
def api_state() -> JSONResponse:
    try:
        return JSONResponse(db.state_payload())
    except Exception as e:
        raise HTTPException(500, f"读取状态失败: {e}") from e


class ScoresPatch(BaseModel):
    judge_scores: list[float] | None = Field(
        default=None, description="4 个评委分，求平均写入 judges"
    )
    audience: float | None = None


@app.patch("/api/contestants/{contestant_id}/scores")
async def api_patch_scores(contestant_id: int, body: ScoresPatch) -> JSONResponse:
    j_avg: float | None = None
    if body.judge_scores is not None:
        if len(body.judge_scores) != 4:
            raise HTTPException(400, "judge_scores 必须为长度 4 的数组")
        j_avg = sum(body.judge_scores) / 4.0
    if j_avg is None and body.audience is None:
        raise HTTPException(400, "至少提供 judge_scores 或 audience")
    if not db.update_scores(
        contestant_id,
        judges_avg=j_avg,
        audience=body.audience,
    ):
        raise HTTPException(404, "无此选手 id")
    await _broadcast_state()
    return JSONResponse({"ok": True, **db.state_payload()})


class ImportBody(BaseModel):
    contestants: list[dict]


@app.post("/api/import")
async def api_import(body: ImportBody) -> JSONResponse:
    if not body.contestants:
        raise HTTPException(400, "contestants 不能为空")
    try:
        db.import_contestants(body.contestants)
    except (TypeError, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(500, f"导入失败: {e}") from e
    await _broadcast_state()
    try:
        payload = db.state_payload()
    except Exception as e:
        raise HTTPException(500, f"读取选手状态失败: {e}") from e
    return JSONResponse({"ok": True, **payload})


class Round1PairItem(BaseModel):
    leftName: str = ""
    rightName: str = ""
    leftImg: str = ""
    rightImg: str = ""


class Round1PairsPutBody(BaseModel):
    pairs: list[Round1PairItem] = Field(..., min_length=5, max_length=5)


# --- 大屏 lineup：路由名保留 round1-pairs 兼容旧客户端；语义为 stage=round1 的 PK 五组 ---


@app.get("/api/stage/round1-pairs")
def api_get_round1_pairs() -> JSONResponse:
    return JSONResponse(
        {
            "pairs": db.get_round1_pairs(),
            "persisted": db.round1_pair_meta_count() > 0,
        }
    )


@app.put("/api/stage/round1-pairs")
def api_put_round1_pairs(body: Round1PairsPutBody) -> JSONResponse:
    try:
        db.replace_round1_pairs([p.model_dump() for p in body.pairs])
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return JSONResponse(
        {"ok": True, "pairs": db.get_round1_pairs(), "persisted": db.round1_pair_meta_count() > 0}
    )


@app.post("/api/stage/round1-pairs/import-from-files")
def api_round1_pairs_import_from_files() -> JSONResponse:
    ok = db.seed_round1_pairs_from_public_files()
    if not ok:
        raise HTTPException(
            400,
            "未能从 frontend/public/stage/round1/1.json～5.json 导入（文件缺失或 JSON 无效）。",
        )
    return JSONResponse(
        {"ok": True, "pairs": db.get_round1_pairs(), "persisted": db.round1_pair_meta_count() > 0}
    )


@app.post("/api/stage/round1-pairs/apply-numbered-defaults")
def api_round1_pairs_apply_numbered_defaults() -> JSONResponse:
    """强制用选手 1–10 照片路径 + 内置姓名覆盖数据库（与 public JSON 无关）。"""
    db.seed_round1_pairs_numbered_defaults()
    return JSONResponse(
        {"ok": True, "pairs": db.get_round1_pairs(), "persisted": True}
    )


class Round2LineupItem(BaseModel):
    name: str = ""
    img: str = ""


class Round2LineupPutBody(BaseModel):
    slots: list[Round2LineupItem] = Field(..., min_length=6, max_length=6)


@app.get("/api/stage/round2-lineup")
def api_get_round2_lineup() -> JSONResponse:
    return JSONResponse(
        {
            "slots": db.get_round2_lineup(),
            "persisted": db.round2_lineup_meta_count() > 0,
        }
    )


@app.put("/api/stage/round2-lineup")
def api_put_round2_lineup(body: Round2LineupPutBody) -> JSONResponse:
    try:
        db.replace_round2_lineup([s.model_dump() for s in body.slots])
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return JSONResponse(
        {
            "ok": True,
            "slots": db.get_round2_lineup(),
            "persisted": db.round2_lineup_meta_count() > 0,
        }
    )


@app.post("/api/stage/round2-lineup/import-from-files")
def api_round2_lineup_import_from_files() -> JSONResponse:
    ok = db.seed_round2_lineup_from_public_files()
    if not ok:
        raise HTTPException(
            400,
            "未能从 frontend/public/stage/round2/1.json～6.json 导入（文件缺失或 JSON 无效）。",
        )
    return JSONResponse(
        {
            "ok": True,
            "slots": db.get_round2_lineup(),
            "persisted": db.round2_lineup_meta_count() > 0,
        }
    )


class FinalRevealConfigPutBody(BaseModel):
    """决赛揭晓页：Sheets 拉取范围（相对 spreadsheet id）与无 G 列时的加权 fallback。"""

    sheet_range: str = Field(..., min_length=1, max_length=256)
    judge_weight: float = Field(..., ge=0.0, le=1.0)
    audience_weight: float = Field(..., ge=0.0, le=1.0)


@app.get("/api/stage/final-reveal-config")
def api_get_final_reveal_config() -> JSONResponse:
    return JSONResponse(db.get_final_reveal_config())


@app.put("/api/stage/final-reveal-config")
def api_put_final_reveal_config(body: FinalRevealConfigPutBody) -> JSONResponse:
    try:
        cfg = db.replace_final_reveal_config(
            sheet_range=body.sheet_range,
            judge_weight=body.judge_weight,
            audience_weight=body.audience_weight,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return JSONResponse({"ok": True, **cfg})


@app.get("/api/stage/final-lineup")
def api_get_final_lineup() -> JSONResponse:
    return JSONResponse(
        {
            "slots": db.get_final_lineup(),
            "persisted": db.final_lineup_meta_count() > 0,
        }
    )


@app.put("/api/stage/final-lineup")
def api_put_final_lineup(body: Round2LineupPutBody) -> JSONResponse:
    try:
        db.replace_final_lineup([s.model_dump() for s in body.slots])
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return JSONResponse(
        {
            "ok": True,
            "slots": db.get_final_lineup(),
            "persisted": db.final_lineup_meta_count() > 0,
        }
    )


@app.post("/api/stage/final-lineup/copy-from-round2")
def api_final_lineup_copy_from_round2() -> JSONResponse:
    db.seed_final_lineup_from_round2()
    return JSONResponse(
        {
            "ok": True,
            "slots": db.get_final_lineup(),
            "persisted": db.final_lineup_meta_count() > 0,
        }
    )


# --- Google Sheets OAuth（后台写入，与 vote-ingest.gs 布局一致）---


@app.get("/api/sheets/oauth/start")
def sheets_oauth_start() -> RedirectResponse:
    """浏览器打开此地址 → Google 登录授权 → 回调保存 refresh token。"""
    try:
        url, _ = sheets_oauth.start_authorization_url()
    except ValueError as e:
        raise HTTPException(503, str(e)) from e
    return RedirectResponse(url, status_code=302)


@app.get("/api/sheets/oauth/callback")
def sheets_oauth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> JSONResponse:
    if error:
        raise HTTPException(400, f"Google OAuth 错误: {error}")
    if not code:
        raise HTTPException(400, "缺少 code")
    if not sheets_oauth.consume_state(state):
        raise HTTPException(400, "state 无效或已过期，请重新打开 /api/sheets/oauth/start")
    try:
        sheets_oauth.exchange_code(code)
    except Exception as e:
        raise HTTPException(400, f"换取令牌失败: {e}") from e
    return JSONResponse(
        {
            "ok": True,
            "message": "已保存令牌。可调用 POST /api/sheets/round1-votes 等写入接口；令牌文件勿提交。",
        }
    )


@app.get("/api/sheets/oauth/status")
def sheets_oauth_status() -> JSONResponse:
    path = sheets_oauth.TOKEN_FILE
    if not path.is_file():
        return JSONResponse({"configured": False})
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return JSONResponse({"configured": False, "error": "token 文件损坏"})
    return JSONResponse(
        {
            "configured": bool(raw.get("refresh_token") or raw.get("token")),
            "has_refresh_token": bool(raw.get("refresh_token")),
            "sheet_id_set": bool(sheets_oauth.spreadsheet_id()),
        }
    )


class Round1VotesBody(BaseModel):
    """第 pair 对（1–5）写入 Round1 的 B～E 列（表头占第 1 行，A 列为组次说明仅人工编辑）。"""

    pair: int = Field(ge=1, le=5)
    left: int = Field(ge=0, description="观众票·左（B 列）")
    right: int = Field(ge=0, description="观众票·右（C 列）")
    judge_left: int | None = Field(
        default=None,
        ge=0,
        description="评委折算票·左（D 列）；省略则从表中读取原值",
    )
    judge_right: int | None = Field(
        default=None,
        ge=0,
        description="评委折算票·右（E 列）；省略则从表中读取原值",
    )


class Round2VotesBody(BaseModel):
    row: int = Field(ge=2, le=200, description="工作表行号，默认数据区为 2–7")
    votes: int = Field(ge=0)


class Round2NameBody(BaseModel):
    row: int = Field(ge=2, le=200)
    name: str = Field(min_length=0, max_length=200)


class Round3ScoreBody(BaseModel):
    """Round3 表 B 列：观众均分（支持小数）"""

    row: int = Field(ge=2, le=200, description="工作表行号，默认数据区为 2–7")
    score: float = Field(ge=0, le=1e6, description="观众均分")


class Round3JudgeBody(BaseModel):
    """Round3 表 C/D/E 列：第 1～3 位评委分"""

    row: int = Field(ge=2, le=200)
    judge: Literal[1, 2, 3]
    score: float = Field(ge=0, le=1e6)


class Round3NameBody(BaseModel):
    row: int = Field(ge=2, le=200)
    name: str = Field(min_length=0, max_length=200)


def _sheet_int_cell(row: list[Any], idx: int) -> int:
    if idx >= len(row):
        return 0
    v = row[idx]
    if v is None or v == "":
        return 0
    try:
        return int(float(str(v).strip()))
    except ValueError:
        return 0


@app.post("/api/sheets/round1-votes")
async def sheets_write_round1(body: Round1VotesBody) -> JSONResponse:
    row = body.pair + 1
    tab = sheets_oauth.round1_tab()
    rng = f"{tab}!B{row}:E{row}"
    jl = body.judge_left
    jr = body.judge_right
    try:
        if jl is None or jr is None:
            existing = sheets_oauth.get_values(rng)
            r0 = existing[0] if existing else []
            if jl is None:
                jl = _sheet_int_cell(r0, 2)
            if jr is None:
                jr = _sheet_int_cell(r0, 3)
        sheets_oauth.update_range(
            rng, [[body.left, body.right, int(jl), int(jr)]]
        )
    except ValueError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(401, str(e)) from e
    return JSONResponse({"ok": True, "range": rng})


@app.post("/api/sheets/round2-votes")
async def sheets_write_round2_votes(body: Round2VotesBody) -> JSONResponse:
    rng = f"{sheets_oauth.round2_tab()}!B{body.row}"
    try:
        sheets_oauth.update_range(rng, [[body.votes]])
    except ValueError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(401, str(e)) from e
    return JSONResponse({"ok": True, "range": rng})


@app.post("/api/sheets/round2-name")
async def sheets_write_round2_name(body: Round2NameBody) -> JSONResponse:
    rng = f"{sheets_oauth.round2_tab()}!A{body.row}"
    try:
        sheets_oauth.update_range(rng, [[body.name]])
    except ValueError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(401, str(e)) from e
    return JSONResponse({"ok": True, "range": rng})


@app.post("/api/sheets/round3-score")
async def sheets_write_round3_score(body: Round3ScoreBody) -> JSONResponse:
    tab = sheets_oauth.round3_tab()
    rng = f"{tab}!B{body.row}"
    try:
        sheets_oauth.update_range(rng, [[body.score]])
    except ValueError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(401, str(e)) from e
    return JSONResponse({"ok": True, "range": rng})


@app.post("/api/sheets/round3-judge")
async def sheets_write_round3_judge(body: Round3JudgeBody) -> JSONResponse:
    tab = sheets_oauth.round3_tab()
    col_letter = "CDE"[body.judge - 1]
    rng = f"{tab}!{col_letter}{body.row}"
    try:
        sheets_oauth.update_range(rng, [[body.score]])
    except ValueError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(401, str(e)) from e
    return JSONResponse({"ok": True, "range": rng})


@app.post("/api/sheets/round3-name")
async def sheets_write_round3_name(body: Round3NameBody) -> JSONResponse:
    tab = sheets_oauth.round3_tab()
    rng = f"{tab}!A{body.row}"
    try:
        sheets_oauth.update_range(rng, [[body.name]])
    except ValueError as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(401, str(e)) from e
    return JSONResponse({"ok": True, "range": rng})


@app.websocket("/ws/display")
async def ws_display(ws: WebSocket) -> None:
    await hub.connect(ws)
    try:
        await ws.send_text(db.state_json())
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        await hub.disconnect(ws)
