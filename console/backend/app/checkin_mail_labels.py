"""签到邮件里各环节展示用中文标题（不展示 roundId 技术名）。初赛可附「谁 vs 谁 · 曲目」。"""
from __future__ import annotations

# roundId -> (中文标题, 副标题一行；副标题可为 None)
# 初赛对阵默认与 public/vote/vote-config.js round1PkByRoundId 的 label 一致；请按现场改姓名与《歌名》。
_CHECKIN_ROUND_MAIL: dict[str, tuple[str, str | None]] = {
    "round1_pk_1": ("初赛第一轮", "选手 1 vs 选手 2 · 《请改为本组曲目》"),
    "round1_pk_2": ("初赛第二轮", "选手 3 vs 选手 4 · 《请改为本组曲目》"),
    "round1_pk_3": ("初赛第三轮", "选手 5 vs 选手 6 · 《请改为本组曲目》"),
    "round1_pk_4": ("初赛第四轮", "选手 7 vs 选手 8 · 《请改为本组曲目》"),
    "round1_pk_5": ("初赛第五轮", "选手 9 vs 选手 10 · 《请改为本组曲目》"),
    "round2_revival": ("复活赛", None),
    "final_perf_1": ("决赛第一轮", None),
    "final_perf_2": ("决赛第二轮", None),
    "final_perf_3": ("决赛第三轮", None),
    "final_perf_4": ("决赛第四轮", None),
    "final_perf_5": ("决赛第五轮", None),
    "final_perf_6": ("决赛第六轮", None),
}


def mail_title_and_subtitle(round_id: str) -> tuple[str, str | None]:
    """返回 (邮件里显示的环节标题, 副标题)。未知 roundId 时退回技术 id，避免丢链接。"""
    rid = round_id.strip()
    if rid in _CHECKIN_ROUND_MAIL:
        return _CHECKIN_ROUND_MAIL[rid]
    return (rid, None)
