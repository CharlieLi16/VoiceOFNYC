import type { Round1PairMeta, Round2LineupSlot, StatePayload } from "./types";

/** 静态托管前端时设为后端根地址，例如 http://127.0.0.1:8765（须与后端 CORS 一致） */
const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readError(res: Response): Promise<string> {
  const t = await res.text();
  if (!t) return `HTTP ${res.status}`;
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    if (j.detail != null) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
  } catch {
    /* not JSON */
  }
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

export async function fetchState(): Promise<StatePayload> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/state"));
  } catch (e) {
    throw new Error(
      `无法连接后端（${apiUrl("/api/state")}）。请确认已启动 uvicorn，且开发时用 npm run dev；静态托管时请设置 VITE_API_BASE。 ${String(e)}`
    );
  }
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<StatePayload>;
}

export async function patchScores(
  contestantId: number,
  body: {
    judge_scores: number[];
    audience: number;
  }
): Promise<StatePayload & { ok: boolean }> {
  const res = await fetch(apiUrl(`/api/contestants/${contestantId}/scores`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<StatePayload & { ok: boolean }>;
}

export async function importContestants(
  contestants: Record<string, unknown>[]
): Promise<StatePayload & { ok: boolean }> {
  const res = await fetch(apiUrl("/api/import"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contestants }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<StatePayload & { ok: boolean }>;
}

export type Round1StagePairsResponse = {
  pairs: Round1PairMeta[];
  /** 数据库里是否已有行；false 时大屏应回退到静态 JSON */
  persisted: boolean;
};

/** 路由名 round1-pairs = stage=round1 的 PK lineup（兼容旧版） */
export async function fetchRound1StagePairs(): Promise<Round1StagePairsResponse> {
  const res = await fetch(apiUrl("/api/stage/round1-pairs"));
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { pairs?: unknown; persisted?: boolean };
  if (!Array.isArray(data.pairs) || data.pairs.length !== 5) {
    throw new Error("round1-pairs 响应格式错误");
  }
  return {
    pairs: data.pairs as Round1PairMeta[],
    persisted: Boolean(data.persisted),
  };
}

export async function saveRound1StagePairs(pairs: Round1PairMeta[]): Promise<Round1StagePairsResponse> {
  if (pairs.length !== 5) throw new Error("须为 5 组");
  const res = await fetch(apiUrl("/api/stage/round1-pairs"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairs }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { pairs?: Round1PairMeta[]; persisted?: boolean };
  return {
    pairs: data.pairs ?? pairs,
    persisted: Boolean(data.persisted),
  };
}

export async function importRound1PairsFromPublicFiles(): Promise<Round1StagePairsResponse> {
  const res = await fetch(apiUrl("/api/stage/round1-pairs/import-from-files"), {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { pairs?: Round1PairMeta[]; persisted?: boolean };
  if (!Array.isArray(data.pairs)) throw new Error("导入响应无效");
  return {
    pairs: data.pairs,
    persisted: Boolean(data.persisted),
  };
}

/** 强制写入内置「选手 1–10」照片路径 + 姓名到 SQLite */
export async function applyRound1NumberedDefaults(): Promise<Round1StagePairsResponse> {
  const res = await fetch(apiUrl("/api/stage/round1-pairs/apply-numbered-defaults"), {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { pairs?: Round1PairMeta[]; persisted?: boolean };
  if (!Array.isArray(data.pairs)) throw new Error("响应无效");
  return { pairs: data.pairs, persisted: Boolean(data.persisted) };
}

export type Round2LineupResponse = {
  slots: Round2LineupSlot[];
  persisted: boolean;
};

export async function fetchRound2Lineup(): Promise<Round2LineupResponse> {
  const res = await fetch(apiUrl("/api/stage/round2-lineup"));
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { slots?: unknown; persisted?: boolean };
  if (!Array.isArray(data.slots) || data.slots.length !== 6) {
    throw new Error("round2-lineup 响应格式错误");
  }
  return {
    slots: data.slots as Round2LineupSlot[],
    persisted: Boolean(data.persisted),
  };
}

export async function saveRound2Lineup(slots: Round2LineupSlot[]): Promise<Round2LineupResponse> {
  if (slots.length !== 6) throw new Error("须为 6 条");
  const res = await fetch(apiUrl("/api/stage/round2-lineup"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slots }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { slots?: Round2LineupSlot[]; persisted?: boolean };
  return {
    slots: data.slots ?? slots,
    persisted: Boolean(data.persisted),
  };
}

export async function importRound2LineupFromPublicFiles(): Promise<Round2LineupResponse> {
  const res = await fetch(apiUrl("/api/stage/round2-lineup/import-from-files"), {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { slots?: Round2LineupSlot[]; persisted?: boolean };
  if (!Array.isArray(data.slots)) throw new Error("导入响应无效");
  return {
    slots: data.slots,
    persisted: Boolean(data.persisted),
  };
}

export function displayWebSocketUrl(): string {
  if (API_BASE) {
    try {
      const u = new URL(API_BASE);
      const proto = u.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${u.host}/ws/display`;
    } catch {
      /* use page host */
    }
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/display`;
}
