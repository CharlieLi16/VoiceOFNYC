import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Ctx = {
  hintsVisible: boolean;
};

const StageHintsContext = createContext<Ctx | null>(null);

/**
 * 现场大屏：按 <kbd>R</kbd>（无修饰键）切换底部/副标题等操作说明的显示。
 * 与各环节页内 <kbd>Shift+R</kbd> 重置等快捷键区分。
 */
export function StageHintsProvider({ children }: { children: ReactNode }) {
  const [hintsVisible, setHintsVisible] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyR" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      setHintsVisible((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ hintsVisible }), [hintsVisible]);
  return <StageHintsContext.Provider value={value}>{children}</StageHintsContext.Provider>;
}

/** 未包裹 Provider 时视为始终显示（非大屏路由） */
export function useStageHintsVisible(): boolean {
  const ctx = useContext(StageHintsContext);
  return ctx?.hintsVisible ?? true;
}
