import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useStageHintsVisible } from "@/contexts/StageHintsContext";
import { useStageCleanUi } from "@/utils/stageCleanUi";
import { nameFromContestantImg } from "@/config/stageContestantPresets";
import { getSheetsPollConfig } from "@/config/sheetsEnv";
import { useSheetRangePoll } from "@/hooks/useSheetRangePoll";
import "@/styles/final-reveal.css";

const MAX_ROWS = 6;
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

/**
 * 空格揭晓顺序：先按名次揭晓后三名（第六→第五→第四），再按季→亚→冠（分数第三→第二→第一）。
 * 与 sortIndicesByScore 一致：sorted[0] 为最高分（冠军位），sorted[5] 为最低分（第六名）。
 */
function buildRevealSequence(scores: number[]): number[] {
  const sorted = sortIndicesByScore(scores);
  const n = sorted.length;
  if (n === 0) return [];
  if (n < 6) {
    return [...sorted].reverse();
  }
  return [
    sorted[5],
    sorted[4],
    sorted[3],
    sorted[2],
    sorted[1],
    sorted[0],
  ];
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
    const img = meta.img.trim() ? meta.img : "";
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

/** 无 URL 或图片尚未加载完成时显示纯黑圆（不用问号图） */
function FinalRevealAvatar({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
  }, [src]);

  if (!src) {
    return <div className="fr-avatar fr-avatar--empty" aria-hidden />;
  }

  return (
    <div className="fr-avatar-wrap">
      <div className="fr-avatar fr-avatar--empty fr-avatar--under" aria-hidden />
      <img
        src={src}
        alt=""
        className={`fr-avatar fr-avatar--photo${loaded ? " fr-avatar--loaded" : ""}`}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
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
  const hintsVisible = useStageHintsVisible();
  const { rows, error, sheetDataReady } = useSheetRangePoll(range);

  const [lineupApi, setLineupApi] = useState<Round2LineupSlot[] | null>(null);
  /** 已揭晓几步（0～6），顺序见 frozenRevealSeq */
  const [revealStep, setRevealStep] = useState(0);
  /** 第一次按空格时锁定，避免揭晓过程中表格轮询改分导致顺序跳动 */
  const [frozenRevealSeq, setFrozenRevealSeq] = useState<number[] | null>(null);

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
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

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

  const revealSequenceLive = useMemo(
    () => frozenRevealSeq ?? buildRevealSequence(scores),
    [frozenRevealSeq, scores]
  );

  const revealedSlotSet = useMemo(() => {
    const seq = revealSequenceLive;
    return new Set(seq.slice(0, revealStep));
  }, [revealSequenceLive, revealStep]);

  const reset = useCallback(() => {
    setRevealStep(0);
    setFrozenRevealSeq(null);
    setWinnerHighlighted(false);
    setTop3Only(false);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        if (revealStep < MAX_ROWS) {
          if (revealStep === 0) {
            setFrozenRevealSeq(buildRevealSequence(scoresRef.current));
          }
          setRevealStep((c) => Math.min(MAX_ROWS, c + 1));
        } else if (revealStep === MAX_ROWS && !winnerHighlighted) {
          setWinnerHighlighted(true);
          setTop3Only(false);
        } else if (winnerHighlighted && !top3Only) {
          setTop3Only(true);
        }
      } else if (e.code === "KeyR" && e.shiftKey) {
        e.preventDefault();
        reset();
      }
    },
    [revealStep, winnerHighlighted, top3Only, reset]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  const statusTone = error ? "error" : sheetDataReady ? "ready" : "loading";
  const statusLabel = error ? "数据异常" : sheetDataReady ? "可公布" : "同步中…";
  const statusDetail = error
    ? String(error)
    : sheetDataReady
      ? "表格已至少成功同步一次，分数可信后再按空格揭晓"
      : "正在首次读取 Google 表，请勿在同步完成前公布分数";

  return (
    <div className="fr-root">
      <Link className="stage-back fr-back" to="/">
        ← 返回控制台
      </Link>
      <div
        className={`fr-status fr-status--${statusTone}`}
        role="status"
        aria-live="polite"
        title={statusDetail}
      >
        <span className="fr-status-dot" aria-hidden />
        <span className="fr-status-text">{statusLabel}</span>
      </div>
      <h1 className="fr-title">Final Round</h1>
      {hintsVisible ? (
        <p className="fr-sub">
          {cleanUi ? (
            <>
              <kbd>空格</kbd>：先揭晓<strong>后三名</strong>（第六→第四）→ 再<strong>季→亚→冠</strong> → 排序发奖 →
              仅显示前三（<strong>冠军在上</strong>） · <kbd>Shift+R</kbd> 重置 · <kbd>R</kbd> 显示/隐藏本说明
            </>
          ) : (
            <>
              空格：先按名次揭晓后三名（第六→第五→第四），再按季→亚→冠揭晓；再按<strong>最终分</strong>排序并发奖 →
              再按仅显示前三（冠军置顶） · <kbd>Shift+R</kbd> 重置 · <kbd>R</kbd> 显示/隐藏本说明 ·
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
      ) : null}
      {error && <div className="fr-banner">{error}</div>}

      <div
        className={`fr-contestants${top3Only ? " fr-contestants--top3" : ""}`}
        role="list"
      >
        {visibleOrder.map((slotIndex) => {
          const s = slots[slotIndex];
          if (!s) return null;
          const revealed = revealedSlotSet.has(slotIndex);
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
              <FinalRevealAvatar src={s.img} />
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
