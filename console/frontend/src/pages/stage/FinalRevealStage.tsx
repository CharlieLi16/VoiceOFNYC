import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchFinalLineup,
  fetchFinalRevealConfig,
  fetchRound2Lineup,
  type FinalRevealConfig,
} from "@/api/client";
import type { Round2LineupSlot } from "@/api/types";
import { parseFloatCell } from "@/api/sheetsClient";
import { DEFAULT_FINAL_AUDIENCE_RANGE } from "@/config/audienceSheetRanges";
import { useStageCleanUi } from "@/utils/stageCleanUi";
import { nameFromContestantImg } from "@/config/stageContestantPresets";
import { getSheetsPollConfig } from "@/config/sheetsEnv";
import { useSheetRangePoll } from "@/hooks/useSheetRangePoll";
import "@/styles/final-reveal.css";

const MAX_ROWS = 6;
const PLACEHOLDER_IMG = "/img/questionMark.png";
const EMPTY_LINEUP: Round2LineupSlot[] = Array.from({ length: 6 }, () => ({ name: "", img: "" }));

function isRound2SheetPlaceholderName(raw: string): boolean {
  return /^选手\s*\d{1,2}$/u.test(raw.trim());
}

async function fetchRound2LineupFromPublicFiles(): Promise<Round2LineupSlot[] | null> {
  const out: Round2LineupSlot[] = [];
  for (let n = 1; n <= 6; n++) {
    const res = await fetch(`/stage/round2/${n}.json`);
    if (!res.ok) return null;
    try {
      const raw = (await res.json()) as unknown;
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
      const o = raw as Record<string, unknown>;
      out.push({
        name: typeof o.name === "string" ? o.name : "",
        img: typeof o.img === "string" ? o.img : "",
      });
    } catch {
      return null;
    }
  }
  return out;
}

/** 与 assets/js/final.js highlightWinner 奖牌规则一致（含并列跳过银牌等） */
function computeMedals(scores: number[]): ("gold" | "silver" | "bronze" | null)[] {
  const medals: ("gold" | "silver" | "bronze" | null)[] = Array(scores.length).fill(null);
  const contestantsData = scores.map((score, originalIndex) => ({ score, originalIndex }));
  contestantsData.sort((a, b) => b.score - a.score);

  const uniqueScores = [...new Set(contestantsData.map((d) => d.score))].sort((a, b) => b - a);
  if (uniqueScores.length === 0) return medals;

  const goldScore = uniqueScores[0];
  const goldMedalists = contestantsData.filter((d) => d.score === goldScore);
  goldMedalists.forEach((d) => {
    medals[d.originalIndex] = "gold";
  });

  if (goldMedalists.length === 1 && uniqueScores.length > 1) {
    const silverScore = uniqueScores[1];
    const silverMedalists = contestantsData.filter((d) => d.score === silverScore);
    silverMedalists.forEach((d) => {
      medals[d.originalIndex] = "silver";
    });
    if (silverMedalists.length === 1 && uniqueScores.length > 2) {
      const bronzeScore = uniqueScores[2];
      contestantsData
        .filter((d) => d.score === bronzeScore)
        .forEach((d) => {
          medals[d.originalIndex] = "bronze";
        });
    }
  } else if (goldMedalists.length > 1 && uniqueScores.length > 1) {
    const bronzeScore = uniqueScores[1];
    contestantsData
      .filter((d) => d.score === bronzeScore)
      .forEach((d) => {
        medals[d.originalIndex] = "bronze";
      });
  }

  return medals;
}

function sortIndicesByScore(scores: number[]): number[] {
  return [...scores.keys()].sort((a, b) => {
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    return a - b;
  });
}

type SlotView = {
  slotIndex: number;
  name: string;
  img: string;
  /** 最终分（Round3 的 G 列；旧表仅 A:B 时用 B） */
  score: number;
  /** Round3：B 观众均分、F 评委均分（有宽表时用于揭晓副信息） */
  audienceAvg: number;
  judgeAvg: number;
  hasBreakdown: boolean;
};

/** Round3：评委均分优先用 F 列；若 API 省略尾部列则用 C～E 算术平均 */
function round3JudgeAvgFromRow(r: string[] | undefined): number {
  if (!r || r.length < 3) return 0;
  if (r.length >= 6 && r[5] != null && String(r[5]).trim() !== "") {
    return parseFloatCell(r[5]);
  }
  const n =
    (parseFloatCell(r[2]) + parseFloatCell(r[3]) + parseFloatCell(r[4])) / 3;
  return Number.isFinite(n) ? n : 0;
}

/** 最终分：优先 G 列（与表公式一致）；否则本地 judgeW×评委 + audienceW×观众；仅 A:B 时 B 为总分 */
function round3FinalFromRow(
  r: string[] | undefined,
  judgeW: number,
  audienceW: number
): number {
  if (!r || r.length < 2) return 0;
  const audienceAvg = parseFloatCell(r[1]);
  if (r.length < 5) return audienceAvg;
  const judgeAvg = round3JudgeAvgFromRow(r);
  if (r.length >= 7 && r[6] != null && String(r[6]).trim() !== "") {
    return parseFloatCell(r[6]);
  }
  return judgeW * judgeAvg + audienceW * audienceAvg;
}

function buildSlots(
  slice: string[][],
  lineup: Round2LineupSlot[],
  weights: { judge: number; audience: number }
): SlotView[] {
  const padded: string[][] = slice.slice(0, MAX_ROWS);
  while (padded.length < MAX_ROWS) padded.push([]);
  return padded.map((r, i) => {
    const rawSheet = r?.[0] != null ? String(r[0]).trim() : "";
    const sheetName = isRound2SheetPlaceholderName(rawSheet) ? "" : rawSheet;
    const slotNum = i + 1;
    const meta = lineup[slotNum - 1] ?? { name: "", img: "" };
    const fromImg = nameFromContestantImg(meta.img);
    const displayName =
      sheetName || meta.name.trim() || fromImg || `选手 ${slotNum}`;
    const img = meta.img.trim() ? meta.img : PLACEHOLDER_IMG;
    const hasBreakdown = (r?.length ?? 0) >= 5;
    const audienceAvg = parseFloatCell(r?.[1]);
    const judgeAvg = hasBreakdown ? round3JudgeAvgFromRow(r) : 0;
    const score = round3FinalFromRow(r, weights.judge, weights.audience);
    return {
      slotIndex: i,
      name: displayName,
      img,
      score,
      audienceAvg,
      judgeAvg,
      hasBreakdown,
    };
  });
}

function medalClass(m: "gold" | "silver" | "bronze" | null): string {
  if (m === "gold") return " fr-contestant--gold";
  if (m === "silver") return " fr-contestant--silver";
  if (m === "bronze") return " fr-contestant--bronze";
  return "";
}

const DEFAULT_WEIGHTS = { judge: 0.6, audience: 0.4 };

export default function FinalRevealStage() {
  const envCfg = getSheetsPollConfig();
  const envRange = envCfg.finalAudienceRange || envCfg.round2AudienceRange;
  const [frCfg, setFrCfg] = useState<FinalRevealConfig | null>(null);
  const range = (frCfg?.sheetRange?.trim() || envRange || DEFAULT_FINAL_AUDIENCE_RANGE).trim();
  const judgeW = frCfg?.judgeWeight ?? DEFAULT_WEIGHTS.judge;
  const audienceW = frCfg?.audienceWeight ?? DEFAULT_WEIGHTS.audience;
  const cleanUi = useStageCleanUi();
  const { rows, error } = useSheetRangePoll(range);

  const [lineupApi, setLineupApi] = useState<Round2LineupSlot[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [winnerHighlighted, setWinnerHighlighted] = useState(false);
  const [top3Only, setTop3Only] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const { slots } = await fetchFinalLineup();
        if (!cancelled) setLineupApi(slots);
        return;
      } catch {
        /* 决赛阵容 API 不可用时回退复活 lineup */
      }
      try {
        const { slots } = await fetchRound2Lineup();
        if (!cancelled) setLineupApi(slots);
        return;
      } catch {
        /* 再回退静态 JSON */
      }
      const files = await fetchRound2LineupFromPublicFiles();
      if (!cancelled && files) setLineupApi(files);
    };
    void tick();
    const interval = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchFinalRevealConfig()
        .then((c) => {
          if (!cancelled) setFrCfg(c);
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const lineup = lineupApi ?? EMPTY_LINEUP;

  const slots = useMemo(
    () => buildSlots(rows, lineup, { judge: judgeW, audience: audienceW }),
    [rows, lineup, judgeW, audienceW]
  );

  const scores = useMemo(() => slots.map((s) => s.score), [slots]);

  const medals = useMemo((): ("gold" | "silver" | "bronze" | null)[] => {
    if (!winnerHighlighted) return Array(MAX_ROWS).fill(null);
    return computeMedals(scores);
  }, [winnerHighlighted, scores]);

  const displayOrder = useMemo(() => {
    if (!winnerHighlighted) return [...scores.keys()];
    return sortIndicesByScore(scores);
  }, [winnerHighlighted, scores]);

  const visibleOrder = useMemo(() => {
    if (!top3Only) return displayOrder;
    return displayOrder.slice(0, 3);
  }, [displayOrder, top3Only]);

  const reset = useCallback(() => {
    setRevealedCount(0);
    setWinnerHighlighted(false);
    setTop3Only(false);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        if (revealedCount < MAX_ROWS) {
          setRevealedCount((c) => Math.min(MAX_ROWS, c + 1));
        } else if (revealedCount === MAX_ROWS && !winnerHighlighted) {
          setWinnerHighlighted(true);
          setTop3Only(false);
        } else if (winnerHighlighted && !top3Only) {
          setTop3Only(true);
        }
      } else if (e.code === "KeyR") {
        reset();
      }
    },
    [revealedCount, winnerHighlighted, top3Only, reset]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return (
    <div className="fr-root">
      <Link className="stage-back fr-back" to="/">
        ← 返回控制台
      </Link>
      <h1 className="fr-title">Final Round</h1>
      <p className="fr-sub">
        {cleanUi ? (
          <>
            <kbd>空格</kbd>：按顺序揭晓 → 按<strong>最终分</strong>排序发奖 → 仅显示前三 · <kbd>R</kbd> 重置
          </>
        ) : (
          <>
            空格：按表行顺序逐个揭晓 → 再按<strong>最终分</strong>排序并发奖 → 再按仅显示前三 · <kbd>R</kbd> 重置 ·
            Round3 宽表：<strong>G</strong> 列有值时优先用表内最终分；否则本页按{" "}
            <strong>
              {judgeW}×评委均分+{audienceW}×观众均分
            </strong>
            。<strong>B</strong> 观众均分，<strong>C–E</strong> 三评委，<strong>F</strong> 评委均分 · 数据{" "}
            <code>{range}</code>
            {frCfg ? "（后台可改）" : "（未连上 API 时用 .env 默认）"} · 选手照与站位见后台「决赛揭晓」阵容（API{" "}
            <code>/api/stage/final-lineup</code>，失败时回退复活 lineup）
          </>
        )}
      </p>
      {error && <div className="fr-banner">{error}</div>}

      <div className="fr-contestants" role="list">
        {visibleOrder.map((slotIndex) => {
          const s = slots[slotIndex];
          if (!s) return null;
          const revealed = slotIndex < revealedCount;
          const scoreText = revealed ? `${s.score.toFixed(2)}/10` : "?.??/10";
          const m = medals[slotIndex];
          const breakdown =
            revealed && s.hasBreakdown
              ? `观众均分 ${s.audienceAvg.toFixed(2)} · 评委均分 ${s.judgeAvg.toFixed(2)}`
              : null;
          return (
            <div
              key={s.slotIndex}
              className={`fr-contestant${medalClass(m)}`}
              role="listitem"
            >
              <img className="fr-avatar" src={s.img} alt="" />
              <div className="fr-name">{s.name}</div>
              <div className="fr-score">{scoreText}</div>
              {breakdown && <div className="fr-breakdown">{breakdown}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
