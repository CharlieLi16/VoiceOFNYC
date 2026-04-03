"""SQLite：选手与算分（总分 = 观众/2 + 评委均值/6，与 assets/js/backend.js 一致）。"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = ROOT / "data" / "voiceofnyc.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def _safe_float(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    if isinstance(v, (int, float)):
        x = float(v)
    else:
        s = str(v).strip()
        if not s:
            return default
        try:
            x = float(s)
        except ValueError:
            return default
    if x != x or x in (float("inf"), float("-inf")):  # NaN / inf
        return default
    return x


IMG_CONTESTANTS_PREFIX = "/img/contestants/"


def normalize_public_contestant_img(value: Any) -> str:
    """
    导入时：仅写文件名（如 1.jpg）则补全为 /img/contestants/1.jpg。
    已是 http(s) URL、或站内其它绝对路径（以 / 开头且非本目录）则原样保留。
    """
    s = str(value or "").strip()
    if not s:
        return ""
    low = s.lower()
    if low.startswith("http://") or low.startswith("https://"):
        return s
    # 常见拼写错误 contestsants → contestants
    typo = "/img/contestsants/"
    if low.startswith(typo):
        rest = s[len(typo) :].lstrip("/")
        return (IMG_CONTESTANTS_PREFIX + rest) if rest else ""
    if s.startswith("/img/contestants/"):
        return s
    if s.startswith("/"):
        return s
    rel = s.replace("\\", "/")
    while rel.startswith("./"):
        rel = rel[2:]
    parts = [p for p in rel.split("/") if p and p != "."]
    if any(p == ".." for p in parts):
        parts = [parts[-1]] if parts else []
    tail = "/".join(parts)
    if not tail:
        return ""
    return IMG_CONTESTANTS_PREFIX + tail


def compute_total(judges_avg: float, audience: float) -> float:
    """total = audience/2 + judges_avg/6"""
    return round(audience / 2.0 + judges_avg / 6.0, 2)


def contestant_count() -> int:
    with _conn() as c:
        return int(c.execute("SELECT COUNT(*) FROM contestants").fetchone()[0])


def init_db() -> None:
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS contestants (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                img TEXT NOT NULL DEFAULT '',
                song TEXT NOT NULL DEFAULT '',
                song_two TEXT NOT NULL DEFAULT '',
                judges REAL NOT NULL DEFAULT 0,
                audience REAL NOT NULL DEFAULT 0,
                total REAL NOT NULL DEFAULT 0,
                ranking INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS round1_pair_meta (
                pair_num INTEGER PRIMARY KEY CHECK (pair_num >= 1 AND pair_num <= 5),
                left_name TEXT NOT NULL DEFAULT '',
                right_name TEXT NOT NULL DEFAULT '',
                left_img TEXT NOT NULL DEFAULT '',
                right_img TEXT NOT NULL DEFAULT ''
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS round2_lineup_meta (
                slot_num INTEGER PRIMARY KEY CHECK (slot_num >= 1 AND slot_num <= 6),
                name TEXT NOT NULL DEFAULT '',
                img TEXT NOT NULL DEFAULT ''
            )
            """
        )
        c.commit()
    _migrate_contestants_juges_to_judges()
    _migrate_drop_musicians_column()


def _recalc_all_contestant_totals() -> None:
    with _conn() as c:
        rows = c.execute("SELECT id, judges, audience FROM contestants").fetchall()
        for r in rows:
            tid = int(r["id"])
            j = float(r["judges"])
            a = float(r["audience"])
            t = compute_total(j, a)
            c.execute("UPDATE contestants SET total = ? WHERE id = ?", (t, tid))
        c.commit()


def _migrate_drop_musicians_column() -> None:
    """删除 musicians 列并按新公式重算 total。"""
    with _conn() as c:
        info = c.execute("PRAGMA table_info(contestants)").fetchall()
        if not info:
            return
        names = {str(row[1]) for row in info}
        if "musicians" not in names:
            return
        try:
            c.execute("ALTER TABLE contestants DROP COLUMN musicians")
            c.commit()
        except sqlite3.OperationalError:
            c.executescript(
                """
                BEGIN;
                CREATE TABLE contestants_new (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '',
                    img TEXT NOT NULL DEFAULT '',
                    song TEXT NOT NULL DEFAULT '',
                    song_two TEXT NOT NULL DEFAULT '',
                    judges REAL NOT NULL DEFAULT 0,
                    audience REAL NOT NULL DEFAULT 0,
                    total REAL NOT NULL DEFAULT 0,
                    ranking INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO contestants_new
                  (id, name, img, song, song_two, judges, audience, total, ranking)
                SELECT id, name, img, song, song_two, judges, audience, total, ranking
                FROM contestants;
                DROP TABLE contestants;
                ALTER TABLE contestants_new RENAME TO contestants;
                COMMIT;
                """
            )
    _recalc_all_contestant_totals()


def _migrate_contestants_juges_to_judges() -> None:
    """旧库列名 juges → judges（SQLite 3.25+ RENAME COLUMN；更旧版本整表拷贝）。"""
    with _conn() as c:
        info = c.execute("PRAGMA table_info(contestants)").fetchall()
        if not info:
            return
        names = {str(row[1]) for row in info}
        if "judges" in names:
            return
        if "juges" not in names:
            return
        try:
            c.execute("ALTER TABLE contestants RENAME COLUMN juges TO judges")
            c.commit()
        except sqlite3.OperationalError:
            c.executescript(
                """
                BEGIN;
                CREATE TABLE contestants_new (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL DEFAULT '',
                    img TEXT NOT NULL DEFAULT '',
                    song TEXT NOT NULL DEFAULT '',
                    song_two TEXT NOT NULL DEFAULT '',
                    judges REAL NOT NULL DEFAULT 0,
                    musicians REAL NOT NULL DEFAULT 0,
                    audience REAL NOT NULL DEFAULT 0,
                    total REAL NOT NULL DEFAULT 0,
                    ranking INTEGER NOT NULL DEFAULT 0
                );
                INSERT INTO contestants_new
                  (id, name, img, song, song_two, judges, musicians, audience, total, ranking)
                SELECT id, name, img, song, song_two, juges, musicians, audience, total, ranking
                FROM contestants;
                DROP TABLE contestants;
                ALTER TABLE contestants_new RENAME TO contestants;
                COMMIT;
                """
            )


def round1_pair_meta_count() -> int:
    with _conn() as c:
        return int(c.execute("SELECT COUNT(*) FROM round1_pair_meta").fetchone()[0])


def get_round1_pairs() -> list[dict[str, Any]]:
    """5 条，顺序对应第 1～5 对，API 字段 leftName / rightName / leftImg / rightImg。"""
    with _conn() as c:
        rows = {
            int(r["pair_num"]): r
            for r in c.execute(
                "SELECT pair_num, left_name, right_name, left_img, right_img FROM round1_pair_meta ORDER BY pair_num"
            )
        }
    out: list[dict[str, Any]] = []
    for n in range(1, 6):
        r = rows.get(n)
        if r:
            out.append(
                {
                    "leftName": str(r["left_name"] or ""),
                    "rightName": str(r["right_name"] or ""),
                    "leftImg": str(r["left_img"] or ""),
                    "rightImg": str(r["right_img"] or ""),
                }
            )
        else:
            out.append(
                {
                    "leftName": "",
                    "rightName": "",
                    "leftImg": "",
                    "rightImg": "",
                }
            )
    return out


def replace_round1_pairs(pairs: list[dict[str, Any]]) -> None:
    if len(pairs) != 5:
        raise ValueError("pairs 必须为长度 5 的数组")
    with _conn() as c:
        c.execute("DELETE FROM round1_pair_meta")
        for i, p in enumerate(pairs):
            n = i + 1
            c.execute(
                """
                INSERT INTO round1_pair_meta (pair_num, left_name, right_name, left_img, right_img)
                VALUES (?,?,?,?,?)
                """,
                (
                    n,
                    str(p.get("leftName", "") or ""),
                    str(p.get("rightName", "") or ""),
                    normalize_public_contestant_img(p.get("leftImg", "") or ""),
                    normalize_public_contestant_img(p.get("rightImg", "") or ""),
                ),
            )
        c.commit()


# 选手 1–10：第 k 位照片统一为 /img/contestants/{k}.jpg（由 scripts/setup-contestant-photos-1-10.sh 生成）
# 五对 PK：对 n 为选手 (2n-1) vs (2n)
ROUND1_PAIRS_NUMBERED_DEFAULTS: list[dict[str, Any]] = [
    {
        "leftName": "Danting",
        "rightName": "Aurora 四岁",
        "leftImg": "/img/contestants/1.jpg",
        "rightImg": "/img/contestants/2.jpg",
    },
    {
        "leftName": "刘佳希",
        "rightName": "王梓骏",
        "leftImg": "/img/contestants/3.jpg",
        "rightImg": "/img/contestants/4.jpg",
    },
    {
        "leftName": "张运骄JoJo",
        "rightName": "Sean程嘉禾",
        "leftImg": "/img/contestants/5.jpg",
        "rightImg": "/img/contestants/6.jpg",
    },
    {
        "leftName": "Elvin",
        "rightName": "安德烈",
        "leftImg": "/img/contestants/7.jpg",
        "rightImg": "/img/contestants/8.jpg",
    },
    {
        "leftName": "白子旭",
        "rightName": "吴谦",
        "leftImg": "/img/contestants/9.jpg",
        "rightImg": "/img/contestants/10.jpg",
    },
]


def seed_round1_pairs_numbered_defaults() -> None:
    """写入内置五组（姓名 + /img/contestants/1.jpg … 10.jpg）。"""
    replace_round1_pairs(list(ROUND1_PAIRS_NUMBERED_DEFAULTS))


def seed_round1_pairs_from_public_files() -> bool:
    """从 console/frontend/public/stage/round1/{1..5}.json 读入并写入 DB；仅当 5 个文件都存在且可解析时返回 True。"""
    base = ROOT / "frontend" / "public" / "stage" / "round1"
    pairs: list[dict[str, Any]] = []
    for n in range(1, 6):
        path = base / f"{n}.json"
        if not path.is_file():
            return False
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return False
        if not isinstance(raw, dict):
            return False
        pairs.append(
            {
                "leftName": str(raw.get("leftName", "") or ""),
                "rightName": str(raw.get("rightName", "") or ""),
                "leftImg": str(raw.get("leftImg", "") or ""),
                "rightImg": str(raw.get("rightImg", "") or ""),
            }
        )
    replace_round1_pairs(pairs)
    return True


def round2_lineup_meta_count() -> int:
    with _conn() as c:
        return int(c.execute("SELECT COUNT(*) FROM round2_lineup_meta").fetchone()[0])


def get_round2_lineup() -> list[dict[str, Any]]:
    """6 条，顺序 slot 1～6；API 字段 name、img（camelCase 与 JSON 一致）。"""
    with _conn() as c:
        rows = {
            int(r["slot_num"]): r
            for r in c.execute(
                "SELECT slot_num, name, img FROM round2_lineup_meta ORDER BY slot_num"
            )
        }
    out: list[dict[str, Any]] = []
    for n in range(1, 7):
        r = rows.get(n)
        if r:
            out.append(
                {
                    "name": str(r["name"] or ""),
                    "img": str(r["img"] or ""),
                }
            )
        else:
            out.append({"name": "", "img": ""})
    return out


def replace_round2_lineup(slots: list[dict[str, Any]]) -> None:
    if len(slots) != 6:
        raise ValueError("slots 必须为长度 6 的数组")
    with _conn() as c:
        c.execute("DELETE FROM round2_lineup_meta")
        for i, p in enumerate(slots):
            n = i + 1
            c.execute(
                """
                INSERT INTO round2_lineup_meta (slot_num, name, img)
                VALUES (?,?,?)
                """,
                (
                    n,
                    str(p.get("name", "") or ""),
                    normalize_public_contestant_img(p.get("img", "") or ""),
                ),
            )
        c.commit()


def seed_round2_lineup_from_public_files() -> bool:
    """从 console/frontend/public/stage/round2/{1..6}.json 读入；须 6 个文件均可解析。"""
    base = ROOT / "frontend" / "public" / "stage" / "round2"
    slots: list[dict[str, Any]] = []
    for n in range(1, 7):
        path = base / f"{n}.json"
        if not path.is_file():
            return False
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return False
        if not isinstance(raw, dict):
            return False
        slots.append(
            {
                "name": str(raw.get("name", "") or ""),
                "img": str(raw.get("img", "") or ""),
            }
        )
    replace_round2_lineup(slots)
    return True


def seed_round2_lineup_empty_defaults() -> None:
    """占位 6 行（无图），便于 Admin 编辑。"""
    replace_round2_lineup([{"name": f"选手 {i}", "img": ""} for i in range(1, 7)])


def _finite_num_str(v: Any) -> str:
    x = _safe_float(v, 0.0)
    return str(x)


def _row_to_dict(r: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": r["id"],
        "name": r["name"],
        "img": r["img"],
        "song": r["song"],
        "songTwo": r["song_two"],
        "judges": _finite_num_str(r["judges"]),
        "audience": _finite_num_str(r["audience"]),
        "total": _finite_num_str(r["total"]),
        "ranking": r["ranking"],
    }


def _all_rows_unordered() -> list[sqlite3.Row]:
    with _conn() as c:
        cur = c.execute(
            "SELECT id, name, img, song, song_two, judges, audience, total, ranking FROM contestants ORDER BY id"
        )
        return cur.fetchall()


def recalc_and_persist_rankings() -> None:
    rows = _all_rows_unordered()
    sorted_ids = sorted(
        range(len(rows)),
        key=lambda i: _safe_float(rows[i]["total"], 0.0),
        reverse=True,
    )
    id_to_rank = {}
    for rank, idx in enumerate(sorted_ids):
        id_to_rank[rows[idx]["id"]] = rank
    with _conn() as c:
        for cid, rnk in id_to_rank.items():
            c.execute("UPDATE contestants SET ranking = ? WHERE id = ?", (rnk, cid))
        c.commit()


def all_contestants_by_id() -> list[dict[str, Any]]:
    rows = _all_rows_unordered()
    return [_row_to_dict(r) for r in rows]


def ranked_contestants() -> list[dict[str, Any]]:
    rows = _all_rows_unordered()
    items = [_row_to_dict(r) for r in rows]
    items.sort(key=lambda x: _safe_float(x["total"], 0.0), reverse=True)
    return items


def state_payload() -> dict[str, Any]:
    by_id = all_contestants_by_id()
    ranked = ranked_contestants()
    return {"contestants": by_id, "ranked": ranked}


def state_json() -> str:
    return json.dumps(state_payload(), ensure_ascii=False)


def update_scores(
    contestant_id: int,
    *,
    judges_avg: float | None = None,
    audience: float | None = None,
) -> bool:
    with _conn() as c:
        cur = c.execute(
            "SELECT judges, audience FROM contestants WHERE id = ?",
            (contestant_id,),
        )
        row = cur.fetchone()
        if not row:
            return False
        j = float(judges_avg) if judges_avg is not None else float(row["judges"])
        a = float(audience) if audience is not None else float(row["audience"])
        total = compute_total(j, a)
        c.execute(
            "UPDATE contestants SET judges = ?, audience = ?, total = ? WHERE id = ?",
            (j, a, total, contestant_id),
        )
        c.commit()
    recalc_and_persist_rankings()
    return True


def import_contestants(payload: list[dict[str, Any]]) -> None:
    with _conn() as c:
        c.execute("DELETE FROM contestants")
        for row in payload:
            if not isinstance(row, dict):
                raise TypeError(f"选手项须为对象，收到: {type(row).__name__}")
            if "id" not in row:
                raise ValueError("每位选手须包含 id 字段")
            cid = int(row["id"])
            name = str(row.get("name", ""))
            img = normalize_public_contestant_img(row.get("img", ""))
            song = str(row.get("song", ""))
            st = str(row.get("songTwo", row.get("song_two", "")))
            j = _safe_float(row.get("judges", row.get("juges", 0)), 0.0)
            a = _safe_float(row.get("audience", 0), 0.0)
            total = compute_total(j, a)
            rnk = int(_safe_float(row.get("ranking", 0), 0.0))
            c.execute(
                """
                INSERT INTO contestants (id, name, img, song, song_two, judges, audience, total, ranking)
                VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (cid, name, img, song, st, j, a, total, rnk),
            )
        c.commit()
    recalc_and_persist_rankings()
