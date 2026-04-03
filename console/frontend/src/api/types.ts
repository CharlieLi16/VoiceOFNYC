export interface Contestant {
  id: number;
  name: string;
  img: string;
  song: string;
  songTwo: string;
  judges: string;
  audience: string;
  total: string;
  ranking: number;
}

export interface StatePayload {
  contestants: Contestant[];
  ranked: Contestant[];
}

/**
 * 现场大屏 PK 五组（stage=round1）。路由名 `/api/stage/round1-pairs` 为历史兼容。
 */
export interface Round1PairMeta {
  leftName: string;
  rightName: string;
  leftImg: string;
  rightImg: string;
}

/** 与 `/api/stage/round2-lineup` 一致，API 为 6 槽；`/stage/round2` 复活投票大屏仅用前 5 槽与表前 5 行 */
export interface Round2LineupSlot {
  name: string;
  img: string;
}
