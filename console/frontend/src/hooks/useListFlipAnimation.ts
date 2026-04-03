import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * 列表 **DOM 顺序** 变化时，用 FLIP（First–Last–Invert–Play）让已有行沿 Y 轴滑到新位置，
 * 看起来像「挤名次」。依赖 `depKey` 在每次数据更新后触发测量；首次布局不播放（没有「上一帧」可对比）。
 *
 * ---
 * 调参速查（改哪里 → 什么效果）
 *
 * | 位置 | 作用 |
 * |------|------|
 * | `depKey`（调用方传入） | 任意在「排序/列表内容」变时变的值。不变则 effect 不跑、不 FLIP。常用：`id:votes` 拼接串。 |
 * | `itemSelector` | 能选中带 `data-flip-id` 的行节点。改错会选不到元素 → 完全不动画。 |
 * | `prevRects` | 内部缓存：上一帧每个 id 的 `getBoundingClientRect()`。**不要手改**；错序时靠它和本帧 rect 算位移。 |
 * | `isFirstLayout` | 第一次 layout 只建缓存、不动画。若想 **首屏也播**（无意义，因无旧位置），可改逻辑去掉 `!isFirstLayout`。 |
 * | `reduce`（`prefers-reduced-motion`） | 系统「减少动效」为 true 时跳过 `animate`，只更新缓存。调试动画可暂时在 OS/浏览器关掉该选项。 |
 * | `Math.abs(dy) < 1.5` 阈值 | 垂直位移小于约 1.5px 视为无移动、不播。**调大**（如 4）→ 小抖动也不动画；**调小**（如 0.5）→ 更敏感、可能多余闪烁。 |
 * | `duration`（ms） | 换位滑动时长。**越大**越慢、观众越好看清；**越小**越干脆。 |
 * | `easing` | `cubic-bezier(...)`：前两个控制起点「冲出」感，后两个控制收尾。更「线性」可试 `ease-in-out`；更「弹尾」可把末段拉高。 |
 *
 * 调试技巧：在 `if (Math.abs(dy) < 1.5)` 前 `console.log(id, dy)` 看每次换位像素；确认 `depKey` 是否在投票更新时真的变化。
 */
export function useListFlipAnimation(
  /** 包住所有可换位行的容器（如 `<ol>`），`querySelectorAll` 在其内部执行 */
  listRef: RefObject<HTMLElement | null>,
  /**
   * 依赖键：变了才会跑 layout 测量 +（非首帧）FLIP。
   * 建议与「排序结果」强绑定，例如 sorted 每项拼成 "id:votes" 再用 join("|")。
   * - 太粗（常不变）→ 顺序变了但 key 没变 → **不动画**。
   * - 太细（每帧都变）→ 可能不必要的 effect；一般 votes/order 串足够。
   */
  depKey: unknown,
  options?: {
    /**
     * 选中参与 FLIP 的元素，且元素上要有 `data-flip-id="稳定 id"`（与 React `key` 同源最稳）。
     * 默认 `"[data-flip-id]"`。若改成别的选择器，必须仍能读到 `dataset.flipId`。
     */
    itemSelector?: string;
  }
) {
  /** 上一帧 layout 结束时各 id 的 bounding rect，用于算 `dy = prev.top - next.top` */
  const prevRects = useRef<Map<string, DOMRect>>(new Map());
  /** true = 尚未完成第一次测量，跳过动画避免无参照的 FLIP */
  const isFirstLayout = useRef(true);
  const itemSelector = options?.itemSelector ?? "[data-flip-id]";

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = list.querySelectorAll<HTMLElement>(itemSelector);
    /** 本帧各 id 的位置；本 effect 末尾会写入 `prevRects` 供下一轮使用 */
    const nextRects = new Map<string, DOMRect>();

    els.forEach((el) => {
      const id = el.dataset.flipId;
      if (id) nextRects.set(id, el.getBoundingClientRect());
    });

    if (!reduce && !isFirstLayout.current) {
      els.forEach((el) => {
        const id = el.dataset.flipId;
        if (!id) return;
        const prev = prevRects.current.get(id);
        const next = nextRects.get(id);
        if (!prev || !next) return;
        /** 正数表示元素在旧布局里更靠下：要往上移（translateY 为正）才能「回到」旧视觉位置，再动画回 0 */
        const dy = prev.top - next.top;
        if (Math.abs(dy) < 1.5) return;
        el.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
          {
            /** 换位滑动总时长（毫秒）↑ 更慢、更易看清 */
            duration: 1200,
            /** 缓动：影响先快后慢还是更接近匀速；可换 `"ease-in-out"` 做对比调试 */
            easing: "cubic-bezier(0.25, 0.9, 0.2, 1)",
          }
        );
      });
    }

    prevRects.current = nextRects;
    isFirstLayout.current = false;
  }, [depKey, itemSelector]);
}
