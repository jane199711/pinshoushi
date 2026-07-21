import { useCallback, useEffect, useRef, useState } from "react";
import {
  getThemeWordsByCategory,
  COMMON,
} from "@/lib/poetry.local";
import { TextCarrier, TEXT_VARIANTS, type TextVariant, createElement, type CanvasElement, type ElementKind } from "./Canvas";
import { loadPreset, type Template } from "@/lib/work-storage";

type FallingPiece = {
  id: string;
  word: string;
  variant: TextVariant;
  fontFamily: "serif" | "hand";
  startX: number; // vw percentage
  drift: number; // px horizontal drift
  rotation: number; // deg
  scale: number;
  duration: number; // seconds
  /** 沉底阶段：碎片到达底部后进入"沉没"状态 */
  sinking?: boolean;
};

// ─── 分桶词池：按词性分类，pickWord 按比例取词 ───
interface BucketPool {
  nouns: string[];       // 主题名词 + 中性名词
  adjectives: string[];  // 主题形容词
  verbs: string[];       // 主题动词 + 公共日常动词
  func: string[];        // 虚词（副词+连词+助词+代词）
  imagery: string[];     // 主题短片段
}

// ─── 固定档位（无限流飘落，不随画布元素增多而减速）───
interface TierConfig {
  maxPieces: number;    // 屏幕同时最大碎片数
  spawnMin: number;    // 最小生成间隔 ms
  spawnMax: number;    // 最大生成间隔 ms
}

function getTier(_placedCount: number): TierConfig {
  return { maxPieces: 20, spawnMin: 700, spawnMax: 1600 };
}

const COOLDOWN_MS = 25_000;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 生成分桶词库：按词性分类（名词/形容词/动词/虚词/短片段），
 * 供 pickWord 按比例取词——同一批飘落保持各词性均衡，不会全是名词。
 */
function buildBucketPool(): BucketPool {
  const p = loadPreset();
  // 「自由」(free) 现为穆旦风格主题词库，与其它主题同等处理
  const tpl = p?.template ? (p.template as Template) : null;
  const cats = getThemeWordsByCategory(tpl ?? "all");

  return {
    nouns: shuffle(uniq([...cats.nouns, ...COMMON.neutralNouns.slice(0, 8)])),
    adjectives: shuffle(cats.adjectives),
    verbs: shuffle(uniq([...cats.verbs, ...COMMON.dailyVerbs.slice(0, 28)])),
    func: shuffle(uniq([
      ...COMMON.adverbs.slice(0, 16),
      ...COMMON.conjunctions.slice(0, 12),
      ...COMMON.particles.slice(0, 32),
    ])),
    imagery: shuffle(cats.imagery),
  };
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

/**
 * 选择飘落起始横向位置（vw，即碎片左边缘）：绕开已固定在画布上的「词条」元素，
 * 避免飘落碎片遮挡用户已摆放的词。左右两侧只要有空档就都能飘落，
 * 且碎片边框可贴到屏幕边缘（但不越出屏幕）。
 *
 * 注意：左上 To 框(header) / 右下署名框(signature) 属海报装饰，不算词条，
 * 不计入避让，否则它们探出屏幕会把整侧空档吃掉。
 */
function pickStartXAvoidingPinned(): number {
  if (typeof window === "undefined") return Math.random() * 86;
  const vw = window.innerWidth;
  const MIN = 0; // 允许碎片贴到屏幕左右边缘
  const MAX = 100;
  const SPAWN_MAX = MAX - 14; // 碎片左边缘上限：保证整块（约 14vw 宽）落在屏幕内
  const pad = 8; // 词条两侧留白(px)：边框可贴近触碰，但不进入词条
  const padVw = (pad / vw) * 100;
  const fragW = 14; // 预估碎片宽度(vw)

  // 仅收集真正的词条（排除 header / signature 装饰），
  // 把每个词条的横向禁区换算成「碎片左边缘不可落入的区间」：
  // 碎片占据 [sx, sx+fragW]，要避开 [wl-pad, wr+pad]，
  // 当且仅当 sx ∈ (wl-pad-fragW, wr+pad) 时重叠 → 此为左边缘禁区。
  const sel =
    '[data-element-id]:not([data-el-kind="header"]):not([data-el-kind="signature"])';
  const raw: Array<[number, number]> = [];
  document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const wl = (r.left / vw) * 100;
    const wr = (r.right / vw) * 100;
    raw.push([wl - padVw - fragW, wr + padVw]);
  });

  // 裁剪到 [MIN, SPAWN_MAX]，合并重叠禁区，求补集 = 可用空档
  const forbidden = raw
    .map(([a, b]) => [Math.max(MIN, a), Math.min(SPAWN_MAX, b)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const free: Array<[number, number]> = [];
  let cursor = MIN;
  for (const [a, b] of forbidden) {
    if (a > cursor) free.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < SPAWN_MAX) free.push([cursor, SPAWN_MAX]);

  // 按各空档真实宽度加权均匀取样：哪边有空就往哪边飘，天然对称。
  if (free.length) {
    const total = free.reduce((s, [a, b]) => s + (b - a), 0);
    let r = Math.random() * total;
    for (const [a, b] of free) {
      const len = b - a;
      if (r < len) return a + Math.random() * len;
      r -= len;
    }
    const last = free[free.length - 1];
    return last[0] + Math.random() * (last[1] - last[0]);
  }

  // 画布几乎被铺满、找不到空档时，退化到整域随机（仍保证不出屏）
  return Math.random() * SPAWN_MAX;
}

let idCounter = 0;

export function FallingFragments({
  placedCount,
  active = true,
  onPinToCanvas,        // 点击碎片时回调：将碎片固定到画布上
}: {
  placedCount?: number;
  active?: boolean;
  onPinToCanvas?: (element: CanvasElement) => void;
}) {
  const [pieces, setPieces] = useState<FallingPiece[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  const bigPoolRef = useRef<BucketPool | null>(null);
  const onScreenRef = useRef<Set<string>>(new Set());
  const cooldownRef = useRef<Map<number, string>>(new Map());

  // 中部续批计数：跟踪"已飘到页面中部"的碎片数，达到每屏一半时才触发下一批
  const piecesRef = useRef<FallingPiece[]>([]);
  const middleCountRef = useRef(0);
  useEffect(() => { piecesRef.current = pieces; }, [pieces]);

  // 当前生效的档位（缓存避免频繁重建）
  const tierRef = useRef<TierConfig>(getTier(placedCount ?? 0));

  // 同步外部 placedCount 到内部档位
  useEffect(() => {
    tierRef.current = getTier(placedCount ?? 0);
  }, [placedCount]);

  // ─── 生成 / 掉落逻辑（组件级，供定时器与"到达中部"回调共用）───

  const pickWord = useCallback((): string | null => {
    const pool = bigPoolRef.current;
    if (!pool) return null;

    // 词性比例：名词25% / 形容词20% / 动词30% / 虚词15% / 短片段10%
    const r = Math.random();
    let bucket: string[];
    if (r < 0.25) bucket = pool.nouns;
    else if (r < 0.45) bucket = pool.adjectives;
    else if (r < 0.75) bucket = pool.verbs;
    else if (r < 0.90) bucket = pool.func;
    else bucket = pool.imagery;

    // 虚词允许重复
    if (bucket === pool.func) {
      return bucket[Math.floor(Math.random() * bucket.length)];
    }

    // 非虚词不许重复：只取不在屏幕上的词
    const avail = bucket.filter((w) => !onScreenRef.current.has(w));
    if (avail.length > 0) {
      return avail[Math.floor(Math.random() * Math.min(avail.length, 6))];
    }

    // 该非虚词桶用完了，先试其他非虚词桶
    const nonFuncBuckets = shuffle([pool.nouns, pool.adjectives, pool.verbs, pool.imagery]);
    for (const b of nonFuncBuckets) {
      const avail2 = b.filter((w) => !onScreenRef.current.has(w));
      if (avail2.length > 0) return avail2[Math.floor(Math.random() * avail2.length)];
    }

    // 所有非虚词都用完了，从虚词桶取（允许重复）
    return pool.func[Math.floor(Math.random() * pool.func.length)];
  }, []);

  const spawnPiece = useCallback(() => {
    setPieces((prev) => {
      const tier = tierRef.current;
      if (prev.length >= tier.maxPieces) return prev;

      const word = pickWord();
      if (!word) return prev;
      onScreenRef.current.add(word);
      const variant = TEXT_VARIANTS[Math.floor(Math.random() * TEXT_VARIANTS.length)];
      const fontFamily: "serif" | "hand" =
        variant === "grid-note" || variant === "blue-washi" ? "hand" : "serif";

      // 总时长 = 下落时间 + 沉底时间（沉底约占最后 30%）
      const fallDuration = 9 + Math.random() * 8;   // 9-17s 下落
      const sinkDuration = 3 + Math.random() * 3;    // 3-6s 沉底消失

      const piece: FallingPiece = {
        id: `fall-${++idCounter}`,
        word,
        variant,
        fontFamily,
        startX: pickStartXAvoidingPinned(), // 绕开已固定词条，左右均可飘落，边缘可贴屏
        drift: (Math.random() - 0.5) * 140,
        rotation: (Math.random() - 0.5) * 18,
        scale: 0.85 + Math.random() * 0.3,
        duration: fallDuration + sinkDuration,
      };
      return [...prev, piece];
    });
  }, [pickWord]);

  const spawnBatch = useCallback(
    (n: number) => {
      for (let i = 0; i < n; i++) setTimeout(spawnPiece, i * 160);
    },
    [spawnPiece],
  );

  // 中部续批：当本屏已有"一半碎片"飘到页面中部时，才触发下一批
  const handleReachMiddle = useCallback(() => {
    middleCountRef.current += 1;
    const total = piecesRef.current.length;
    if (total <= 0) {
      middleCountRef.current = 0;
      return;
    }
    const threshold = Math.max(1, Math.ceil(total / 2)); // 每屏一半
    if (middleCountRef.current >= threshold) {
      middleCountRef.current = 0;
      spawnBatch(5); // 与初始批量一致，保证后续飘落量充裕
    }
  }, [spawnBatch]);

  // 暂停时：停止生成新碎片（定时器 effect 依赖 active）+ 冻结并淡出已有碎片
  useEffect(() => {
    if (active) return;
    // 冻结后约 1.8s 淡出完成，移除全部碎片（清理屏幕词表，保证重启后零重复）
    const t = setTimeout(() => {
      onScreenRef.current.clear();
      cooldownRef.current.clear();
      setPieces([]);
    }, 2000);
    return () => clearTimeout(t);
  }, [active]);

  // 初始化词库
  useEffect(() => {
    const pool = buildBucketPool();
    bigPoolRef.current = pool;
    setPoolReady(true);

    const interval = setInterval(() => {
      const now = Date.now();
      for (const [ts, word] of cooldownRef.current) {
        if (now > ts) cooldownRef.current.delete(ts);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // 定时生成新碎片（逐片，作为中部续批的兜底补充）——仅 active 时生成
  useEffect(() => {
    if (!poolReady || !bigPoolRef.current || !active) return;

    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    const loop = () => {
      if (stopped) return;
      // 每轮持续生成 1~2 个，保证两个续批批次之间也不空窗、始终有碎片在飘
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) spawnPiece();
      const { spawnMin, spawnMax } = tierRef.current;
      timer = setTimeout(loop, spawnMin + Math.random() * (spawnMax - spawnMin));
    };

    // 初始快速生成几个
    for (let i = 0; i < 5; i++) {
      setTimeout(spawnPiece, i * 250);
    }
    timer = setTimeout(loop, 1500);

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [poolReady, active, spawnPiece]);

  const removePiece = useCallback((id: string, word: string) => {
    onScreenRef.current.delete(word);
    cooldownRef.current.set(Date.now() + COOLDOWN_MS, word);
    setPieces((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // 注意：不在 placedCount 变化时截断已有碎片——那样会导致碎片突然消失。
  // 新碎片的生成数量已由 spawnPiece 里的 maxPieces 检查控制，已有碎片应自然飘完。

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-30 overflow-hidden ${active ? "" : "pieces-paused"}`}
      style={{ contain: "strict" }}
    >
      {/* 三阶段动画：下落 → 沉底 → 消失 */}
      <style>{`
        @keyframes fall-sink {
          /* 阶段 1：从顶部飘落 (0% → 70%) */
          0% {
            transform: translateY(-80px) translateX(0) rotate(var(--rot)) scale(var(--s-start));
            opacity: 0;
          }
          4% {
            opacity: 0.88;
            transform: translateY(calc(var(--fall-dist) * 0.04)) translateX(calc(var(--drift) * 0.04)) rotate(var(--rot)) scale(var(--s-start));
          }

          /* 阶段 2：接近底部开始沉底 (70% → 85%) — 保持较大尺寸 */
          70% {
            opacity: 0.85;
            transform: translateY(calc(var(--fall-dist) * 0.7)) translateX(calc(var(--drift) * 0.7))
                       rotate(calc(var(--rot) + 6deg)) scale(var(--s-mid));
          }
          78% {
            opacity: 0.6;
            transform: translateY(calc(var(--fall-dist) * 0.82)) translateX(calc(var(--drift) * 0.82))
                       rotate(calc(var(--rot) + 10deg)) scale(calc(var(--s-mid) * 0.75));
          }

          /* 阶段 3：沉到底部，透明+缩小直到消失 (85% → 100%) */
          88% {
            opacity: 0.25;
            transform: translateY(calc(var(--fall-dist) * 0.92)) translateX(calc(var(--drift) * 0.92))
                       rotate(calc(var(--rot) + 14deg)) scale(0.25);
          }
          95% {
            opacity: 0.05;
            transform: translateY(calc(var(--fall-dist))) translateX(calc(var(--drift)))
                       rotate(calc(var(--rot) + 18deg)) scale(0.08);
          }
          100% {
            opacity: 0;
            transform: translateY(calc(var(--fall-dist) + 40px)) translateX(calc(var(--drift) + var(--sink-drift)))
                       rotate(calc(var(--rot) + 22deg)) scale(0);
          }
        }
        @keyframes sway {
          0%, 100% { margin-left: 0; }
          50% { margin-left: var(--sway-amt); }
        }
        /* 暂停：冻结飘落动画（内层），外层缓慢淡出至透明后消失 */
        .pieces-paused .falling-piece-inner {
          animation-play-state: paused !important;
        }
        .pieces-paused .falling-piece-outer {
          opacity: 0;
          transition: opacity 1.8s ease-in;
        }
      `}</style>
      {pieces.map((p) => (
        <FallingPiece
          key={p.id}
          piece={p}
          onRemove={removePiece}
          onPinToCanvas={onPinToCanvas}
          onReachMiddle={handleReachMiddle}
        />
      ))}
    </div>
  );
}

function FallingPiece({
  piece,
  onRemove,
  onPinToCanvas,
  onReachMiddle,
}: {
  piece: FallingPiece;
  onRemove: (id: string, word: string) => void;
  onPinToCanvas?: (element: CanvasElement) => void;
  onReachMiddle?: (id: string) => void;
}) {
  // 拖拽态：用指针事件精准选中鼠标正下方的那一块（替代不稳定的原生 HTML5 拖放）
  const [dragging, setDragging] = useState(false);
  const innerRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    offsetX: number;
    offsetY: number;
    pointerId: number;
  } | null>(null);
  const draggingRef = useRef(false);

  // 飘落到页面中部（下落占动画前 70%，中部≈总时长 35%）时，通知父层开始下一批
  const firedRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!firedRef.current) {
        firedRef.current = true;
        onReachMiddle?.(piece.id);
      }
    }, piece.duration * 350);
    return () => clearTimeout(t);
  }, [piece.id, onReachMiddle]);

  // 后备：确保碎片在动画结束后一定被移除（拖拽中跳过，避免拖到一半被删）
  useEffect(() => {
    const t = setTimeout(() => {
      if (draggingRef.current) return;
      onRemove(piece.id, piece.word);
    }, (piece.duration + 2) * 1000);
    return () => clearTimeout(t);
  }, [piece.id, piece.duration, onRemove]);

  // 将碎片固定到画布：以视口坐标落点创建画布元素（与点击固定同一约定）
  const pinAt = useCallback(
    (cx: number, cy: number) => {
      const element = createElement({
        kind: "text" as ElementKind,
        variant: piece.variant,
        content: piece.word,
        fontFamily: piece.fontFamily,
        x: cx,
        y: cy,
        rotation: (Math.random() - 0.5) * 6,
      });
      onPinToCanvas?.(element);
      onRemove(piece.id, piece.word);
    },
    [piece.variant, piece.word, piece.fontFamily, piece.id, onPinToCanvas, onRemove],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // 事件目标即鼠标正下方的这一块 → 精准单选，不会误抓重叠的其它碎片
    e.stopPropagation();
    e.preventDefault();
    const target = innerRef.current ?? (e.currentTarget as HTMLElement);
    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    dragRef.current = {
      offsetX: e.clientX - cx,
      offsetY: e.clientY - cy,
      pointerId: e.pointerId,
    };
    setDragPos({ x: cx, y: cy });
    draggingRef.current = true;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setDragPos({ x: e.clientX - d.offsetX, y: e.clientY - d.offsetY });
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(d.pointerId);
    } catch {
      /* noop */
    }
    const pos =
      dragPos ??
      (() => {
        const r = (innerRef.current ?? e.currentTarget).getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })();
    draggingRef.current = false;
    dragRef.current = null;
    setDragging(false);
    setDragPos(null);
    pinAt(pos.x, pos.y);
  };

  // 计算下落距离（总视口高度 + 一点余量让碎片能沉到屏幕外）
  const fallDist = typeof window !== "undefined" ? window.innerHeight : 900;
  const sStart = piece.scale;
  const sMid = piece.scale * 0.8; // 沉底前保持较大尺寸（80%），不再急剧缩小
  const sinkDrift = (Math.random() - 0.5) * 60;

  return (
    // 外层：常态绝对定位飘落；拖拽时切换为 fixed 跟随光标。内层：飘落动画（拖拽/暂停时冻结）
    <div
      className="falling-piece-outer absolute"
      style={
        dragging && dragPos
          ? {
              position: "fixed",
              left: 0,
              top: 0,
              zIndex: 9999,
              cursor: "grabbing",
              transform: `translate(${dragPos.x}px, ${dragPos.y}px) translate(-50%, -50%) rotate(${piece.rotation}deg)`,
              pointerEvents: "auto",
            }
          : { left: `${piece.startX}vw`, top: 0, cursor: "grab", pointerEvents: "auto" }
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      title={`点击固定「${piece.word}」或拖拽到画布`}
    >
      <div
        className="falling-piece-inner"
        ref={innerRef}
        onAnimationEnd={(e) => {
          // 只在 fall-sink 结束时移除（sway 是 infinite，不触发）；拖拽中动画为 none，不会误触发
          if (e.animationName === "fall-sink") onRemove(piece.id, piece.word);
        }}
        style={
          {
            "--rot": `${piece.rotation}deg`,
            "--drift": `${piece.drift}px`,
            "--sway-amt": `${piece.drift * 0.3}px`,
            "--fall-dist": `${fallDist}px`,
            "--s-start": sStart,
            "--s-mid": sMid,
            "--sink-drift": `${sinkDrift}px`,
            animation: dragging
              ? "none"
              : `fall-sink ${piece.duration}s linear forwards, sway ${piece.duration / 3}s ease-in-out infinite`,
            opacity: dragging ? 1 : undefined,
          } as React.CSSProperties
        }
      >
        <div
          style={{
            transform: `scale(${piece.scale})`,
            transformOrigin: "center",
            filter: dragging
              ? "drop-shadow(0 8px 16px oklch(0 0 0 / 0.25))"
              : "drop-shadow(0 2px 6px oklch(0 0 0 / 0.12))",
          }}
        >
          <TextCarrier
            el={{
              id: "",
              kind: "text",
              variant: piece.variant,
              content: piece.word,
              x: 0,
              y: 0,
              rotation: 0,
              scale: 1,
              z: 0,
              fontFamily: piece.fontFamily,
            }}
          />
        </div>
      </div>
    </div>
  );
}
