import {
  DEFAULT_AUDIENCE_POLL_MS,
  DEFAULT_FINAL_AUDIENCE_RANGE,
  DEFAULT_ROUND1_AUDIENCE_RANGE,
  DEFAULT_ROUND2_AUDIENCE_RANGE,
} from "./audienceSheetRanges";

/** Google 观众投票拉取：范围与轮询间隔见 audienceSheetRanges.ts；.env 只放表格 ID 与 API Key */
export function getSheetsPollConfig() {
  return {
    sheetId: import.meta.env.VITE_GOOGLE_SHEET_ID ?? "",
    apiKey: import.meta.env.VITE_GOOGLE_SHEETS_API_KEY ?? "",
    round1AudienceRange: DEFAULT_ROUND1_AUDIENCE_RANGE,
    round2AudienceRange: DEFAULT_ROUND2_AUDIENCE_RANGE,
    finalAudienceRange: DEFAULT_FINAL_AUDIENCE_RANGE,
    pollMs: DEFAULT_AUDIENCE_POLL_MS,
  };
}
