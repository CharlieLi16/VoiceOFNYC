import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRound2Lineup } from "@/api/client";
import type { Round2LineupSlot } from "@/api/types";
import { parseFloatCell } from "@/api/sheetsClient";
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
  score: number;
};

function buildSlots(slice: string[][], lineup: Round2LineupSlot[]): SlotView[] {
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
    return {
      slotIndex: i,
      name: displayName,
      img,
      score: parseFloatCell(r?.[1]),
    };
  });
}

function medalClass(m: "gold" | "silver" | "bronze" | null): string {
  if (m === "gold") return " fr-contestant--gold";
  if (m === "silver") return " fr-contestant--silver";
  if (m === "bronze") return " fr-contestant--bronze";
  return "";
}

export default function FinalRevealStage() {
  const cfg = getSheetsPollConfig();
  const range = cfg.finalAudienceRange || cfg.round2AudienceRange;
  const { rows, error } = useSheetRangePoll(range);

  const [lineupApi, setLineupApi] = useState<Round2LineupSlot[] | null>(null);
  const [lineupFiles, setLineupFiles] = useState<Round2LineupSlot[] | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [winnerHighlighted, setWinnerHighlighted] = useState(false);
  const [top3Only, setTop3Only] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetchRound2Lineup()
        .then(({ slots }) => {
          if (!cancelled) setLineupApi(slots);
        })
        .catch(() => {});
    };
    tick();
    const interval = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (lineupApi != null) return undefined;
    fetchRound2LineupFromPublicFiles().then((slots) => {
      if (!cancelled && slots) setLineupFiles(slots);
    });
    return () => {
      cancelled = true;
    };
  }, [lineupApi]);

  const lineup = lineupApi ?? lineupFiles ?? EMPTY_LINEUP;

  const slots = useMemo(() => buildSlots(rows, lineup), [rows, lineup]);

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
        空格：按表行顺序逐个揭晓分数 → 再按总分排序并发奖 → 再按仅显示前三 · <kbd>R</kbd> 重置 · B 列读作小数总分（如
        8.5）· 数据 <code>{range}</code> · 头像/姓名 lineup 同复活投票（<code>/stage/round2</code>）
      </p>
      {error && <div className="fr-banner">{error}</div>}

      <div className="fr-contestants" role="list">
        {visibleOrder.map((slotIndex) => {
          const s = slots[slotIndex];
          if (!s) return null;
          const revealed = slotIndex < revealedCount;
          const scoreText = revealed ? `${s.score.toFixed(2)}/10` : "?.??/10";
          const m = medals[slotIndex];
          return (
            <div
              key={s.slotIndex}
              className={`fr-contestant${medalClass(m)}`}
              role="listitem"
            >
              <img className="fr-avatar" src={s.img} alt="" />
              <div className="fr-name">{s.name}</div>
              <div className="fr-score">{scoreText}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
