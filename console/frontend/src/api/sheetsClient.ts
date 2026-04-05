export type SheetValuesResponse = {
  values?: string[][];
  error?: { message?: string; status?: string };
};

export async function fetchSheetRange(
  sheetId: string,
  apiKey: string,
  range: string
): Promise<SheetValuesResponse> {
  const enc = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${enc}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  const text = await res.text();
  const start = text.trimStart();
  if (start.startsWith("<")) {
    return {
      error: {
        message:
          "Sheets 请求返回了 HTML 而非 JSON（常见于代理/网络拦截）。请检查 API Key、表格 ID 与网络。",
      },
    };
  }
  try {
    return JSON.parse(text) as SheetValuesResponse;
  } catch {
    return { error: { message: "无法解析 Google Sheets 响应" } };
  }
}

export function parseIntCell(v: unknown): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** 决赛总分等小数格：去逗号后 parseFloat，非法为 0 */
export function parseFloatCell(v: unknown): number {
  const raw = String(v ?? "").trim().replace(/,/g, "");
  const x = parseFloat(raw);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Round1 一行：固定 **A 组次（仅占位）+ B 观众左 + C 观众右 + D 评委左 + E 评委右**。
 * 与 `Round1Audience!A2:E6` 及 setup-audience-sheets.gs 模板一致。行尾空格 API 会省略，用下标读即可。
 */
export function parseRound1PairTotalsFromRow(r: unknown[] | undefined): [number, number] {
  if (!r || r.length === 0) return [0, 0];
  const g = (i: number) => parseIntCell(r[i]);
  return [g(1) + g(3)*10, g(2) + g(4)*10];
}
