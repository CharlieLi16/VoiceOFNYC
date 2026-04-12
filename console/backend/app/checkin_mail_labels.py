"""签到邮件里各环节展示用中文标题（不展示 roundId 技术名）。初赛可附「谁 vs 谁 · 曲目」。"""
from __future__ import annotations

# roundId -> (中文标题, 副标题一行；副标题可为 None)
# 初赛五组对阵与 public/vote/vote-config.js round1PkByRoundId（选手 1～10 /img）一致；
# 每人第一轮曲目与 public/data/seed-contestants.json 的 song 字段一致。
_CHECKIN_ROUND_MAIL: dict[str, tuple[str, str | None]] = {
    "round1_pk_1": ("初赛第一轮", "Siwei《可乐》 vs 蔡彦培《相爱后动物感伤》"),
    "round1_pk_2": ("初赛第二轮", "Julian Zhu《动物世界》 vs Mandy《你把我灌醉》"),
    "round1_pk_3": ("初赛第三轮", "赵星童《等待》 vs coco林小妍《失落沙洲》"),
    "round1_pk_4": ("初赛第四轮", "吴子涵《嘉宾》 vs Timmy Zihan Ma《Try Everything》"),
    "round1_pk_5": ("初赛第五轮", "刘佳希《Dear Friend》 vs Hazel Jia《I wish you love》"),
    "round2_revival": ("复活投票", None),
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
