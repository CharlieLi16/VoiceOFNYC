"""签到成功后的邮件（SMTP）。"""
from __future__ import annotations

import os
import smtplib
import socket
import ssl
import threading
from contextlib import contextmanager
from email.message import EmailMessage

from app.checkin_mail_labels import mail_title_and_subtitle

# Docker / Railway 等环境常无可用 IPv6 路由；解析到 AAAA 后连接会报 [Errno 101] Network is unreachable。
# 对 SMTP（smtplib 连 smtp.gmail.com 等）在连接前临时强制 IPv4。
# MAIL_OUTBOUND_IPV4=0 可关闭；兼容旧名 RESEND_FORCE_IPV4=0。
_mail_dns_lock = threading.Lock()


def _mail_force_ipv4() -> bool:
    explicit = os.environ.get("MAIL_OUTBOUND_IPV4", "").strip()
    if explicit:
        return explicit.lower() not in ("0", "false", "no")
    legacy = os.environ.get("RESEND_FORCE_IPV4", "").strip()
    if legacy:
        return legacy.lower() not in ("0", "false", "no")
    return True


@contextmanager
def _ipv4_only_getaddrinfo() -> None:
    if not _mail_force_ipv4():
        yield
        return
    with _mail_dns_lock:
        orig = socket.getaddrinfo

        def _only_inet4(
            host: str,
            port: int,
            family: int = 0,
            type: int = 0,  # noqa: A002 与 socket.getaddrinfo 参数名一致
            proto: int = 0,
            flags: int = 0,
        ) -> list:
            return orig(host, port, socket.AF_INET, type, proto, flags)

        socket.getaddrinfo = _only_inet4  # type: ignore[method-assign]
        try:
            yield
        finally:
            socket.getaddrinfo = orig  # type: ignore[method-assign]


def send_checkin_email(
    to_email: str,
    name: str,
    code: str,
    vote_links: list[tuple[str, str]],
) -> None:
    subject = os.environ.get(
        "CHECKIN_EMAIL_SUBJECT", "Voice of NYC · 签到成功 / Your vote links"
    )
    parts = [
        f"Hi {name},\n\n",
        f"感谢您参加2026 年 由TandonCSSA 主办的心动的声音 Voice of NYC。\n\n你的投票码是：{code}\n\n",
        "以下为各环节的投票链接（打开即可投票，已含投票码）：\n",
    ]
    for rid, url in vote_links:
        title, sub = mail_title_and_subtitle(rid)
        parts.append(f"\n【{title}】\n")
        if sub:
            parts.append(f"{sub}\n")
        parts.append(f"{url}\n")
    parts.append("\n请保存本邮件；现场也可向工作人员求助。\n— TandonCSSA\n")
    body = "".join(parts)

    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    if smtp_host:
        user = os.environ.get("SMTP_USER", "").strip()
        password = os.environ.get("SMTP_PASSWORD", "").strip()
        port = int(os.environ.get("SMTP_PORT", "587"))
        use_tls = os.environ.get("SMTP_TLS", "1").strip() not in ("0", "false", "no")
        from_addr = os.environ.get("SMTP_FROM", user).strip()
        smtp_timeout = float(os.environ.get("SMTP_TIMEOUT_SEC", "45").strip() or "45")
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to_email
        msg.set_content(body)
        with _ipv4_only_getaddrinfo():
            if port == 465:
                context = ssl.create_default_context()
                with smtplib.SMTP_SSL(smtp_host, port, timeout=smtp_timeout, context=context) as smtp:
                    if user:
                        smtp.login(user, password)
                    smtp.send_message(msg)
            else:
                with smtplib.SMTP(smtp_host, port, timeout=smtp_timeout) as smtp:
                    if use_tls:
                        smtp.starttls(context=ssl.create_default_context())
                    if user:
                        smtp.login(user, password)
                    smtp.send_message(msg)
        return

    raise RuntimeError("未配置邮件：请设置 SMTP_HOST、SMTP_USER、SMTP_PASSWORD 等（见 .env.example）")
