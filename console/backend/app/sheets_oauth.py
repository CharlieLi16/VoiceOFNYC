"""Google Sheets OAuth（用户授权）+ 写入。令牌存 backend/data/google_oauth_token.json。"""
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

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TOKEN_FILE = BACKEND_ROOT / "data" / "google_oauth_token.json"

_oauth_states: dict[str, float] = {}
STATE_TTL_SEC = 600


def _cleanup_states() -> None:
    now = time.time()
    for s, t in list(_oauth_states.items()):
        if now - t > STATE_TTL_SEC:
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
    _oauth_states[state] = time.time()
    flow = create_flow()
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    return url, state


def consume_state(state: str | None) -> bool:
    if not state:
        return False
    _cleanup_states()
    if state not in _oauth_states:
        return False
    del _oauth_states[state]
    return True


def exchange_code(code: str) -> None:
    flow = create_flow()
    flow.fetch_token(code=code)
    save_credentials(flow.credentials)


def save_credentials(creds: Credentials) -> None:
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")


def load_credentials() -> Credentials | None:
    if not TOKEN_FILE.is_file():
        return None
    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
    except (json.JSONDecodeError, ValueError):
        return None
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        save_credentials(creds)
    return creds if creds.valid else None


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
