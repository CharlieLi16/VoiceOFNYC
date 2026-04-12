import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/** 设为 "1" 时在大屏显示技术说明（表范围、API、列号等）；默认不显示 */
const LS_HINT_KEY = "voiceofnyc-stage-hint";

/**
 * 现场投屏默认「干净」：隐藏 stage 页底部/副标题里的技术说明。
 *
 * 需要看技术说明时（任一即可）：
 * - URL 加 `?hint=1`
 * - 控制台：`localStorage.setItem("voiceofnyc-stage-hint","1")`（关闭：`removeItem`）
 *
 * 若已开启 hint 持久化，本次仍想干净：URL 加 `?clean=1` 或 `?present=1` 或 `?kiosk=1`（仅当次生效，不改动 localStorage）。
 *
 * 另：在大屏路由按 **R**（无修饰键）可切换副标题/操作说明显隐，与 `?clean=` 等独立。
 */
export function readStageHintModeFromStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LS_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/** @returns true 表示使用干净副标题（默认）；false 表示显示完整技术说明 */
export function useStageCleanUi(): boolean {
  const [sp] = useSearchParams();
  return useMemo(() => {
    const q = (k: string) => sp.get(k) === "1";
    if (q("clean") || q("present") || q("kiosk")) return true;
    if (q("hint")) return false;
    return !readStageHintModeFromStorage();
  }, [sp]);
}
