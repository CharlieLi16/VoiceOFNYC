import type { Round1PairMeta, Round2LineupSlot, StatePayload } from "./types";

/**
 * 生产 / `vite preview`：构建时注入 VITE_API_BASE（公网 HTTPS API，无尾斜杠）。
 * `npm run dev`：强制走同源 `/api`，由 Vite 代理到本机 8765，避免与 Vercel 用的生产变量混用。
 */
const API_BASE = (import.meta.env.DEV
  ? ""
  : String(import.meta.env.VITE_API_BASE ?? "")
).replace(/\/$/, "");

function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readError(res: Response): Promise<string> {
  const t = await res.text();
  const prefix = `[HTTP ${res.status}] `;
  if (!t) return `${prefix}${res.statusText || "无响应体"}`.trim();
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    if (j.detail != null) {
      const body =
        typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
      return `${prefix}${body}`;
    }
  } catch {
    /* not JSON */
  }
  const raw = t.length > 500 ? `${t.slice(0, 500)}…` : t;
  return `${prefix}${raw}`;
}

export type CheckinResponse = {
  ok: boolean;
};

export async function submitCheckin(body: {
  name: string;
  email: string;
  /** 趣味问答，选填 */
  funResponse?: string;
  website?: string;
}): Promise<CheckinResponse> {
  const res = await fetch(apiUrl("/api/checkin"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: body.name,
      email: body.email,
      funResponse: body.funResponse ?? "",
      website: body.website ?? "",
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<CheckinResponse>;
}

export async function fetchState(): Promise<StatePayload> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/api/state"));
  } catch (e) {
    const url = apiUrl("/api/state");
    const hint = import.meta.env.DEV
      ? "开发模式：请求经本页 /api 由 Vite 转发到 127.0.0.1:8765，请启动 uvicorn 并已 pip install -r backend/requirements.txt。"
      : `打包/线上：直连 ${url}。请在 Vercel 等平台配置 VITE_API_BASE；后端须 HTTPS、且 CORS 允许你的前端域名（见 console/docs/README-static-deploy.md）。`;
    throw new Error(`${hint} ${String(e)}`);
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

/** 决赛揭晓大屏 6 人（姓名/头像），与复活 lineup 独立 */
export async function fetchFinalLineup(): Promise<Round2LineupResponse> {
  const res = await fetch(apiUrl("/api/stage/final-lineup"));
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { slots?: unknown; persisted?: boolean };
  if (!Array.isArray(data.slots) || data.slots.length !== 6) {
    throw new Error("final-lineup 响应格式错误");
  }
  return {
    slots: data.slots as Round2LineupSlot[],
    persisted: Boolean(data.persisted),
  };
}

export async function saveFinalLineup(slots: Round2LineupSlot[]): Promise<Round2LineupResponse> {
  if (slots.length !== 6) throw new Error("须为 6 条");
  const res = await fetch(apiUrl("/api/stage/final-lineup"), {
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

export async function copyFinalLineupFromRound2(): Promise<Round2LineupResponse> {
  const res = await fetch(apiUrl("/api/stage/final-lineup/copy-from-round2"), {
    method: "POST",
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { slots?: Round2LineupSlot[]; persisted?: boolean };
  if (!Array.isArray(data.slots)) throw new Error("复制响应无效");
  return {
    slots: data.slots,
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

export type FinalRevealConfig = {
  sheetRange: string;
  judgeWeight: number;
  audienceWeight: number;
};

export async function fetchFinalRevealConfig(): Promise<FinalRevealConfig> {
  const res = await fetch(apiUrl("/api/stage/final-reveal-config"));
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as Partial<FinalRevealConfig>;
  if (typeof data.sheetRange !== "string" || !data.sheetRange.trim()) {
    throw new Error("final-reveal-config 响应无效");
  }
  return {
    sheetRange: data.sheetRange.trim(),
    judgeWeight: typeof data.judgeWeight === "number" ? data.judgeWeight : 0.6,
    audienceWeight: typeof data.audienceWeight === "number" ? data.audienceWeight : 0.4,
  };
}

export async function saveFinalRevealConfig(body: FinalRevealConfig): Promise<FinalRevealConfig> {
  const res = await fetch(apiUrl("/api/stage/final-reveal-config"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sheet_range: body.sheetRange.trim(),
      judge_weight: body.judgeWeight,
      audience_weight: body.audienceWeight,
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as Partial<FinalRevealConfig> & { ok?: boolean };
  if (typeof data.sheetRange !== "string") throw new Error("保存响应无效");
  return {
    sheetRange: data.sheetRange.trim(),
    judgeWeight: typeof data.judgeWeight === "number" ? data.judgeWeight : body.judgeWeight,
    audienceWeight: typeof data.audienceWeight === "number" ? data.audienceWeight : body.audienceWeight,
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
