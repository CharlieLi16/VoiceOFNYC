/**
 * Google 表「观众柱」读取范围 —— 日常改这里即可，不必写进 .env。
 * 布局说明：console/docs/README-audience-vote.md
 *
 * Round1：表里整块常是 A1:E6（第 1 行表头），API **必须** 拉 **A2:E6**（含 A～E 五列、共 5 行数据），
 * 与 `parseRound1PairTotalsFromRow` 约定一致：每行 A=组次，B～E=票。
 */
export const ROUND1_AUDIENCE_SHEET_NAME = "Round1Audience";
/** 相对该 Tab：五轮数据区（第 1 行表头不占本范围） */
export const ROUND1_AUDIENCE_DATA_A1 = "A2:E6";
export const DEFAULT_ROUND1_AUDIENCE_RANGE = `${ROUND1_AUDIENCE_SHEET_NAME}!${ROUND1_AUDIENCE_DATA_A1}`;
export const DEFAULT_ROUND2_AUDIENCE_RANGE = "Round2Audience!A2:B7";

/**
 * 决赛打分（与复活投票 Round2 分离）：
 * A 姓名 · B 观众均分（公式=H/I）· C/D/E 评委 · F/G 公式 · H/I 观众打分累计/人次（投票页写入）
 */
export const ROUND3_AUDIENCE_SHEET_NAME = "Round3Audience";
export const DEFAULT_ROUND3_AUDIENCE_RANGE = `${ROUND3_AUDIENCE_SHEET_NAME}!A2:I7`;

/** `/stage/final-reveal` 默认读 Round3；可用 `VITE_FINAL_AUDIENCE_RANGE` 覆盖 */
export const DEFAULT_FINAL_AUDIENCE_RANGE = DEFAULT_ROUND3_AUDIENCE_RANGE;
export const DEFAULT_AUDIENCE_POLL_MS = 5_000;
