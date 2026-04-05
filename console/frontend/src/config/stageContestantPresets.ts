/**
 * 现场大屏 1–10 号选手：姓名 + 固定头像路径（与 `public/data/seed-contestants.json`、
 * `scripts/setup-contestant-photos-1-10.sh` 生成的 `public/img/contestants/{n}.jpg` 一致）。
 * 后台只需选编号，不必再手填链接。
 */
export type StageContestantPreset = {
  num: number;
  name: string;
  img: string;
};

export const STAGE_CONTESTANT_PRESETS: readonly StageContestantPreset[] = [
  { num: 1, name: "Siwei", img: "/img/contestants/1.jpg" },
  { num: 2, name: "蔡彦培", img: "/img/contestants/2.jpg" },
  { num: 3, name: "Julian Zhu", img: "/img/contestants/3.jpg" },
  { num: 4, name: "Mandy", img: "/img/contestants/4.jpg" },
  { num: 5, name: "赵星童", img: "/img/contestants/5.jpg" },
  { num: 6, name: "coco林小妍", img: "/img/contestants/6.jpg" },
  { num: 7, name: "吴子涵", img: "/img/contestants/7.jpg" },
  { num: 8, name: "Timmy Zihan Ma", img: "/img/contestants/8.jpg" },
  { num: 9, name: "刘佳希", img: "/img/contestants/9.jpg" },
  { num: 10, name: "Hazel Jia", img: "/img/contestants/10.jpg" },
] as const;

export const STAGE_CONTESTANT_NUMS = STAGE_CONTESTANT_PRESETS.map((p) => p.num);

const _byNum = new Map(STAGE_CONTESTANT_PRESETS.map((p) => [p.num, p] as const));

export function getStageContestantPreset(num: number): StageContestantPreset | undefined {
  return _byNum.get(num);
}

function numFromContestantImg(img: string): number | null {
  const s = (img || "").trim();
  const m = s.match(/contestants\/(\d+)\.(?:jpe?g|png|webp)/i) ?? s.match(/^(\d+)\.(?:jpe?g|png|webp)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 10 ? n : null;
}

/** 0 = 与预设对不上，视为自定义 */
export function matchStageContestantNum(name: string, img: string): number {
  const byImg = numFromContestantImg((img || "").trim());
  if (byImg != null && _byNum.has(byImg)) return byImg;
  const nm = (name || "").trim();
  if (nm) {
    for (const p of STAGE_CONTESTANT_PRESETS) {
      if (p.name === nm) return p.num;
    }
  }
  return 0;
}

/** 从头像路径反查预设姓名（R2 等在 lineup.name 为空时仍可显示真名） */
export function nameFromContestantImg(img: string): string {
  const n = numFromContestantImg((img || "").trim());
  if (n == null) return "";
  return _byNum.get(n)?.name ?? "";
}
