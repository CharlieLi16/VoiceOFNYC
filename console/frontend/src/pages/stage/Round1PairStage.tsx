import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchRound1StagePairs } from "@/api/client";
import { useStageHintsVisible } from "@/contexts/StageHintsContext";
import { useStageCleanUi } from "@/utils/stageCleanUi";
import { parseRound1PairTotalsFromRow } from "@/api/sheetsClient";
import { getSheetsPollConfig } from "@/config/sheetsEnv";
import { useSheetRangePoll } from "@/hooks/useSheetRangePoll";
import "@/styles/round1-pk.css";

type PairMeta = {
  leftName: string;
  rightName: string;
  leftImg: string;
  rightImg: string;
};

const DEFAULT_META: PairMeta = {
  leftName: "左侧",
  rightName: "右侧",
  leftImg: "",
  rightImg: "",
};

function normalizePairMeta(raw: unknown): PairMeta | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  return {
    leftName: s(o.leftName),
    rightName: s(o.rightName),
    leftImg: s(o.leftImg),
    rightImg: s(o.rightImg),
  };
}

function normalizeFallbackList(raw: unknown): PairMeta[] {
  if (!Array.isArray(raw)) return [];
  const out: PairMeta[] = [];
  for (let i = 0; i < 5; i++) {
    const m = normalizePairMeta(raw[i]);
    out.push(m ?? DEFAULT_META);
  }
  return out;
}

function pctPair(a: number, b: number): [number, number] {
  const t = a + b;
  if (t <= 0) return [50, 50];
  return [(a / t) * 100, (b / t) * 100];
}

const ROUND1_LABELS = ["第一轮", "第二轮", "第三轮", "第四轮", "第五轮"];

/** null = 无分组文件或无效，用 round1-pairs 兜底；非 null = 使用 /stage/round1/n.json */
type PairFileResult = PairMeta | null;

export default function Round1PairStage() {
  const { pair } = useParams();
  const navigate = useNavigate();
  const pairNum = Math.min(5, Math.max(1, parseInt(String(pair || "1"), 10) || 1));
  const rowIndex = pairNum - 1;

  const cfg = getSheetsPollConfig();
  const cleanUi = useStageCleanUi();
  const hintsVisible = useStageHintsVisible();
  const { rows, error } = useSheetRangePoll(cfg.round1AudienceRange);
  /** 后端 SQLite 有数据时优先使用；null 表示尚未成功拉取 API */
  const [dbList, setDbList] = useState<PairMeta[] | null>(null);
  const [fallbackList, setFallbackList] = useState<PairMeta[]>([]);
  const [pairFileMeta, setPairFileMeta] = useState<PairFileResult | undefined>(undefined);
  /** 底部「第一轮…第五轮」条：投屏时可按 N 收起 */
  const [pairNavVisible, setPairNavVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadDb = () => {
      fetchRound1StagePairs()
        .then(({ pairs, persisted }) => {
          if (cancelled) return;
          const norm = pairs.map((x) => normalizePairMeta(x) ?? DEFAULT_META);
          setDbList(persisted ? norm : null);
        })
        .catch(() => {
          if (!cancelled) setDbList(null);
        });
    };
    loadDb();
    const t = window.setInterval(loadDb, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/round1-pairs.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (cancelled) return;
        setFallbackList(normalizeFallbackList(data));
      })
      .catch(() => {
        if (!cancelled) setFallbackList([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPairFileMeta(undefined);
    fetch(`/stage/round1/${pairNum}.json`)
      .then(async (r) => {
        if (!r.ok) return null;
        try {
          return (await r.json()) as unknown;
        } catch {
          return undefined;
        }
      })
      .then((raw) => {
        if (cancelled) return;
        if (raw === null || raw === undefined) {
          setPairFileMeta(null);
          return;
        }
        const n = normalizePairMeta(raw);
        setPairFileMeta(n);
      })
      .catch(() => {
        if (!cancelled) setPairFileMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pairNum]);

  const meta = useMemo(() => {
    if (dbList != null && dbList.length === 5) return dbList[rowIndex] ?? DEFAULT_META;
    if (pairFileMeta != null) return pairFileMeta;
    return fallbackList[rowIndex] ?? DEFAULT_META;
  }, [dbList, pairFileMeta, fallbackList, rowIndex]);

  const [pa, pb] = useMemo(() => {
    const r = rows[rowIndex] as unknown[] | undefined;
    const [a, b] = parseRound1PairTotalsFromRow(r);
    return pctPair(a, b);
  }, [rows, rowIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      if (e.code === "KeyN") {
        e.preventDefault();
        setPairNavVisible((v) => !v);
        return;
      }

      const map: Record<string, number> = {
        Digit1: 1,
        Digit2: 2,
        Digit3: 3,
        Digit4: 4,
        Digit5: 5,
      };
      const n = map[e.code];
      if (n != null) {
        e.preventDefault();
        navigate(`/stage/round1/${n}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const p1 = pa.toFixed(1);
  const p2 = pb.toFixed(1);

  return (
    <div className="r1pk-wrap">
      <Link className="r1pk-back" to="/">
        ← 返回控制台
      </Link>
      {error && <div className="r1pk-banner">{error}</div>}

      <div className="r1pk-header">
        <div className="r1pk-side">
          {meta.leftImg ? (
            <img className="r1pk-avatar" src={meta.leftImg} alt="" />
          ) : (
            <div className="r1pk-avatar" aria-hidden />
          )}
          <div className="r1pk-name r1pk-name--left">
            <div>{meta.leftName}</div>
          </div>
        </div>
        <span className="r1pk-pk">PK</span>
        <div className="r1pk-side">
          <div className="r1pk-name r1pk-name--right">
            <div>{meta.rightName}</div>
          </div>
          {meta.rightImg ? (
            <img className="r1pk-avatar" src={meta.rightImg} alt="" />
          ) : (
            <div className="r1pk-avatar" aria-hidden />
          )}
        </div>
      </div>

      <div className="bar-container">
        <div className="bar" id="r1pk-bar1" style={{ height: `${Math.max(2, pa)}%` }}>
          <div className="bar-front" />
          <div className="bar-side" />
          <div className="bar-top" />
        </div>
        <div className="bar" id="r1pk-bar2" style={{ height: `${Math.max(2, pb)}%` }}>
          <div className="bar-front" />
          <div className="bar-side" />
          <div className="bar-top" />
        </div>
      </div>

      <div className="percentage-container">
        <span className="percentage-text">{p1}%</span>
        <span className="percentage-text">{p2}%</span>
      </div>

      <nav
        className={`r1pk-pair-nav${pairNavVisible ? "" : " r1pk-pair-nav--hidden"}`}
        aria-label="切换组别"
        aria-hidden={!pairNavVisible}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <Link key={n} to={`/stage/round1/${n}`} className={n === pairNum ? "active" : ""}>
            {ROUND1_LABELS[n - 1] ?? n}
          </Link>
        ))}
      </nav>
      {hintsVisible &&
        (!cleanUi ? (
          <p className="stage-sub">
            键盘 <kbd>1</kbd>–<kbd>5</kbd> 切换组别 · <kbd>N</kbd> 显示/隐藏下方「第 N 轮」条 · <kbd>R</kbd>{" "}
            显示/隐藏本说明 · 读取 <code>{cfg.round1AudienceRange}</code> 第 {pairNum} 条数据行（全表通常第{" "}
            {pairNum + 1} 行，第 1 行为表头）· 柱高 = （观众左+评委左）:（观众右+评委右）· 头图/姓名{" "}
            <code>GET /api/stage/round1-pairs</code>
          </p>
        ) : (
          <p className="stage-sub stage-sub--clean">
            键盘 <kbd>1</kbd>–<kbd>5</kbd> 切换组别 · <kbd>N</kbd> 显示/隐藏下方轮次条 · <kbd>R</kbd> 显示/隐藏本说明
          </p>
        ))}
    </div>
  );
}
