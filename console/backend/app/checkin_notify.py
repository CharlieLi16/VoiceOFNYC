"""签到成功后的邮件（Resend 或 SMTP）。"""
from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage

import httpx

from app.checkin_mail_labels import mail_title_and_subtitle


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
        f"感谢您参加2026 年 由Tandon CSSA 主办的心动的声音 Voice of NYC。\n\n你的投票码是：{code}\n\n",
        "以下为各环节的投票链接（打开即可投票，已含投票码）：\n",
    ]
    for rid, url in vote_links:
        title, sub = mail_title_and_subtitle(rid)
        parts.append(f"\n【{title}】\n")
        if sub:
            parts.append(f"{sub}\n")
        parts.append(f"{url}\n")
    parts.append("\n请保存本邮件；现场也可向工作人员求助。\n— Voice of NYC\n")
    body = "".join(parts)
    resend_key = os.environ.get("RESEND_API_KEY", "").strip()
    if resend_key:
        from_addr = os.environ.get("RESEND_FROM", "").strip()
        if not from_addr:
            raise RuntimeError("已设置 RESEND_API_KEY 但未设置 RESEND_FROM（发件人邮箱）")
        r = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
            json={
                "from": from_addr,
                "to": [to_email],
                "subject": subject,
                "text": body,
            },
            timeout=30.0,
        )
        r.raise_for_status()
        return

    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    if smtp_host:
        user = os.environ.get("SMTP_USER", "").strip()
        password = os.environ.get("SMTP_PASSWORD", "").strip()
        port = int(os.environ.get("SMTP_PORT", "587"))
        use_tls = os.environ.get("SMTP_TLS", "1").strip() not in ("0", "false", "no")
        from_addr = os.environ.get("SMTP_FROM", user).strip()
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to_email
        msg.set_content(body)
        if port == 465:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(smtp_host, port, context=context) as smtp:
                if user:
                    smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, port) as smtp:
                if use_tls:
                    smtp.starttls(context=ssl.create_default_context())
                if user:
                    smtp.login(user, password)
                smtp.send_message(msg)
        return

    raise RuntimeError("未配置邮件：请设置 RESEND_API_KEY+RESEND_FROM，或 SMTP_HOST 等")
