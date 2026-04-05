/**
 * fetch 在静态托管上常误拿到 index.html（仍 200 OK），直接 res.json() 会报
 * Unexpected token '<'. 先读 body 再解析，并给出可操作的错误说明。
 */

const HTML_HINT =
  "收到 HTML 网页而不是 JSON。常见于：未设置 VITE_API_BASE，/api 请求落到前端 index.html；或 JSON 静态资源路径错误。构建时设置 VITE_API_BASE 指向后端根 URL，并在托管平台为 /api 配置反向代理。";

export async function parseResponseAsJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const start = text.trimStart();
  if (start.startsWith("<")) {
    throw new Error(HTML_HINT);
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`JSON 解析失败：${String(e)}`);
  }
}

/** 不抛 SyntaxError：非 ok、HTML 正文或非法 JSON 时返回 null */
export async function tryParseResponseJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  const text = await res.text();
  const start = text.trimStart();
  if (start.startsWith("<")) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
