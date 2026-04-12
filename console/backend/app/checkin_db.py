"""签到：从票码池分配码、记录已发（SQLite，与 console/data 同库）。"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from app.db import ROOT, _conn  # noqa: SLF001 同库

# 与 console/frontend/public/vote/vote-app.js ALLOWED_ROUND_IDS 一致（默认每人邮件含各轮一条链接）
DEFAULT_CHECKIN_ROUND_IDS: tuple[str, ...] = (
    "round1_pk_1",
    "round1_pk_2",
    "round1_pk_3",
    "round1_pk_4",
    "round1_pk_5",
    "round2_revival",
    "final_perf_1",
    "final_perf_2",
    "final_perf_3",
    "final_perf_4",
    "final_perf_5",
    "final_perf_6",
)


class CheckinDuplicateEmailError(Exception):
    pass


class CheckinPoolExhaustedError(Exception):
    pass


def _default_csv_path() -> Path:
    return ROOT / "firebase-vote" / "data" / "vote-codes.csv"


def _parse_codes_from_csv_text(raw: str) -> list[str]:
    codes: list[str] = []
    header_skipped = False
    for line in raw.splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        if t.lower() == "code" and not header_skipped:
            header_skipped = True
            continue
        code = t
        if "," in t:
            first = t.split(",")[0].strip()
            if first.lower() != "code":
                code = first
        code = code.replace(" ", "").upper()
        if code:
            codes.append(code)
    return codes


def init_checkin_tables() -> None:
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS checkin_pool (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE
            )
            """
        )
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS checkin_issued (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL COLLATE NOCASE,
                phone TEXT NOT NULL DEFAULT '',
                code TEXT NOT NULL,
                vote_url TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                pool_id INTEGER
            )
            """
        )
        c.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_issued_email ON checkin_issued(email)"
        )
        c.commit()


def _migrate_checkin_issued_pool_id() -> None:
    """旧库补全 pool_id，并按 pool 行顺序发码（等价于 list 下标递增占用下一行）。"""
    with _conn() as c:
        cols = {row[1] for row in c.execute("PRAGMA table_info(checkin_issued)")}
        if "pool_id" not in cols:
            c.execute("ALTER TABLE checkin_issued ADD COLUMN pool_id INTEGER")
            c.commit()
            cols.add("pool_id")
        c.execute(
            """
            UPDATE checkin_issued
            SET pool_id = (
                SELECT id FROM checkin_pool WHERE checkin_pool.code = checkin_issued.code
            )
            WHERE pool_id IS NULL
            """
        )
        c.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_checkin_issued_pool_id
            ON checkin_issued(pool_id) WHERE pool_id IS NOT NULL
            """
        )
        c.commit()


def seed_checkin_pool_if_empty() -> int:
    """若票池为空则从 CHECKIN_CODES_CSV 导入。返回插入条数。"""
    raw_path = os.environ.get("CHECKIN_CODES_CSV", "").strip()
    path = Path(raw_path) if raw_path else _default_csv_path()
    if not path.is_file():
        return 0
    with _conn() as c:
        n = c.execute("SELECT COUNT(*) FROM checkin_pool").fetchone()[0]
        if n > 0:
            return 0
        text = path.read_text(encoding="utf-8")
        codes = _parse_codes_from_csv_text(text)
        inserted = 0
        for code in codes:
            try:
                c.execute("INSERT INTO checkin_pool (code) VALUES (?)", (code,))
                inserted += 1
            except sqlite3.IntegrityError:
                pass
        c.commit()
        return inserted


def ensure_checkin_migrations() -> None:
    """启动时调用：补迁移。"""
    _migrate_checkin_issued_pool_id()


def build_vote_url(base: str, round_id: str, code: str) -> str:
    u = base.strip().rstrip("/")
    if "://" not in u:
        u = "https://" + u
    p = urlparse(u)
    pairs = dict(parse_qsl(p.query, keep_blank_values=True))
    pairs["roundId"] = round_id.strip()
    pairs["voteCode"] = code
    return urlunparse(p._replace(query=urlencode(pairs)))


def vote_round_ids_for_checkin() -> list[str]:
    """环境变量 VOTE_CHECKIN_ROUND_IDS（逗号分隔）优先；否则 VOTE_CHECKIN_ROUND_ID 单值；再否则默认全轮次。"""
    raw = os.environ.get("VOTE_CHECKIN_ROUND_IDS", "").strip()
    if raw:
        return [x.strip() for x in raw.split(",") if x.strip()]
    legacy = os.environ.get("VOTE_CHECKIN_ROUND_ID", "").strip()
    if legacy:
        return [legacy]
    return list(DEFAULT_CHECKIN_ROUND_IDS)


def format_vote_urls_for_storage(links: list[tuple[str, str]]) -> str:
    """写入 Sheet / DB 一列：每轮两行 roundId + URL，空行分隔。"""
    parts: list[str] = []
    for rid, url in links:
        parts.append(f"{rid}\n{url}")
    return "\n\n".join(parts)


def allocate_checkin(
    *,
    name: str,
    email: str,
    phone: str,
    vote_page_base: str,
    vote_round_ids: list[str],
) -> tuple[str, list[tuple[str, str]], str]:
    """
    原子分配一条码并写入 checkin_issued。
    返回 (code, vote_links[(roundId, url)...], vote_url 列存储文本)。
    """
    name = name.strip()
    email_n = email.strip().lower()
    phone = phone.strip()
    if not name or not email_n:
        raise ValueError("name 与 email 必填")
    if not vote_round_ids:
        raise ValueError("vote_round_ids 不能为空")

    with _conn() as c:
        c.execute("BEGIN IMMEDIATE")
        try:
            dup = c.execute(
                "SELECT 1 FROM checkin_issued WHERE lower(email) = ?",
                (email_n,),
            ).fetchone()
            if dup:
                raise CheckinDuplicateEmailError()

            # 按 CSV 导入顺序（checkin_pool.id 升序）取第一个尚未发出的码，等价于 list 里依次 +1
            row = c.execute(
                """
                SELECT p.id, p.code FROM checkin_pool p
                WHERE NOT EXISTS (
                    SELECT 1 FROM checkin_issued i WHERE i.code = p.code
                )
                ORDER BY p.id
                LIMIT 1
                """
            ).fetchone()
            if not row:
                raise CheckinPoolExhaustedError()

            pool_id = int(row[0])
            code = str(row[1])
            vote_links = [
                (rid.strip(), build_vote_url(vote_page_base, rid.strip(), code))
                for rid in vote_round_ids
                if rid.strip()
            ]
            if not vote_links:
                raise ValueError("vote_round_ids 解析后为空")
            stored = format_vote_urls_for_storage(vote_links)
            c.execute(
                """
                INSERT INTO checkin_issued (name, email, phone, code, vote_url, pool_id)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (name, email_n, phone, code, stored, pool_id),
            )
            c.commit()
            return code, vote_links, stored
        except (CheckinDuplicateEmailError, CheckinPoolExhaustedError):
            c.rollback()
            raise
        except sqlite3.IntegrityError as e:
            c.rollback()
            if "email" in str(e).lower() or "unique" in str(e).lower():
                raise CheckinDuplicateEmailError() from e
            raise
        except Exception:
            c.rollback()
            raise


def revoke_issued_by_code(code: str) -> None:
    """Sheet 或邮件失败时释放已占用的码（删除签到记录，码可再次被分配）。"""
    with _conn() as c:
        c.execute("DELETE FROM checkin_issued WHERE code = ?", (code,))
        c.commit()
