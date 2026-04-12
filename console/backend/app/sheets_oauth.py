"""Google Sheets OAuth（用户授权）+ 写入。

主存储：与选手/签到相同的 SQLite（console/data/voiceofnyc.db）内表 sheets_oauth_token，
便于 Railway 等环境只挂一卷即可持久化。仍镜像写入 backend/data/google_oauth_token.json 便于本地查看。
"""
from __future__ import annotations

import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.db import _conn  # noqa: SLF001 与 checkin 等同库

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TOKEN_FILE = BACKEND_ROOT / "data" / "google_oauth_token.json"

# state -> (创建时间, PKCE code_verifier；无 PKCE 时为 None)。回调换 token 必须与授权时为同一 verifier。
_oauth_states: dict[str, tuple[float, str | None]] = {}
STATE_TTL_SEC = 600


def _cleanup_states() -> None:
    now = time.time()
    for s, entry in list(_oauth_states.items()):
        ts = entry[0]
        if now - ts > STATE_TTL_SEC:
            del _oauth_states[s]


def redirect_uri() -> str:
    return os.environ.get(
        "GOOGLE_OAUTH_REDIRECT_URI",
        "http://127.0.0.1:8765/api/sheets/oauth/callback",
    )


def client_config() -> dict[str, Any]:
    cid = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    csec = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    if not cid or not csec:
        raise ValueError(
            "请设置环境变量 GOOGLE_OAUTH_CLIENT_ID 与 GOOGLE_OAUTH_CLIENT_SECRET"
        )
    return {
        "web": {
            "client_id": cid,
            "client_secret": csec,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri()],
        }
    }


def create_flow() -> Flow:
    return Flow.from_client_config(
        client_config(),
        scopes=SCOPES,
        redirect_uri=redirect_uri(),
    )


def start_authorization_url() -> tuple[str, str]:
    """返回 (Google 授权页 URL, state)。"""
    _cleanup_states()
    state = secrets.token_urlsafe(32)
    flow = create_flow()
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    # Google / 新版库可能对 Web 客户端启用 PKCE；回调换 token 必须带上同一 code_verifier
    verifier = getattr(flow, "code_verifier", None)
    _oauth_states[state] = (time.time(), verifier)
    return url, state


def pop_oauth_state(state: str | None) -> tuple[bool, str | None]:
    """校验并消费 state，返回 (是否有效, code_verifier)。"""
    if not state:
        return False, None
    _cleanup_states()
    entry = _oauth_states.pop(state, None)
    if entry is None:
        return False, None
    ts, verifier = entry
    if time.time() - ts > STATE_TTL_SEC:
        return False, None
    return True, verifier


def exchange_code(code: str, code_verifier: str | None = None) -> None:
    flow = create_flow()
    if code_verifier:
        flow.fetch_token(code=code, code_verifier=code_verifier)
    else:
        flow.fetch_token(code=code)
    save_credentials(flow.credentials)


def ensure_oauth_store() -> None:
    """创建 OAuth 凭证表（启动时调用一次即可）。"""
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS sheets_oauth_token (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                creds_json TEXT NOT NULL
            )
            """
        )
        c.commit()


def _save_token_json_to_db(raw: str) -> None:
    ensure_oauth_store()
    with _conn() as c:
        c.execute(
            """
            INSERT INTO sheets_oauth_token (id, creds_json)
            VALUES (1, ?)
            ON CONFLICT(id) DO UPDATE SET creds_json = excluded.creds_json
            """,
            (raw,),
        )
        c.commit()


def _read_token_json() -> str | None:
    ensure_oauth_store()
    with _conn() as c:
        row = c.execute("SELECT creds_json FROM sheets_oauth_token WHERE id = 1").fetchone()
        if row and row[0]:
            return str(row[0])
    if TOKEN_FILE.is_file():
        try:
            raw = TOKEN_FILE.read_text(encoding="utf-8")
            json.loads(raw)
            _save_token_json_to_db(raw)
            return raw
        except (json.JSONDecodeError, OSError, ValueError):
            pass
    return None


def save_credentials(creds: Credentials) -> None:
    raw = creds.to_json()
    _save_token_json_to_db(raw)
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(raw, encoding="utf-8")


def load_credentials() -> Credentials | None:
    raw = _read_token_json()
    if not raw:
        return None
    try:
        info = json.loads(raw)
        creds = Credentials.from_authorized_user_info(info, SCOPES)
    except (json.JSONDecodeError, ValueError):
        return None
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        save_credentials(creds)
    return creds if creds.valid else None


def oauth_token_info() -> dict[str, Any] | None:
    """供 /api/sheets/oauth/status 使用；不触发 refresh。"""
    raw = _read_token_json()
    if not raw:
        return None
    try:
        d = json.loads(raw)
        return d if isinstance(d, dict) else None
    except json.JSONDecodeError:
        return None


def sheets_service():
    creds = load_credentials()
    if not creds:
        return None
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def spreadsheet_id() -> str:
    return os.environ.get("GOOGLE_SHEET_ID", "").strip()


def round1_tab() -> str:
    return os.environ.get("GOOGLE_SHEET_ROUND1_TAB", "Round1Audience")


def round2_tab() -> str:
    return os.environ.get("GOOGLE_SHEET_ROUND2_TAB", "Round2Audience")


def round3_tab() -> str:
    """决赛打分表（Round3Audience：A2:I7，含 H/I 观众累计）"""
    return os.environ.get("GOOGLE_SHEET_ROUND3_TAB", "Round3Audience")


def checkin_tab() -> str:
    """签到追加行（需先在表格中新建同名 Tab，首行可为表头）"""
    return os.environ.get("GOOGLE_SHEET_CHECKIN_TAB", "CheckIn").strip() or "CheckIn"


def append_rows(tab_name: str, rows: list[list[Any]]) -> None:
    """在指定工作表末尾追加若干行。"""
    if not rows:
        return
    sid = spreadsheet_id()
    if not sid:
        raise ValueError("请设置 GOOGLE_SHEET_ID")
    svc = sheets_service()
    if not svc:
        raise RuntimeError("未完成 OAuth，请先访问 GET /api/sheets/oauth/start")
    # range 仅表头锚点，append 会插到表末
    range_a1 = f"{tab_name}!A1"
    svc.spreadsheets().values().append(
        spreadsheetId=sid,
        range=range_a1,
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": rows},
    ).execute()


def update_range(range_a1: str, values: list[list[Any]]) -> None:
    sid = spreadsheet_id()
    if not sid:
        raise ValueError("请设置 GOOGLE_SHEET_ID")
    svc = sheets_service()
    if not svc:
        raise RuntimeError("未完成 OAuth，请先访问 GET /api/sheets/oauth/start")
    body = {"values": values}
    svc.spreadsheets().values().update(
        spreadsheetId=sid,
        range=range_a1,
        valueInputOption="USER_ENTERED",
        body=body,
    ).execute()


def get_values(range_a1: str) -> list[list[Any]]:
    """读取单元格，用于合并写入（如仅更新观众票时保留评委列）。"""
    sid = spreadsheet_id()
    if not sid:
        raise ValueError("请设置 GOOGLE_SHEET_ID")
    svc = sheets_service()
    if not svc:
        raise RuntimeError("未完成 OAuth，请先访问 GET /api/sheets/oauth/start")
    result = (
        svc.spreadsheets()
        .values()
        .get(spreadsheetId=sid, range=range_a1)
        .execute()
    )
    return result.get("values") or []
