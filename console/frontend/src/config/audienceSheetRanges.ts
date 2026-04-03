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
/** `/stage/final-reveal` 用；默认与复活投票（`round2AudienceRange`）同表；要单独 Tab 时改成例如 FinalAudience!A2:B7 */
export const DEFAULT_FINAL_AUDIENCE_RANGE = DEFAULT_ROUND2_AUDIENCE_RANGE;
export const DEFAULT_AUDIENCE_POLL_MS = 15_000;
