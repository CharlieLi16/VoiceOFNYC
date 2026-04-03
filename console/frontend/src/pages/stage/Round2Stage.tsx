import { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchRound2Lineup } from "@/api/client";
import type { Round2LineupSlot } from "@/api/types";
import { parseIntCell } from "@/api/sheetsClient";
import { nameFromContestantImg } from "@/config/stageContestantPresets";
import { getSheetsPollConfig } from "@/config/sheetsEnv";
import { useListFlipAnimation } from "@/hooks/useListFlipAnimation";
import { useSheetRangePoll } from "@/hooks/useSheetRangePoll";
import "@/styles/round2-stage.css";

/** 复活赛制约：大屏只展示 5 人（表与 lineup 取前 5 行/槽；API 仍可能返回 6 槽以兼容总决赛揭晓等） */
const MAX_ROWS = 5;
const FIRST_SPACE_REVEAL_TAIL = 3;
const PLACEHOLDER_IMG = "/img/questionMark.png";

const EMPTY_LINEUP: Round2LineupSlot[] = Array.from({ length: MAX_ROWS }, () => ({ name: "", img: "" }));

type RowItem = {
  id: string;
  name: string;
  img: string;
  votes: number;
  pct: number;
};

async function fetchRound2LineupFromPublicFiles(): Promise<Round2LineupSlot[] | null> {
  const out: Round2LineupSlot[] = [];
  for (let n = 1; n <= MAX_ROWS; n++) {
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

/** 表模板里的「选手1」占位，不占真名优先权，便于用 lineup / 头像反查显示 Danting 等 */
function isRound2SheetPlaceholderName(raw: string): boolean {
  return /^选手\s*\d{1,2}$/u.test(raw.trim());
}

function padSheetSlice(slice: string[][]): string[][] {
  const out = slice.slice(0, MAX_ROWS);
  while (out.length < MAX_ROWS) out.push([]);
  return out;
}

function buildSortedItems(slice: string[][], lineup: Round2LineupSlot[]): RowItem[] {
  let total = 0;
  const nums = slice.map((r) => parseIntCell(r?.[1]));
  nums.forEach((n) => {
    total += n;
  });
  if (total <= 0) total = 1;
  const raw: RowItem[] = slice.map((r, i) => {
    const rawSheet = r?.[0] != null ? String(r[0]).trim() : "";
    const sheetName = isRound2SheetPlaceholderName(rawSheet) ? "" : rawSheet;
    const slotNum = i + 1;
    const meta = lineup[slotNum - 1] ?? { name: "", img: "" };
    const fromImg = nameFromContestantImg(meta.img);
    const displayName =
      sheetName || meta.name.trim() || fromImg || `选手 ${slotNum}`;
    const img = meta.img.trim() ? meta.img : PLACEHOLDER_IMG;
    return {
      id: `r2-${i}`,
      name: displayName,
      img,
      votes: nums[i] ?? 0,
      pct: ((nums[i] ?? 0) / total) * 100,
    };
  });
  return [...raw].sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.id.localeCompare(b.id);
  });
}

/** 揭晓步：0…4 见副标题；排序始终跟实时票，FLIP/上升动效不关 */
type RevivalStep = 0 | 1 | 2 | 3 | 4;

/** 0 全藏 · 1 仅票与柱 · 2 身份+票（按选手 id 存，换位后仍保留揭晓程度） */
type RevealLevel = 0 | 1 | 2;

function topTwoCutoff(n: number): number {
  return Math.max(0, n - FIRST_SPACE_REVEAL_TAIL);
}

type RevivalCeremonyState = { step: RevivalStep; revealById: Record<string, RevealLevel> };

const INITIAL_REVIVAL: RevivalCeremonyState = { step: 0, revealById: {} };

function advanceRevivalCeremony(
  prev: RevivalCeremonyState,
  sorted: RowItem[]
): RevivalCeremonyState {
  const n = sorted.length;
  const t = topTwoCutoff(n);
  if (prev.step === 0) {
    const revealById: Record<string, RevealLevel> = {};
    sorted.forEach((item, i) => {
      if (i >= t) revealById[item.id] = 2;
    });
    return { step: 1, revealById };
  }
  if (prev.step === 1) {
    const revealById: Record<string, RevealLevel> = { ...prev.revealById };
    sorted.forEach((item, i) => {
      if (i < t) {
        const cur = revealById[item.id] ?? 0;
        revealById[item.id] = Math.max(cur, 1) as RevealLevel;
      }
    });
    return { step: 2, revealById };
  }
  if (prev.step === 2) {
    const revealById: Record<string, RevealLevel> = { ...prev.revealById };
    sorted.forEach((item, i) => {
      if (i < t) revealById[item.id] = 2;
    });
    return { step: 3, revealById };
  }
  if (prev.step === 3) return { ...prev, step: 4 };
  return prev;
}

function LeaderboardRow({
  item,
  rank,
  accent,
  isRising,
  identityHidden,
  statsHidden,
  isRevivalWinner,
  rankHidden,
}: {
  item: RowItem;
  rank: number;
  accent: number;
  isRising: boolean;
  identityHidden: boolean;
  statsHidden: boolean;
  isRevivalWinner: boolean;
  rankHidden: boolean;
}) {
  const top = isRevivalWinner;
  return (
    <li
      className={`r2s-row${top ? " r2s-row--top r2s-row--revival" : ""}${
        isRising ? " r2s-row--rise" : ""
      }${identityHidden ? " r2s-row--secret" : ""}`}
      data-accent={accent}
      data-flip-id={item.id}
    >
      <span
        className="r2s-rank"
        aria-label={rankHidden ? "名次未公开" : `第 ${rank} 名`}
      >
        {rankHidden ? "·" : rank}
      </span>
      <div className={`r2s-avatar${identityHidden ? " r2s-avatar--hidden" : ""}`} aria-hidden>
        {identityHidden ? (
          <span className="r2s-avatar-blank" />
        ) : (
          <img src={item.img} alt="" />
        )}
      </div>
      <div className="r2s-mid">
        <span className="r2s-name">{identityHidden ? "???" : item.name}</span>
        <div className="r2s-track" role="presentation">
          <div
            className="r2s-fill"
            style={{
              width: statsHidden ? "8%" : `${Math.max(2, item.pct)}%`,
              opacity: statsHidden ? 0.35 : 1,
            }}
          />
        </div>
      </div>
      <div className="r2s-stat">
        <span className="r2s-pct">{statsHidden ? "—" : `${item.pct.toFixed(1)}%`}</span>
        <span className="r2s-votes">{statsHidden ? "—" : `${item.votes} 票`}</span>
      </div>
    </li>
  );
}

export default function Round2Stage() {
  const cfg = getSheetsPollConfig();
  const { rows, error } = useSheetRangePoll(cfg.round2AudienceRange);
  const listRef = useRef<HTMLOListElement>(null);
  const lastRankById = useRef<Map<string, number>>(new Map());

  const [lineupApi, setLineupApi] = useState<Round2LineupSlot[] | null>(null);
  const [lineupFiles, setLineupFiles] = useState<Round2LineupSlot[] | null>(null);
  const [revival, setRevival] = useState<RevivalCeremonyState>(INITIAL_REVIVAL);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetchRound2Lineup()
        .then(({ slots }) => {
          if (!cancelled) setLineupApi(slots);
        })
        .catch(() => {
          /* 保持上次或走 JSON */
        });
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
  const lineupFive = useMemo(() => lineup.slice(0, MAX_ROWS), [lineup]);

  const sortedLive = useMemo(
    () => buildSortedItems(padSheetSlice(rows), lineupFive),
    [rows, lineupFive]
  );

  const sortedRef = useRef(sortedLive);
  sortedRef.current = sortedLive;

  const flipKey = useMemo(() => sortedLive.map((x) => `${x.id}:${x.votes}`).join("|"), [sortedLive]);

  const resetRevival = useCallback(() => {
    setRevival(INITIAL_REVIVAL);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        setRevival((prev) => advanceRevivalCeremony(prev, sortedRef.current));
      } else if (e.code === "KeyR") {
        resetRevival();
      }
    },
    [resetRevival]
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  useListFlipAnimation(listRef, flipKey);

  const risingIds = useMemo(() => {
    const next = new Set<string>();
    sortedLive.forEach((item, i) => {
      const newRank = i + 1;
      const prev = lastRankById.current.get(item.id);
      if (prev != null && newRank < prev) next.add(item.id);
    });
    return next;
  }, [sortedLive]);

  useLayoutEffect(() => {
    sortedLive.forEach((item, i) => {
      lastRankById.current.set(item.id, i + 1);
    });
  }, [sortedLive]);

  return (
    <div className="r2s-root">
      <div className="r2s-noise" aria-hidden />
      <Link className="r2s-back" to="/">
        ← 返回控制台
      </Link>
      {error && <div className="r2s-banner">{error}</div>}

      <div className="r2s-inner">
        <header className="r2s-hero">
          <div className="r2s-live">
            <span className="r2s-live-dot" />
            实时投票
          </div>
          <h1 className="r2s-title">复活投票 · 声量榜</h1>
          <p className="r2s-subtitle">
            五人制 · 隐藏态头像是<strong>纯黑</strong>圆；<kbd>空格</kbd>①揭晓<strong>后三名</strong>（身份+票）②前两名只出{" "}
            <strong>百分比与票数</strong>③两人<strong>身份一起揭晓</strong>④<strong>复活高亮</strong>当前第一名 · <kbd>R</kbd>{" "}
            重置 · 票数变化时列表仍会<strong>实时换位</strong>（含上升动效），未公开身份仍不显示姓名 · 表姓名为准、头像{" "}
            <code>GET /api/stage/round2-lineup</code> 或 <code>/stage/round2/*.json</code> ·{" "}
            <code>{cfg.round2AudienceRange}</code>
          </p>
        </header>

        <ol ref={listRef} className="r2s-list" aria-label="复活投票排行">
          {sortedLive.map((it, i) => {
            const level: RevealLevel =
              revival.step === 0 ? 0 : (revival.revealById[it.id] ?? 0);
            const statsHidden = level < 1;
            const identityHidden = level < 2;
            const revivalWinner = revival.step === 4 && i === 0;
            return (
              <LeaderboardRow
                key={it.id}
                item={it}
                rank={i + 1}
                accent={i % 6}
                isRising={risingIds.has(it.id)}
                identityHidden={identityHidden}
                statsHidden={statsHidden}
                isRevivalWinner={revivalWinner}
                rankHidden={revival.step === 0}
              />
            );
          })}
        </ol>
      </div>
    </div>
  );
}
