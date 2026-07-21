import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

/* ==================================================================
 * 复古拼贴手帐 · Vintage Collage Journal —— 统一配色与做旧工具
 * 基调：暖白 / 米黄 / 旧纸褐；辅助：暗红 / 苔绿 / 藏蓝
 * 情绪：温暖、手工感、文艺、克制、有呼吸感（低饱和、透明度 0.6-0.9）
 * ================================================================== */
const VCJ = {
  warmWhite: "#F5F0E6",
  cream: "#EDE6D6",
  paperBrown: "#D4C5A9",
  darkRed: "#8B3A3A",
  moss: "#6B7B5A",
  navy: "#4A5B6B",
  ink: "#7A6A4E",
  twine: "#C9B892",
} as const;

/** 辅助色选择（用于线稿描边） */
function vcjStroke(key?: string): string {
  return key === "darkred"
    ? VCJ.darkRed
    : key === "moss"
      ? VCJ.moss
      : key === "brown"
        ? VCJ.paperBrown
        : VCJ.navy;
}

/** 极浅咖啡渍晕圈（做旧细节，透明度 0.15） */
function CoffeeStains({ spots }: { spots: number[][] }) {
  return (
    <>
      {spots.map(([top, left, size], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top,
            left,
            width: size,
            height: size,
            borderRadius: "50%",
            border: `${Math.max(1.5, size * 0.1)}px solid ${VCJ.paperBrown}`,
            background: `radial-gradient(circle, ${VCJ.paperBrown}22 0%, transparent 70%)`,
            opacity: 0.15,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

/** 生成锯齿/齿孔矩形 clip-path（复古邮票边缘） */
function serratedClip(w: number, h: number, tooth = 6): string {
  const nx = Math.max(4, Math.round(w / tooth));
  const ny = Math.max(4, Math.round(h / tooth));
  const d = tooth * 0.55;
  const pts: string[] = [];
  for (let i = 0; i <= nx; i++) pts.push(`${(i / nx) * w}px ${i % 2 === 0 ? 0 : d}px`);
  for (let i = 1; i <= ny; i++) pts.push(`${i % 2 === 0 ? w : w - d}px ${(i / ny) * h}px`);
  for (let i = 1; i <= nx; i++) pts.push(`${w - (i / nx) * w}px ${i % 2 === 0 ? h : h - d}px`);
  for (let i = 1; i < ny; i++) pts.push(`${i % 2 === 0 ? 0 : d}px ${h - (i / ny) * h}px`);
  return `polygon(${pts.join(",")})`;
}

export type ElementKind = "text" | "decor" | "bg" | "image" | "signature" | "header";

// Variant tokens per kind
export type TextVariant = "grid-note" | "blue-washi" | "kraft-tag" | "newspaper";
export type DecorVariant =
  | "washi-check"
  | "washi-kraft"
  | "doodle-star"
  | "doodle-arrow"
  | "stamp"
  | "flower"
  | "wax-seal"
  | "ribbon"
  | "note-card"
  | "photo"
  | "torn-paper"
  | "magazine-label"
  | "pastel-cloud"
  | "pressed-leaf"
  | "heart-tag"
  | "ink-frame"
  | "pink-check-tape"
  | "burnt-letter"
  | "watercolor-bow"
  | "gold-coin"
  | "silver-coin"
  | "dried-sprig"
  | "dried-rose"
  | "kraft-tag-blank"
  | "kraft-parcel"
  | "botanical-stamp"
  | "wax-seal-tree"
  | "twine-bow"
  | "postcard"
  // ——— 复古拼贴手帐 Vintage Collage Journal 素材 ———
  | "torn-frame"
  | "gift-tag"
  | "ribbon-bow"
  | "vintage-stamp"
  | "sprig-line"
  | "leaf-line"
  | "wave-line"
  | "dotted-line"
  | "poster-mat";
export type BgVariant = "polaroid" | "grid-large" | "kraft-large" | "letter";

export const TEXT_VARIANTS: TextVariant[] = [
  "grid-note",
  "blue-washi",
  "kraft-tag",
  "newspaper",
];

export type CanvasElement = {
  id: string;
  kind: ElementKind;
  variant?: TextVariant | DecorVariant | BgVariant;
  x: number;
  y: number;
  rotation: number;
  scale: number;
  z: number;
  content?: string;
  content2?: string;
  src?: string;
  width?: number;
  height?: number;
  fontFamily?: "serif" | "hand";
};

let zCounter = 10;
const uid = () => Math.random().toString(36).slice(2, 10);

export function createElement(
  partial: Partial<CanvasElement> & { kind: ElementKind },
): CanvasElement {
  zCounter += 1;
  return {
    id: uid(),
    x: 220 + Math.random() * 240,
    y: 180 + Math.random() * 220,
    rotation: (Math.random() - 0.5) * 8,
    scale: 1,
    z: zCounter,
    ...partial,
  };
}

// Effective z: bg bottom, image, decor, text, header, signature top.
// 使用分层 + 层内 z 的方式，避免 bringToFront 把 text 的 z 提到 header 之上。
function effectiveZ(el: CanvasElement) {
  const layer =
    el.kind === "bg" ? 0
    : el.kind === "image" ? 1
    : el.kind === "decor" ? 2
    : el.kind === "text" ? 3
    : el.kind === "header" ? 4
    : 5; // signature
  return layer * 1_000_000 + (el.z % 1_000_000);
}

type Props = {
  elements: CanvasElement[];
  setElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  hideChrome: boolean;
  recenterTo?: { x: number; y: number; nonce: number } | null;
};

// 长按触发时间（ms）
const LONG_PRESS_MS = 500;
// 超过该位移（px）才视为"明确拖拽意图"，从而取消长按计时器；
// 小于该值的轻微抖动（触摸板/鼠标静止时的微移）保留长按触发，保证删除区一定能出现
const DRAG_CANCEL_PX = 12;

export function Canvas({ elements, setElements, selectedId, setSelectedId, hideChrome, recenterTo }: Props) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panState = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);
  const dragState = useRef<{
    id: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
    longPressFired: boolean;
    /** 拖拽过程中检测到的覆盖目标元素 ID（用于替换） */
    hoverTargetId: string | null;
  } | null>(null);

  // 长按检测：记录长按状态和计时器
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 删除模式：长按某元素后激活，进入删除模式后右侧出现删除区；
  // 该状态与拖拽移动解耦——激活后即使开始拖动，删除区也保持显示，松手落在右侧才删除
  const [deleteModeId, setDeleteModeId] = useState<string | null>(null);
  const [deleteZoneActive, setDeleteZoneActive] = useState(false);
  const [deleteZoneHover, setDeleteZoneHover] = useState(false);

  // 拖拽替换目标：记录当前拖拽悬停的元素ID
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);

  // 文本编辑模式：双击词条进入编辑（contentEditable 聚焦），失焦退出
  const [editingId, setEditingId] = useState<string | null>(null);

  const onBgPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    setSelectedId(null);
    panState.current = { startX: e.clientX, startY: e.clientY, origin: { ...pan } };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onBgPointerMove = (e: React.PointerEvent) => {
    if (!panState.current) return;
    setPan({
      x: panState.current.origin.x + (e.clientX - panState.current.startX),
      y: panState.current.origin.y + (e.clientY - panState.current.startY),
    });
  };
  const onBgPointerUp = (e: React.PointerEvent) => {
    panState.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    setZoom((z) => Math.min(2, Math.max(0.4, z - e.deltaY * 0.001)));
  };

  const bringToFront = useCallback(
    (id: string) => {
      zCounter += 1;
      const nz = zCounter;
      setElements((els) => els.map((el) => (el.id === id ? { ...el, z: nz } : el)));
    },
    [setElements],
  );

  const onElPointerDown = (e: React.PointerEvent, el: CanvasElement) => {
    // 编辑模式下不启动拖拽（允许在文本框内选中/输入）
    if (editingId === el.id) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(el.id);
    dragState.current = {
      id: el.id,
      offsetX: e.clientX / zoom - el.x,
      offsetY: e.clientY / zoom - el.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      longPressFired: false,
      hoverTargetId: null,
    };
    // 先把指针捕获到被拖元素，再置顶，避免按下瞬间重排导致捕获丢失
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // 启动长按计时器：到时即进入删除模式（显示右侧删除区）。
    // 注意：计时器只在"明确的拖拽意图（移动超过 DRAG_CANCEL_PX）"时才取消，
    // 轻微抖动不会取消长按，保证触摸板/鼠标长按时删除区一定能出现。
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    longPressTimerRef.current = setTimeout(() => {
      dragState.current && (dragState.current.longPressFired = true);
      setDeleteModeId(el.id);
      setDeleteZoneActive(true);
    }, LONG_PRESS_MS);
  };

  const onElPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current;
    if (!st) return;

    const dist = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
    // 仅在"明确拖拽意图"时取消长按计时器；轻微抖动（<DRAG_CANCEL_PX）保留长按触发
    if (!st.moved && dist >= DRAG_CANCEL_PX) {
      st.moved = true;
      // 真正开始拖拽时才置顶，避免按下瞬间重排打断指针捕获
      bringToFront(st.id);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    // 若长按已触发（已进入删除模式），继续跟随手指移动元素，并检测删除区高亮
    if (!st.moved && !st.longPressFired) return;

    // 删除模式下移动：实时检测是否悬停在右侧删除区 → 高亮反馈
    if (deleteModeId) {
      setDeleteZoneHover(isInDeleteZone(e.clientX));
    }

    setElements((els) =>
      els.map((el) => {
        if (el.id !== st.id) return el;
        const nx = e.clientX / zoom - st.offsetX;
        const ny = e.clientY / zoom - st.offsetY;
        const snap = (v: number) => {
          const g = 10;
          const near = Math.round(v / g) * g;
          return Math.abs(v - near) < 2 ? near : v;
        };
        return { ...el, x: snap(nx), y: snap(ny) };
      }),
    );

    // ─── 检测拖拽覆盖：用 elementsFromPoint 命中光标处所有元素，跳过被拖元素自身 ───
    // 注意：不要临时把被拖元素设成 pointer-events:none 再 elementFromPoint —— 规范规定
    // 给正捕获指针的元素设 pointer-events:none 会隐式释放捕获，导致后续 move 事件漏给
    // 光标下重叠的其它词块，从而出现"拖一个词连带动到上方词块"的 bug。
    let foundTargetId: string | null = null;
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    for (const node of stack) {
      const elView = (node as HTMLElement).closest?.("[data-element-id]");
      if (elView) {
        const tid = elView.getAttribute("data-element-id");
        if (tid && tid !== st.id) {
          foundTargetId = tid;
          break;
        }
      }
    }
    st.hoverTargetId = foundTargetId;
    setHoverTargetId(foundTargetId);
  };

  // 检测坐标是否在右侧删除区域内
  const isInDeleteZone = (clientX: number): boolean => {
    if (typeof window === "undefined") return false;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    return clientX > vw - 130; // 右侧 130px 区域为删除区
  };

  const onElPointerUp = (e: React.PointerEvent) => {
    const st = dragState.current;

    // 清理长按计时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }

    const inDeleteMode = deleteModeId !== null;
    // 退出删除模式（无论是否删除）
    setDeleteModeId(null);
    setDeleteZoneActive(false);
    setDeleteZoneHover(false);

    dragState.current = null;

    if (!st) return;

    // 仅在"长按进入删除模式 + 曾移动 + 松手在右侧删除区"时删除
    if (inDeleteMode && st.moved && isInDeleteZone(e.clientX)) {
      setElements((els) => els.filter((el) => el.id !== st.id));
      setSelectedId(null);
      setHoverTargetId(null);
      return;
    }

    // ─── 覆盖替换：如果拖拽了一个文本元素到另一个文本元素上，替换目标内容并删除源 ───
    if (st.moved && st.hoverTargetId) {
      const targetId = st.hoverTargetId;
      setElements((els) => {
        const draggedEl = els.find((el) => el.id === st.id);
        const targetEl = els.find((el) => el.id === targetId);
        // 仅当两者都是文本元素时触发替换
        if (draggedEl?.kind === "text" && targetEl?.kind === "text") {
          const updated = els.map((el) =>
            el.id === targetId
              ? { ...el, content: draggedEl.content ?? "", variant: draggedEl.variant ?? el.variant, fontFamily: draggedEl.fontFamily ?? el.fontFamily }
              : el,
          );
          return updated.filter((el) => el.id !== st.id);
        }
        return els;
      });
      setSelectedId(null);
      setHoverTargetId(null);
      return;
    }

    setHoverTargetId(null);
  };

  // ----- drop from palette / fragments -----
  const onCanvasDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-collage")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";

      // 检测是否悬停在某个文本元素上 → 高亮提示可替换
      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      if (targetEl) {
        const elView = targetEl.closest("[data-element-id]");
        if (elView) {
          const id = elView.getAttribute("data-element-id");
          setHoverTargetId(id);
          return;
        }
      }
    }
    setHoverTargetId(null);
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("application/x-collage");
    if (!raw) return;
    setHoverTargetId(null);
    e.preventDefault();

    try {
      const spec = JSON.parse(raw) as Partial<CanvasElement> & { kind: ElementKind };
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

      // 检查是否拖拽到某个现有文本元素上 → 触发替换
      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      if (targetEl) {
        const elView = targetEl.closest("[data-element-id]");
        if (elView) {
          const targetId = elView.getAttribute("data-element-id");
          if (targetId && spec.kind === "text" && spec.content) {
            // 替换目标元素的内容
            setElements((els) =>
              els.map((el) =>
                el.id === targetId
                  ? { ...el, content: spec.content, variant: spec.variant ?? el.variant, fontFamily: spec.fontFamily ?? el.fontFamily }
                  : el,
              ),
            );
            setSelectedId(null);
            return;
          }
        }
      }

      // 正常放置：在画布上创建新元素
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setElements((els) => [
        ...els,
        createElement({
          ...spec,
          x: x - 60,
          y: y - 20,
          rotation:
            spec.rotation ?? (spec.kind === "decor" ? (Math.random() - 0.5) * 30 : (Math.random() - 0.5) * 6),
        }),
      ]);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable)
      )
        return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        setElements((els) => els.filter((el) => el.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selectedId, setElements, setSelectedId]);

  // 把视图平移，使指定的画布坐标点居中显示（生成素材后调用）
  useEffect(() => {
    if (!recenterTo) return;
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPan({
      x: rect.width / 2 - recenterTo.x * zoom,
      y: rect.height / 2 - recenterTo.y * zoom,
    });
    // 仅在 nonce 变化时触发（zoom 取当前值即可）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterTo?.nonce]);

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full overflow-hidden"
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
    >
      <div
        className="paper-texture grain absolute inset-0"
        onPointerDown={onBgPointerDown}
        onPointerMove={onBgPointerMove}
        onPointerUp={onBgPointerUp}
        onWheel={onWheel}
      />
      <div
        id="collage-canvas"
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: 4000,
          height: 4000,
          pointerEvents: "none",
        }}
      >
        {elements.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            selected={el.id === selectedId && !hideChrome}
            editing={el.id === editingId}
            isHoverTarget={el.id === hoverTargetId}
            onPointerDown={(e) => onElPointerDown(e, el)}
            onPointerMove={onElPointerMove}
            onPointerUp={onElPointerUp}
            onDoubleClick={() => {
              if (hideChrome || el.kind !== "text") return;
              setSelectedId(el.id);
              setEditingId(el.id);
            }}
            onStopEdit={() => setEditingId(null)}
            onChangeText={(text, which) =>
              setElements((els) =>
                els.map((e) =>
                  e.id === el.id ? { ...e, [which]: text } : e,
                ),
              )
            }
          />
        ))}
      </div>

      {/* 右侧删除区（长按某个词条后显示） */}
      {deleteZoneActive && !hideChrome && (
        <div
          className="pointer-events-none absolute right-0 top-0 z-[70] flex h-full w-[130px] items-center justify-center transition-colors"
          style={{
            background: deleteZoneHover ? "oklch(0.55 0.2 25 / 0.32)" : "oklch(0.55 0.2 25 / 0.14)",
            borderLeft: `2px dashed ${deleteZoneHover ? "oklch(0.65 0.22 25)" : "oklch(0.55 0.2 25 / 0.6)"}`,
            backdropFilter: "blur(2px)",
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <div className={`rounded-full p-2 transition ${deleteZoneHover ? "bg-red-500/30" : "bg-red-500/15"}`}>
              <svg className="h-5 w-5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <span className="text-[11px] font-medium text-red-200">拖到此处</span>
            <span className="text-[10px] text-red-200/70">删除</span>
          </div>
        </div>
      )}

      {!hideChrome && (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {Math.round(zoom * 100)}% · 拖动空白平移 · Ctrl+滚轮缩放
        </div>
      )}
    </div>
  );
}

/* ---------- Element rendering ---------- */

function ElementView({
  el,
  selected,
  editing,
  isHoverTarget,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onStopEdit,
  onChangeText,
}: {
  el: CanvasElement;
  selected: boolean;
  editing?: boolean;
  isHoverTarget?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onDoubleClick?: () => void;
  onStopEdit?: () => void;
  onChangeText: (text: string, which: "content" | "content2") => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // 基础样式
  const style: React.CSSProperties = {
    position: "absolute",
    left: el.x,
    top: el.y,
    transform: `rotate(${el.rotation}deg) scale(${el.scale})`,
    transformOrigin: "center",
    zIndex: effectiveZ(el),
    pointerEvents: "auto",
    touchAction: "none",
    outline: selected ? "2px dashed oklch(0.55 0.16 45)" : undefined,
    outlineOffset: "4px",
    willChange: "transform, left, top",
    ...(isHoverTarget
      ? {
          outline: "3px solid oklch(0.65 0.2 250)",
          outlineOffset: "6px",
          filter: "brightness(1.1)",
          transition: "outline 0.15s, filter 0.15s",
        }
      : {}),
  };

  const handlers = { onPointerDown, onPointerMove, onPointerUp, onDoubleClick };

  let inner: React.ReactNode = null;
  if (el.kind === "text") {
    inner = (
      <div style={{ filter: "drop-shadow(0 2px 3px rgba(74,59,42,0.28))" }}>
        <TextCarrier
          el={el}
          selected={selected}
          editing={editing}
          onChangeText={onChangeText}
          onStartEdit={onDoubleClick}
          onStopEdit={onStopEdit}
        />
      </div>
    );
  } else if (el.kind === "decor") {
    inner = (
      <DecorPiece
        variant={el.variant as DecorVariant}
        width={el.width}
        height={el.height}
        content={el.content}
        content2={el.content2}
      />
    );
  } else if (el.kind === "bg") {
    inner = <BgPiece el={el} selected={selected} onChangeText={onChangeText} />;
  } else if (el.kind === "image" && el.src) {
    inner = (
      <img
        src={el.src}
        alt=""
        draggable={false}
        style={{
          width: el.width ?? 220,
          height: "auto",
          display: "block",
          // 跟随图案轮廓的柔和投影（非矩形 box-shadow），透明区完美融入画布
          filter: "drop-shadow(0 2px 3px rgba(74,59,42,0.28))",
        }}
      />
    );
  } else if (el.kind === "header") {
    inner = (
      <div
        className="tape-solid torn-paper"
        style={{
          fontFamily: "var(--font-hanchan), var(--font-hand)",
          fontSize: 28,
          padding: "9px 16px",
          borderRadius: 0,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "baseline",
          gap: 7,
          filter: "drop-shadow(0 3px 5px rgba(74,59,42,0.3))",
        }}
      >
        <span style={{ fontSize: 19, color: "rgba(74,53,32,0.7)" }}>To</span>
        <span
          contentEditable={!!selected}
          suppressContentEditableWarning
          onBlur={(e) => onChangeText?.(e.currentTarget.textContent || "", "content")}
          onPointerDown={(e) => selected && e.stopPropagation()}
          className="outline-none"
        >
          {el.content || "你"}
        </span>
      </div>
    );
  } else if (el.kind === "signature") {
    inner = (
      <div
        className="tape-solid torn-paper"
        style={{
          fontFamily: "var(--font-hanchan), var(--font-hand)",
          fontSize: 28,
          padding: "9px 16px",
          borderRadius: 0,
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "baseline",
          gap: 7,
          filter: "drop-shadow(0 3px 5px rgba(74,59,42,0.3))",
        }}
      >
        <span style={{ fontSize: 28 }}>—</span>
        <span
          contentEditable={!!selected}
          suppressContentEditableWarning
          onBlur={(e) => onChangeText?.(e.currentTarget.textContent || "", "content")}
          onPointerDown={(e) => selected && e.stopPropagation()}
          className="outline-none"
        >
          {el.content || "佚名"}
        </span>
      </div>
    );
  } else {
    return null;
  }

  return (
    <div ref={wrapRef} {...handlers} style={style} className="select-none" data-element-id={el.id} data-el-kind={el.kind}>
      {inner}
    </div>
  );
}


/* ---------- Text carriers (词语拼贴素材 · 4 styles) ---------- */

/** 可编辑文本：双击进入编辑（contentEditable 聚焦），失焦/回车提交并退出 */
function EditableText({
  text,
  editing,
  onChange,
  onStartEdit,
  onStopEdit,
}: {
  text: string;
  editing: boolean;
  onChange: (t: string) => void;
  onStartEdit?: () => void;
  onStopEdit?: () => void;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  // 进入编辑：聚焦并把光标移到末尾
  useEffect(() => {
    if (editing && ref.current) {
      const node = ref.current;
      node.focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  // 空白词条：未编辑时显示可点击的「自由书写」占位符
  if (!editing && text === "") {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          onStartEdit?.();
        }}
        className="cursor-text"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          border: "2px dashed oklch(0.55 0.03 45 / 0.5)",
          borderRadius: 6,
          color: "oklch(0.5 0.03 45 / 0.75)",
          fontFamily: "var(--font-serif)",
          fontSize: 16,
          userSelect: "none",
        }}
      >
        <span>✎</span>
        <span>自由书写</span>
      </span>
    );
  }

  return (
    <span
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      onPointerDown={(e) => {
        if (editing) e.stopPropagation(); // 编辑时不触发画布拖拽
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit?.();
      }}
      onBlur={(e) => {
        onChange(e.currentTarget.textContent || "");
        onStopEdit?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      className="outline-none"
      style={
        editing
          ? { outline: "2px solid oklch(0.65 0.2 250)", outlineOffset: 4, cursor: "text", minWidth: "2ch" }
          : undefined
      }
    >
      {text}
    </span>
  );
}

export function TextCarrier({
  el,
  selected,
  editing,
  onChangeText,
  onStartEdit,
  onStopEdit,
}: {
  el: CanvasElement;
  selected?: boolean;
  editing?: boolean;
  onChangeText?: (t: string, which: "content" | "content2") => void;
  onStartEdit?: () => void;
  onStopEdit?: () => void;
}) {
  const variant = (el.variant as TextVariant) ?? "grid-note";
  const fontStack =
    variant === "grid-note"
      ? "var(--font-keke)"
      : variant === "kraft-tag"
        ? "var(--font-hanchan)"
        : el.fontFamily === "hand"
          ? "var(--font-hand)"
          : "var(--font-serif)";

  const EditableSpan = (
    <EditableText
      key={editing ? "edit" : "view"}
      text={el.content ?? ""}
      editing={!!editing}
      onChange={(t) => onChangeText?.(t, "content")}
      onStartEdit={() => onStartEdit?.()}
      onStopEdit={() => onStopEdit?.()}
    />
  );

  if (variant === "grid-note") {
    return (
      <div
        className="relative min-w-[110px] px-4 py-2 text-[color:var(--color-ink)]"
        style={{
          fontFamily: fontStack,
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: "0.03em",
          backgroundColor: "oklch(0.985 0.008 90)",
          backgroundImage:
            "linear-gradient(oklch(0.75 0.05 235 / 0.28) 1px, transparent 1px), linear-gradient(90deg, oklch(0.75 0.05 235 / 0.28) 1px, transparent 1px)",
          backgroundSize: "12px 12px",
          clipPath:
            "polygon(3% 6%, 12% 0, 24% 5%, 38% 1%, 55% 4%, 72% 0, 88% 6%, 100% 3%, 98% 22%, 100% 50%, 97% 78%, 100% 96%, 86% 100%, 68% 96%, 48% 100%, 30% 96%, 14% 100%, 2% 94%, 5% 70%, 0 45%, 3% 22%)",
        }}
      >
        {EditableSpan}
      </div>
    );
  }

  if (variant === "blue-washi") {
    return (
      <div className="relative">
        <div
          className="relative min-w-[120px] px-4 py-2.5 text-[color:var(--color-ink)]"
          style={{
            fontFamily: fontStack,
            fontSize: 20,
            fontWeight: 500,
            backgroundColor: "oklch(0.82 0.055 235)",
            clipPath:
              "polygon(2% 12%, 15% 4%, 32% 8%, 50% 2%, 68% 6%, 85% 3%, 98% 10%, 96% 40%, 100% 70%, 94% 90%, 78% 96%, 60% 92%, 40% 98%, 22% 94%, 6% 96%, 3% 60%, 0 30%)",
          }}
        >
          {EditableSpan}
        </div>
        <svg
          className="pointer-events-none absolute -bottom-1 left-2 right-2"
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          style={{ width: "calc(100% - 16px)", height: 8 }}
        >
          <path
            d="M2,4 Q15,1 30,3 T60,3 T92,4"
            stroke="oklch(0.28 0.03 45)"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (variant === "kraft-tag") {
    return (
      <div
        className="relative px-5 py-2.5"
        style={{
          fontFamily: fontStack,
          fontSize: 27,
          fontWeight: 500,
          backgroundColor: "oklch(0.66 0.08 60)",
          color: "oklch(0.25 0.04 50)",
          clipPath:
            "polygon(4% 8%, 16% 2%, 30% 6%, 46% 0, 62% 5%, 78% 2%, 92% 8%, 98% 26%, 100% 55%, 96% 82%, 100% 98%, 82% 94%, 66% 100%, 48% 96%, 30% 100%, 14% 96%, 0 92%, 3% 68%, 0 40%, 6% 22%)",
        }}
      >
        {EditableSpan}
      </div>
    );
  }

  return (
    <div
      className="relative px-3 py-1.5 text-[color:var(--color-ink)]"
      style={{
        fontFamily: fontStack,
        fontSize: 18,
        fontWeight: 500,
        backgroundColor: "oklch(0.94 0.02 85)",
        backgroundImage:
          "repeating-linear-gradient(0deg, transparent 0 4px, oklch(0.4 0.03 50 / 0.06) 4px 5px), repeating-linear-gradient(90deg, transparent 0 3px, oklch(0.4 0.03 50 / 0.05) 3px 4px)",
        clipPath:
          "polygon(2% 10%, 18% 0, 36% 6%, 54% 2%, 72% 5%, 90% 0, 100% 12%, 96% 38%, 100% 65%, 94% 88%, 80% 100%, 60% 94%, 42% 100%, 22% 92%, 6% 100%, 0 76%, 4% 48%, 0 24%)",
      }}
    >
      {EditableSpan}
    </div>
  );
}

/* ---------- Decorations ---------- */

export function DecorPiece({
  variant,
  width,
  height,
  content,
  content2,
}: {
  variant: DecorVariant;
  width?: number;
  height?: number;
  content?: string;
  content2?: string;
}) {
  /* ===== 复古拼贴手帐 Vintage Collage Journal ===== */

  // 海报诗歌卡片衬底：奶白撕纸大卡片（诗歌铺在其上，装饰落在卡片外）
  if (variant === "poster-mat") {
    const w = width ?? 420;
    const h = height ?? 320;
    return (
      <div
        style={{
          position: "relative",
          width: w,
          height: h,
          background: "linear-gradient(160deg, #f7f0dd 0%, #efe4c9 60%, #e8dbbc 100%)",
          clipPath:
            "polygon(1.5% 3%, 9% 1%, 20% 3%, 33% 1%, 47% 2.5%, 61% 1%, 74% 3%, 87% 1%, 97% 2.5%, 99% 12%, 97.5% 28%, 100% 44%, 97.5% 60%, 100% 76%, 98% 90%, 99% 97%, 90% 99%, 76% 97.5%, 62% 99%, 48% 97.5%, 34% 99%, 21% 97.5%, 10% 99%, 2% 97%, 1% 88%, 2.5% 72%, 0.5% 56%, 2.5% 40%, 0.5% 24%, 2% 12%)",
          boxShadow: "0 20px 48px rgba(60,40,18,0.30)",
        }}
      >
        <div className="grain" style={{ position: "absolute", inset: 0, opacity: 0.35 }} />
      </div>
    );
  }

  // 撕纸边缘框：仿手工撕纸的不规则四边形 + 内框虚线 + 咖啡渍做旧
  if (variant === "torn-frame") {
    const w = width ?? 210;
    const h = height ?? 150;
    return (
      <div style={{ position: "relative", width: w, height: h }}>
        {/* 卷角轻微阴影 */}
        <div
          style={{
            position: "absolute",
            bottom: -3,
            left: "12%",
            right: "12%",
            height: 10,
            background: "radial-gradient(ellipse at center, rgba(74,59,42,0.18), transparent 70%)",
            filter: "blur(2px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: VCJ.warmWhite,
            opacity: 0.92,
            filter: "drop-shadow(0 3px 5px rgba(74,59,42,0.16))",
            clipPath:
              "polygon(2% 6%, 12% 2%, 26% 5%, 40% 1%, 55% 4%, 70% 1%, 84% 5%, 97% 2%, 99% 20%, 96% 40%, 100% 60%, 97% 80%, 99% 96%, 85% 99%, 68% 96%, 52% 100%, 36% 96%, 20% 99%, 5% 96%, 1% 78%, 4% 55%, 0% 38%, 3% 20%)",
          }}
        >
          <CoffeeStains spots={[[8, w - 42, 26], [h - 36, 12, 20]]} />
          <div style={{ position: "absolute", inset: 13, border: `1px dashed ${VCJ.paperBrown}` }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              padding: 24,
              fontFamily: "var(--font-serif)",
              fontSize: 15,
              color: VCJ.darkRed,
              textAlign: "center",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {content ?? "亲爱的你"}
          </div>
        </div>
      </div>
    );
  }

  // 礼品标签：长方形带打孔圆孔 + 麻绳线条
  if (variant === "gift-tag") {
    const w = width ?? 92;
    const h = height ?? 140;
    return (
      <div
        style={{
          position: "relative",
          width: w,
          height: h + 22,
          opacity: 0.9,
          filter: "drop-shadow(0 3px 5px rgba(74,59,42,0.16))",
        }}
      >
        {/* 麻绳 */}
        <svg width={w} height={26} viewBox={`0 0 ${w} 26`} style={{ position: "absolute", top: 0, left: 0 }}>
          <path
            d={`M${w * 0.3} 8 Q ${w * 0.5} -4 ${w * 0.7} 8 Q ${w * 0.56} 17 ${w * 0.5} 25`}
            stroke={VCJ.twine}
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
        {/* 标签体 */}
        <div
          style={{
            position: "absolute",
            top: 20,
            left: 0,
            width: w,
            height: h,
            background: VCJ.cream,
            border: `1px solid ${VCJ.paperBrown}`,
            clipPath: "polygon(50% 0, 100% 15%, 100% 100%, 0 100%, 0 15%)",
          }}
        >
          {/* 打孔圆孔 */}
          <div
            style={{
              position: "absolute",
              top: 11,
              left: "50%",
              width: 11,
              height: 11,
              marginLeft: -5.5,
              borderRadius: "50%",
              border: `1.5px solid ${VCJ.ink}`,
              background: VCJ.warmWhite,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              padding: "30px 10px 12px",
              fontFamily: "var(--font-hand)",
              fontSize: 16,
              color: VCJ.ink,
              textAlign: "center",
              whiteSpace: "pre-wrap",
            }}
          >
            {content ?? "To."}
          </div>
        </div>
      </div>
    );
  }

  // 丝带蝴蝶结：简笔线稿风格（非 3D）
  if (variant === "ribbon-bow") {
    const w = width ?? 124;
    const h = height ?? 84;
    const c = vcjStroke(content);
    return (
      <svg width={w} height={h} viewBox="0 0 130 90" style={{ opacity: 0.82 }}>
        <g stroke={c} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M65 44 C 30 20, 8 30, 16 50 C 22 66, 48 58, 65 46" />
          <path d="M65 44 C 100 20, 122 30, 114 50 C 108 66, 82 58, 65 46" />
          <path d="M60 40 Q 65 46 60 52 M70 40 Q 65 46 70 52" />
          <ellipse cx="65" cy="46" rx="6" ry="6" />
          <path d="M60 52 C 53 68, 47 78, 41 88" />
          <path d="M70 52 C 77 68, 83 78, 89 88" />
          <path d="M41 88 l 5 -6 M41 88 l 6 2" />
          <path d="M89 88 l -5 -6 M89 88 l -6 2" />
        </g>
      </svg>
    );
  }

  // 复古邮票：锯齿边缘 + 单/双色线稿
  if (variant === "vintage-stamp") {
    const w = width ?? 84;
    const h = height ?? 104;
    const tone = content2 === "moss" ? VCJ.moss : content2 === "navy" ? VCJ.navy : VCJ.darkRed;
    return (
      <div
        style={{
          width: w,
          height: h,
          background: VCJ.cream,
          opacity: 0.9,
          clipPath: serratedClip(w, h, 6),
          filter: "drop-shadow(0 2px 4px rgba(74,59,42,0.15))",
          padding: 6,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            border: `1.4px solid ${tone}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 4px",
            fontFamily: "var(--font-serif)",
            color: tone,
          }}
        >
          <div style={{ fontSize: 7, letterSpacing: "0.18em" }}>{content ?? "POSTAGE"}</div>
          <svg width="40" height="42" viewBox="0 0 40 42" fill="none" stroke={tone} strokeWidth="1.3" strokeLinecap="round">
            <path d="M20 38 C 19 28, 21 18, 20 8" />
            <path d="M20 16 Q 12 12 8 15 M20 22 Q 28 18 32 21 M20 28 Q 13 25 9 28" />
            <circle cx="20" cy="8" r="2.2" />
          </svg>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em" }}>20</div>
        </div>
      </div>
    );
  }

  // 干枝：极简线稿轮廓
  if (variant === "sprig-line") {
    const w = width ?? 64;
    const h = height ?? 120;
    return (
      <svg width={w} height={h} viewBox="0 0 70 120" fill="none" stroke={VCJ.moss} strokeWidth="1.4" strokeLinecap="round" style={{ opacity: 0.8 }}>
        <path d="M35 118 C 34 92, 36 64, 35 34 C 35 22, 34 12, 35 4" />
        {([[35, 30, -16, -10], [35, 46, 18, -6], [35, 62, -18, -2], [35, 78, 16, 2], [35, 94, -14, 8]] as const).map(
          ([x, y, dx, dy], i) => (
            <g key={i}>
              <path d={`M${x} ${y} Q ${x + dx / 2} ${y + dy - 4} ${x + dx} ${y + dy}`} />
              <circle cx={x + dx} cy={y + dy} r="2.2" />
            </g>
          ),
        )}
        <circle cx="35" cy="4" r="2.4" />
      </svg>
    );
  }

  // 枝叶：极简叶片线稿
  if (variant === "leaf-line") {
    const w = width ?? 64;
    const h = height ?? 110;
    return (
      <svg width={w} height={h} viewBox="0 0 70 110" fill="none" stroke={VCJ.moss} strokeWidth="1.4" strokeLinecap="round" style={{ opacity: 0.8 }}>
        <path d="M35 106 C 34 80, 36 50, 35 16" />
        {[24, 44, 64, 84].map((y, i) => {
          const dir = i % 2 === 0 ? 1 : -1;
          const dx = 20 * dir;
          return <path key={y} d={`M35 ${y} q ${dx / 2} -7 ${dx} 0 q ${-dx / 2} 8 ${-dx} 0`} />;
        })}
      </svg>
    );
  }

  // 手绘波浪线：分割 / 强调
  if (variant === "wave-line") {
    const w = width ?? 150;
    const h = height ?? 20;
    const c = vcjStroke(content);
    const step = (w - 8) / 4;
    const cy = h / 2;
    const d = `M4 ${cy} Q ${4 + step * 0.5} 2 ${4 + step} ${cy} T ${4 + step * 2} ${cy} T ${4 + step * 3} ${cy} T ${4 + step * 4} ${cy}`;
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" style={{ opacity: 0.75 }}>
        <path d={d} />
      </svg>
    );
  }

  // 点状虚线：分割 / 强调
  if (variant === "dotted-line") {
    const w = width ?? 150;
    const h = height ?? 12;
    const c = vcjStroke(content);
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ opacity: 0.7 }}>
        <line x1="3" y1={h / 2} x2={w - 3} y2={h / 2} stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 10" />
      </svg>
    );
  }

  if (variant === "washi-check") {
    const w = width ?? 140;
    const h = height ?? 32;
    return (
      <div
        style={{
          width: w,
          height: h,
          backgroundColor: "oklch(0.97 0.005 90 / 0.85)",
          backgroundImage:
            "linear-gradient(oklch(0.25 0.02 50) 1px, transparent 1px), linear-gradient(90deg, oklch(0.25 0.02 50) 1px, transparent 1px)",
          backgroundSize: "8px 8px",
          boxShadow: "0 1px 3px oklch(0.3 0.05 40 / 0.2), inset 0 0 12px oklch(1 0 0 / 0.2)",
        }}
      />
    );
  }
  if (variant === "washi-kraft") {
    const w = width ?? 150;
    const h = height ?? 34;
    return (
      <div
        style={{
          width: w,
          height: h,
          background:
            "linear-gradient(180deg, oklch(0.72 0.09 65) 0%, oklch(0.62 0.1 60) 100%)",
          boxShadow:
            "0 1px 3px oklch(0.3 0.05 40 / 0.22), inset 0 0 14px oklch(0.4 0.06 50 / 0.35)",
          clipPath:
            "polygon(1% 12%, 8% 3%, 18% 8%, 30% 2%, 42% 7%, 55% 3%, 68% 9%, 80% 4%, 92% 8%, 100% 4%, 98% 88%, 90% 96%, 78% 92%, 64% 98%, 50% 92%, 36% 98%, 22% 92%, 10% 96%, 0 92%)",
        }}
      />
    );
  }
  if (variant === "doodle-star") {
    const s = width ?? 40;
    return (
      <svg width={s} height={s} viewBox="0 0 40 40" fill="none">
        <path
          d="M20 4 L23 15 L34 15 L25 22 L28 34 L20 27 L12 34 L15 22 L6 15 L17 15 Z"
          stroke="oklch(0.28 0.03 45)"
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    );
  }
  if (variant === "doodle-arrow") {
    const w = width ?? 70;
    const h = height ?? 90;
    return (
      <svg width={w} height={h} viewBox="0 0 70 90" fill="none">
        <path
          d="M55 82 Q30 78 22 55 Q16 32 30 12"
          stroke="oklch(0.22 0.03 45)"
          strokeWidth="1.8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M22 22 L30 10 L38 22"
          stroke="oklch(0.22 0.03 45)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    );
  }
  if (variant === "stamp") {
    return (
      <div
        className="relative"
        style={{
          width: width ?? 170,
          padding: "12px 16px",
          backgroundColor: "oklch(0.94 0.02 85)",
          boxShadow: "0 3px 8px oklch(0.3 0.05 40 / 0.2)",
          border: "1px dashed oklch(0.35 0.03 45 / 0.5)",
          fontFamily: "var(--font-serif)",
        }}
      >
        <div className="text-[15px] font-semibold tracking-[0.15em] text-[color:var(--color-ink)]">
          {content ?? "26 APR 2026"}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {content2 ?? '"WITH LOVE"'}
        </div>
        <div className="mt-1.5 text-[9px] tracking-widest text-muted-foreground">
          2 560827 389 175
        </div>
      </div>
    );
  }
  if (variant === "flower") {
    const s = width ?? 60;
    // color chosen from a warm palette by hashing content
    const palette = ["oklch(0.72 0.18 20)", "oklch(0.82 0.17 90)", "oklch(0.78 0.12 340)", "oklch(0.75 0.14 55)"];
    const c = palette[(content?.charCodeAt(0) ?? Math.floor(Math.random() * 4)) % palette.length];
    return (
      <svg width={s} height={s} viewBox="0 0 60 60">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <ellipse
            key={deg}
            cx="30"
            cy="18"
            rx="7"
            ry="12"
            fill={c}
            opacity="0.85"
            transform={`rotate(${deg} 30 30)`}
          />
        ))}
        <circle cx="30" cy="30" r="5.5" fill="oklch(0.82 0.15 90)" />
        <circle cx="30" cy="30" r="2.5" fill="oklch(0.4 0.12 55)" />
      </svg>
    );
  }
  if (variant === "wax-seal") {
    const s = width ?? 64;
    const letter = (content?.[0] ?? "L").toUpperCase();
    const clip =
      "polygon(50% 2%, 63% 8%, 74% 4%, 82% 15%, 95% 18%, 96% 32%, 100% 48%, 96% 63%, 98% 78%, 86% 85%, 82% 96%, 68% 93%, 54% 99%, 40% 96%, 27% 98%, 18% 87%, 6% 83%, 4% 67%, 1% 50%, 5% 37%, 3% 21%, 15% 16%, 22% 5%, 37% 7%)";
    return (
      <div
        style={{
          width: s,
          height: s,
          position: "relative",
          opacity: 0.88,
          filter: "drop-shadow(0 2px 3px rgba(74,59,42,0.2))",
        }}
      >
        {/* 暗红色火漆本体（扁平、低饱和、非高光 3D） */}
        <div style={{ position: "absolute", inset: 0, background: VCJ.darkRed, clipPath: clip }} />
        {/* 内圈字母纹样 */}
        <div
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: "50%",
            border: `1px solid rgba(245,240,230,0.45)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: VCJ.warmWhite,
            fontFamily: "var(--font-serif)",
            fontWeight: 700,
            fontSize: s * 0.4,
          }}
        >
          {letter}
        </div>
      </div>
    );
  }
  if (variant === "ribbon") {
    const w = width ?? 180;
    const h = height ?? 30;
    const color = content || "coral";
    const fill =
      color === "mint"
        ? "linear-gradient(180deg, oklch(0.85 0.11 165) 0%, oklch(0.7 0.13 160) 100%)"
        : color === "rose"
        ? "linear-gradient(180deg, oklch(0.85 0.1 15) 0%, oklch(0.72 0.14 12) 100%)"
        : color === "mustard"
        ? "linear-gradient(180deg, oklch(0.85 0.14 90) 0%, oklch(0.72 0.16 80) 100%)"
        : "linear-gradient(180deg, oklch(0.78 0.16 30) 0%, oklch(0.63 0.19 25) 100%)";
    return (
      <div
        style={{
          width: w,
          height: h,
          background: fill,
          clipPath: `polygon(0 30%, 8% 0, 92% 0, 100% 30%, 92% 100%, 8% 100%)`,
          boxShadow: "0 2px 4px oklch(0.3 0.1 30 / 0.3), inset 0 -3px 6px oklch(0.2 0.1 20 / 0.25)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 12,
            right: 12,
            height: 1,
            background: "oklch(1 0 0 / 0.35)",
            transform: "translateY(-50%)",
          }}
        />
      </div>
    );
  }
  if (variant === "note-card") {
    const w = width ?? 200;
    const h = height ?? 130;
    return (
      <div
        style={{
          width: w,
          height: h,
          backgroundColor: "oklch(0.97 0.02 88)",
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 22px, oklch(0.55 0.06 240 / 0.28) 22px 23px)",
          padding: "18px 16px 14px",
          boxShadow: "0 4px 10px oklch(0.3 0.05 40 / 0.22), inset 0 0 24px oklch(0.85 0.08 60 / 0.15)",
          fontFamily: "var(--font-hand)",
          fontSize: 18,
          lineHeight: "23px",
          color: "oklch(0.3 0.06 40)",
          position: "relative",
          transform: "rotate(-0.5deg)",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 0,
            bottom: 0,
            width: 1,
            background: "oklch(0.55 0.2 25 / 0.4)",
          }}
        />
        {content ?? "亲爱的你："}
      </div>
    );
  }
  if (variant === "photo") {
    const w = width ?? 160;
    const h = height ?? 130;
    return (
      <div
        style={{
          width: w,
          padding: "8px 8px 26px",
          backgroundColor: "oklch(0.985 0.012 88)",
          boxShadow: "0 6px 16px oklch(0.3 0.05 40 / 0.35)",
          transform: "rotate(-1deg)",
        }}
      >
        <div
          className="grain"
          style={{
            width: "100%",
            height: h - 40,
            background:
              "linear-gradient(135deg, oklch(0.88 0.06 60) 0%, oklch(0.78 0.08 40) 55%, oklch(0.7 0.09 25) 100%)",
            filter: "sepia(0.3) contrast(0.95)",
          }}
        />
        {content && (
          <div
            style={{
              marginTop: 6,
              textAlign: "center",
              fontFamily: "var(--font-hand)",
              fontSize: 13,
              color: "oklch(0.4 0.08 40)",
            }}
          >
            {content}
          </div>
        )}
      </div>
    );
  }
  if (variant === "torn-paper") {
    const w = width ?? 150;
    const h = height ?? 100;
    return (
      <div
        style={{
          width: w,
          height: h,
          backgroundColor: "oklch(0.93 0.03 80)",
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 18px, oklch(0.4 0.05 45 / 0.18) 18px 19px)",
          padding: "12px 14px",
          fontFamily: "var(--font-hand)",
          fontSize: 14,
          color: "oklch(0.3 0.05 40)",
          boxShadow: "0 3px 10px oklch(0.3 0.05 40 / 0.25)",
          clipPath:
            "polygon(2% 5%, 12% 0, 26% 4%, 40% 0, 55% 3%, 72% 0, 88% 5%, 100% 2%, 98% 22%, 100% 45%, 97% 68%, 100% 92%, 82% 96%, 62% 100%, 42% 96%, 22% 100%, 4% 96%, 0 74%, 3% 48%, 0 22%)",
          transform: "rotate(-1deg)",
          overflow: "hidden",
          whiteSpace: "pre-wrap",
        }}
      >
        {content ?? "It's a good day"}
      </div>
    );
  }
  if (variant === "magazine-label") {
    const w = width ?? 130;
    const h = height ?? 34;
    return (
      <div
        style={{
          width: w,
          height: h,
          background: "oklch(0.15 0.02 45)",
          color: "oklch(0.98 0 0)",
          fontFamily: "var(--font-serif)",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: "0.18em",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 3px 8px oklch(0.2 0.02 50 / 0.4)",
        }}
      >
        {content ?? "VOGUE"}
      </div>
    );
  }
  if (variant === "pastel-cloud") {
    const s = width ?? 90;
    const tone = (content ?? "purple") as string;
    const fill =
      tone === "pink" ? "oklch(0.9 0.06 350)" :
      tone === "blue" ? "oklch(0.88 0.06 240)" :
      tone === "peach" ? "oklch(0.9 0.07 55)" :
      "oklch(0.86 0.08 300)";
    return (
      <svg width={s} height={s * 0.7} viewBox="0 0 90 60">
        <ellipse cx="30" cy="38" rx="22" ry="16" fill={fill} opacity="0.85" />
        <ellipse cx="55" cy="30" rx="26" ry="20" fill={fill} opacity="0.9" />
        <ellipse cx="72" cy="42" rx="16" ry="12" fill={fill} opacity="0.8" />
        <circle cx="20" cy="18" r="1.4" fill="oklch(0.8 0.14 90)" />
        <circle cx="65" cy="12" r="1.2" fill="oklch(0.8 0.14 90)" />
      </svg>
    );
  }
  if (variant === "pressed-leaf") {
    const s = width ?? 70;
    return (
      <svg width={s} height={s * 1.5} viewBox="0 0 40 60">
        <path
          d="M20 4 Q6 20 10 42 Q16 56 20 58 Q24 56 30 42 Q34 20 20 4 Z"
          fill="oklch(0.62 0.09 145)"
          opacity="0.85"
        />
        <path d="M20 6 L20 56" stroke="oklch(0.35 0.06 140)" strokeWidth="0.8" fill="none" />
        {[14, 22, 30, 38, 46].map((y) => (
          <g key={y}>
            <path d={`M20 ${y} Q14 ${y + 3} 11 ${y + 6}`} stroke="oklch(0.35 0.06 140)" strokeWidth="0.6" fill="none" />
            <path d={`M20 ${y} Q26 ${y + 3} 29 ${y + 6}`} stroke="oklch(0.35 0.06 140)" strokeWidth="0.6" fill="none" />
          </g>
        ))}
      </svg>
    );
  }
  if (variant === "heart-tag") {
    const w = width ?? 100;
    const h = height ?? 90;
    return (
      <div style={{ position: "relative", width: w, height: h }}>
        <svg width={w} height={h} viewBox="0 0 100 90" style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 3px 6px oklch(0.3 0.08 20 / 0.35))" }}>
          <path
            d="M50 82 C 20 62, 6 42, 6 26 C 6 12, 18 4, 30 4 C 38 4, 46 8, 50 16 C 54 8, 62 4, 70 4 C 82 4, 94 12, 94 26 C 94 42, 80 62, 50 82 Z"
            fill="oklch(0.88 0.08 15)"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            fontFamily: "var(--font-script), var(--font-hand)",
            color: "oklch(0.4 0.13 20)",
            fontSize: 15,
            padding: "14px 18px 20px",
            whiteSpace: "pre-line",
            lineHeight: 1.1,
          }}
        >
          {content ?? "Sweet\nheart"}
        </div>
      </div>
    );
  }
  if (variant === "ink-frame") {
    const w = width ?? 90;
    return (
      <div
        style={{
          width: w,
          height: w * 1.3,
          backgroundColor: "oklch(0.93 0.02 80)",
          padding: 6,
          boxShadow: "0 3px 8px oklch(0.3 0.05 40 / 0.25)",
          fontFamily: "var(--font-serif)",
          border: "1px solid oklch(0.4 0.04 45 / 0.4)",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "72%",
            background:
              "linear-gradient(180deg, oklch(0.9 0.02 90) 0%, oklch(0.75 0.03 80) 100%)",
            filter: "sepia(0.35) contrast(0.9)",
            display: "grid",
            placeItems: "center",
            fontSize: 26,
            color: "oklch(0.25 0.03 45)",
          }}
        >
          {content ?? "山"}
        </div>
        <div style={{ marginTop: 4, textAlign: "center", fontSize: 10, letterSpacing: "0.2em", color: "oklch(0.4 0.04 45)" }}>
          {content2 ?? "清风明月"}
        </div>
      </div>
    );
  }
  if (variant === "pink-check-tape") {
    const w = width ?? 150;
    const h = height ?? 32;
    return (
      <div
        style={{
          width: w,
          height: h,
          backgroundColor: "oklch(0.9 0.05 15 / 0.85)",
          backgroundImage:
            "linear-gradient(oklch(0.75 0.1 12) 1px, transparent 1px), linear-gradient(90deg, oklch(0.75 0.1 12) 1px, transparent 1px)",
          backgroundSize: "8px 8px",
          boxShadow: "0 1px 3px oklch(0.3 0.05 40 / 0.2)",
        }}
      />
    );
  }
  if (variant === "burnt-letter") {
    const w = width ?? 200;
    const h = height ?? 240;
    return (
      <div
        style={{
          width: w,
          height: h,
          padding: "22px 22px 26px",
          background:
            "radial-gradient(ellipse at 30% 30%, oklch(0.94 0.03 85) 0%, oklch(0.86 0.06 70) 55%, oklch(0.55 0.12 40) 92%, oklch(0.32 0.09 35) 100%)",
          boxShadow: "0 6px 16px oklch(0.3 0.08 40 / 0.35), inset 0 0 24px oklch(0.4 0.1 30 / 0.35)",
          fontFamily: "var(--font-serif)",
          fontSize: 14,
          lineHeight: 1.5,
          color: "oklch(0.2 0.04 40)",
          clipPath:
            "polygon(3% 4%, 10% 1%, 18% 3%, 28% 0, 40% 4%, 52% 1%, 66% 3%, 78% 0, 90% 4%, 97% 2%, 100% 15%, 96% 32%, 100% 50%, 96% 68%, 100% 85%, 97% 98%, 88% 96%, 74% 100%, 60% 96%, 46% 100%, 32% 96%, 18% 100%, 6% 96%, 0 90%, 3% 74%, 0 58%, 4% 40%, 0 22%, 3% 8%)",
          whiteSpace: "pre-wrap",
          overflow: "hidden",
          position: "relative",
          transform: "rotate(-1deg)",
        }}
      >
        <div style={{ fontStyle: "italic", fontSize: 15, marginBottom: 8, opacity: 0.9 }}>
          {content ?? '"a gift for you,\njust me and you"'}
        </div>
        <div style={{ fontSize: 10, opacity: 0.45, lineHeight: 1.6, letterSpacing: "0.02em" }}>
          {content2 ?? "the quiet ache of memory,\nsoft ink pressed by time,\na hand that once wrote\nthe smallest of names."}
        </div>
      </div>
    );
  }
  if (variant === "watercolor-bow") {
    const w = width ?? 170;
    const h = height ?? 130;
    return (
      <svg width={w} height={h} viewBox="0 0 170 130" style={{ filter: "drop-shadow(0 3px 6px oklch(0.3 0.05 40 / 0.28))" }}>
        <defs>
          <linearGradient id="wcRibA" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.88 0.05 20)" />
            <stop offset="45%" stopColor="oklch(0.78 0.07 340)" />
            <stop offset="100%" stopColor="oklch(0.72 0.06 235)" />
          </linearGradient>
          <linearGradient id="wcRibB" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.82 0.06 25)" />
            <stop offset="50%" stopColor="oklch(0.86 0.05 350)" />
            <stop offset="100%" stopColor="oklch(0.76 0.05 240)" />
          </linearGradient>
        </defs>
        {/* left loop */}
        <path d="M85 62 C 40 30, 10 40, 20 70 C 26 90, 60 82, 85 68 Z" fill="url(#wcRibA)" opacity="0.9" />
        {/* right loop */}
        <path d="M85 62 C 130 30, 160 40, 150 70 C 144 90, 110 82, 85 68 Z" fill="url(#wcRibA)" opacity="0.9" />
        {/* knot */}
        <ellipse cx="85" cy="65" rx="12" ry="10" fill="oklch(0.72 0.08 15)" opacity="0.95" />
        {/* tails */}
        <path d="M80 74 C 70 96, 62 110, 55 124 L 68 124 C 74 108, 82 92, 88 78 Z" fill="url(#wcRibB)" opacity="0.88" />
        <path d="M90 74 C 100 96, 108 108, 118 122 L 130 118 C 118 104, 108 88, 98 76 Z" fill="url(#wcRibB)" opacity="0.88" />
      </svg>
    );
  }
  if (variant === "gold-coin") {
    const s = width ?? 44;
    return (
      <div
        style={{
          width: s,
          height: s,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 32% 28%, oklch(0.92 0.11 90) 0%, oklch(0.78 0.14 80) 40%, oklch(0.55 0.12 60) 85%, oklch(0.35 0.08 55) 100%)",
          boxShadow:
            "0 3px 6px oklch(0.3 0.08 50 / 0.4), inset 0 -2px 4px oklch(0.3 0.08 50 / 0.35), inset 0 2px 3px oklch(1 0 0 / 0.4)",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-serif)",
          fontWeight: 700,
          fontSize: s * 0.36,
          color: "oklch(0.4 0.09 55)",
          textShadow: "0 1px 0 oklch(1 0 0 / 0.35)",
          border: "1.5px solid oklch(0.55 0.1 55 / 0.5)",
        }}
      >
        {content ?? "★"}
      </div>
    );
  }
  if (variant === "silver-coin") {
    const s = width ?? 40;
    return (
      <div
        style={{
          width: s,
          height: s,
          borderRadius: "50%",
          background:
            "radial-gradient(circle at 32% 28%, oklch(0.96 0.005 250) 0%, oklch(0.85 0.008 250) 42%, oklch(0.68 0.01 250) 85%, oklch(0.52 0.012 250) 100%)",
          boxShadow:
            "0 3px 6px oklch(0.3 0.02 250 / 0.4), inset 0 -2px 4px oklch(0.35 0.01 250 / 0.35), inset 0 2px 3px oklch(1 0 0 / 0.5)",
          display: "grid",
          placeItems: "center",
          fontFamily: "var(--font-serif)",
          fontWeight: 700,
          fontSize: s * 0.36,
          color: "oklch(0.45 0.01 250)",
          textShadow: "0 1px 0 oklch(1 0 0 / 0.4)",
          border: "1.5px solid oklch(0.62 0.01 250 / 0.5)",
        }}
      >
        {content ?? "❋"}
      </div>
    );
  }
  if (variant === "wax-seal-tree") {
    const s = width ?? 66;
    return (
      <div style={{ width: s, height: s, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 35% 30%, oklch(0.62 0.15 30) 0%, oklch(0.45 0.16 28) 50%, oklch(0.3 0.12 25) 100%)",
            boxShadow:
              "0 3px 6px oklch(0.2 0.1 20 / 0.5), inset 0 2px 5px oklch(1 0 0 / 0.18), inset 0 -3px 8px oklch(0.18 0.08 20 / 0.55)",
            clipPath:
              "polygon(50% 0%, 62% 8%, 75% 3%, 84% 14%, 96% 18%, 97% 32%, 100% 48%, 96% 62%, 100% 78%, 88% 86%, 82% 96%, 68% 94%, 54% 100%, 40% 96%, 26% 98%, 18% 88%, 6% 84%, 4% 68%, 0 52%, 4% 38%, 2% 22%, 14% 16%, 22% 4%, 36% 6%)",
          }}
        />
        {/* embossed sprig emblem */}
        <svg
          width={s}
          height={s}
          viewBox="0 0 66 66"
          style={{ position: "absolute", inset: 0 }}
        >
          <g
            stroke="oklch(0.82 0.08 30 / 0.75)"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          >
            <path d="M33 50 C 32 40, 34 28, 33 18" />
            {[
              [33, 24, -9, -6],
              [33, 31, 9, -4],
              [33, 38, -9, -2],
              [33, 44, 8, 1],
            ].map(([x, y, dx, dy], i) => (
              <path key={i} d={`M${x} ${y} Q ${x + dx / 2} ${y + dy - 3} ${x + dx} ${y + dy}`} />
            ))}
          </g>
        </svg>
      </div>
    );
  }
  if (variant === "twine-bow") {
    const w = width ?? 120;
    const h = height ?? 90;
    return (
      <svg width={w} height={h} viewBox="0 0 120 90" style={{ filter: "drop-shadow(0 2px 3px oklch(0.3 0.05 40 / 0.28))" }}>
        <defs>
          <linearGradient id="twine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.05 80)" />
            <stop offset="100%" stopColor="oklch(0.66 0.07 70)" />
          </linearGradient>
        </defs>
        <g stroke="url(#twine)" strokeWidth="5" fill="none" strokeLinecap="round">
          {/* left loop */}
          <path d="M60 45 C 24 22, 6 30, 14 50 C 20 66, 46 58, 60 48" />
          {/* right loop */}
          <path d="M60 45 C 96 22, 114 30, 106 50 C 100 66, 74 58, 60 48" />
          {/* tails */}
          <path d="M56 50 C 46 68, 40 78, 34 86" />
          <path d="M64 50 C 74 68, 80 78, 86 86" />
        </g>
        {/* knot */}
        <ellipse cx="60" cy="47" rx="8" ry="7" fill="oklch(0.7 0.06 72)" />
        <path d="M55 42 Q 60 47 55 52 M65 42 Q 60 47 65 52" stroke="oklch(0.55 0.07 68)" strokeWidth="1.2" fill="none" />
      </svg>
    );
  }
  if (variant === "dried-sprig") {
    const w = width ?? 90;
    const h = height ?? 130;
    return (
      <svg width={w} height={h} viewBox="0 0 90 130" style={{ filter: "drop-shadow(0 2px 3px oklch(0.3 0.05 40 / 0.25))" }}>
        {/* stem */}
        <path d="M45 128 C 42 100, 48 72, 44 44 C 42 26, 46 10, 45 4" stroke="oklch(0.55 0.08 100)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        {/* branches */}
        {[
          { x: 45, y: 40, dx: -20, dy: -14 },
          { x: 45, y: 55, dx: 22, dy: -8 },
          { x: 45, y: 72, dx: -24, dy: -4 },
          { x: 45, y: 88, dx: 20, dy: 2 },
          { x: 45, y: 104, dx: -18, dy: 8 },
        ].map((b, i) => (
          <g key={i}>
            <path d={`M${b.x} ${b.y} Q ${b.x + b.dx / 2} ${b.y + b.dy - 4} ${b.x + b.dx} ${b.y + b.dy}`} stroke="oklch(0.55 0.06 100)" strokeWidth="1" fill="none" />
            {[0, 1, 2].map((k) => {
              const t = 0.5 + k * 0.22;
              const cx = b.x + b.dx * t;
              const cy = b.y + b.dy * t - 4;
              const colors = ["oklch(0.86 0.04 340)", "oklch(0.9 0.03 60)", "oklch(0.82 0.05 300)"];
              return <circle key={k} cx={cx} cy={cy} r={2.4} fill={colors[(i + k) % 3]} opacity="0.9" />;
            })}
          </g>
        ))}
        {/* top cluster */}
        {[[42, 8], [48, 10], [45, 4], [40, 14], [50, 16]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={2.6} fill={["oklch(0.9 0.03 60)", "oklch(0.86 0.04 340)"][i % 2]} opacity="0.9" />
        ))}
      </svg>
    );
  }
  if (variant === "dried-rose") {
    const w = width ?? 60;
    const h = height ?? 110;
    return (
      <svg width={w} height={h} viewBox="0 0 60 110" style={{ filter: "drop-shadow(0 3px 5px oklch(0.3 0.05 40 / 0.3))" }}>
        {/* stem */}
        <path d="M30 108 C 28 80, 32 55, 30 32" stroke="oklch(0.42 0.08 100)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* leaf */}
        <path d="M30 70 Q 18 66 14 76 Q 22 78 30 72 Z" fill="oklch(0.5 0.09 130)" opacity="0.85" />
        {/* rose bud petals */}
        <ellipse cx="30" cy="22" rx="16" ry="20" fill="oklch(0.5 0.12 20)" opacity="0.95" />
        <ellipse cx="30" cy="20" rx="12" ry="16" fill="oklch(0.58 0.14 18)" opacity="0.9" />
        <ellipse cx="30" cy="18" rx="8" ry="11" fill="oklch(0.65 0.15 15)" opacity="0.9" />
        <path d="M22 22 Q 30 8 38 22 Q 34 12 30 10 Q 26 12 22 22 Z" fill="oklch(0.42 0.1 20)" opacity="0.85" />
        {/* calyx */}
        <path d="M18 32 L 30 42 L 42 32 Q 36 40 30 44 Q 24 40 18 32 Z" fill="oklch(0.42 0.08 100)" opacity="0.9" />
      </svg>
    );
  }
  if (variant === "kraft-tag-blank") {
    const w = width ?? 90;
    const h = height ?? 140;
    return (
      <div style={{ width: w, height: h + 24, position: "relative" }}>
        {/* twine */}
        <svg width={w} height={30} viewBox="0 0 90 30" style={{ position: "absolute", top: 0, left: 0 }}>
          <path d="M20 4 Q 45 -4 70 4 Q 55 12 45 22 Q 35 12 20 4 Z" stroke="oklch(0.92 0.02 90)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          <circle cx="45" cy="22" r="2" fill="oklch(0.85 0.03 85)" />
        </svg>
        <div
          style={{
            position: "absolute",
            top: 22,
            left: 0,
            width: w,
            height: h,
            background:
              "linear-gradient(135deg, oklch(0.72 0.08 70) 0%, oklch(0.63 0.09 60) 50%, oklch(0.68 0.08 65) 100%)",
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent 0 4px, oklch(0.4 0.06 55 / 0.08) 4px 5px)",
            clipPath:
              "polygon(50% 0, 88% 12%, 100% 22%, 100% 96%, 90% 100%, 10% 100%, 0 96%, 0 22%, 12% 12%)",
            boxShadow: "0 4px 10px oklch(0.3 0.06 40 / 0.3), inset 0 0 20px oklch(0.4 0.08 55 / 0.35)",
            display: "grid",
            placeItems: "center",
            fontFamily: "var(--font-hand)",
            fontSize: 15,
            color: "oklch(0.28 0.05 40)",
            padding: "26px 12px 14px",
            textAlign: "center",
            whiteSpace: "pre-wrap",
          }}
        >
          {/* eyelet */}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              width: 10,
              height: 10,
              marginLeft: -5,
              borderRadius: "50%",
              background: "oklch(0.25 0.02 60)",
              boxShadow: "inset 0 0 3px oklch(1 0 0 / 0.4)",
            }}
          />
          {content ?? ""}
        </div>
      </div>
    );
  }
  if (variant === "kraft-parcel") {
    const w = width ?? 130;
    const h = height ?? 120;
    return (
      <div style={{ width: w, height: h, position: "relative", transform: "rotate(-2deg)" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, oklch(0.7 0.07 70) 0%, oklch(0.6 0.09 60) 55%, oklch(0.66 0.08 65) 100%)",
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent 0 3px, oklch(0.35 0.06 55 / 0.08) 3px 4px), repeating-linear-gradient(-45deg, transparent 0 6px, oklch(0.35 0.06 55 / 0.06) 6px 7px)",
            boxShadow: "0 6px 14px oklch(0.3 0.06 40 / 0.35), inset 0 -6px 10px oklch(0.3 0.06 40 / 0.2)",
          }}
        />
        {/* watercolor ribbon horizontal */}
        <div
          style={{
            position: "absolute",
            left: -4,
            right: -4,
            top: "45%",
            height: 14,
            background:
              "linear-gradient(90deg, oklch(0.86 0.05 20) 0%, oklch(0.82 0.06 340) 50%, oklch(0.78 0.06 240) 100%)",
            opacity: 0.9,
            boxShadow: "0 1px 3px oklch(0.3 0.08 30 / 0.3)",
          }}
        />
        {/* vertical */}
        <div
          style={{
            position: "absolute",
            top: -4,
            bottom: -4,
            left: "45%",
            width: 14,
            background:
              "linear-gradient(180deg, oklch(0.86 0.05 20) 0%, oklch(0.82 0.06 340) 50%, oklch(0.78 0.06 240) 100%)",
            opacity: 0.9,
            boxShadow: "0 1px 3px oklch(0.3 0.08 30 / 0.3)",
          }}
        />
        {/* bow center */}
        <svg
          width="60"
          height="34"
          viewBox="0 0 60 34"
          style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%,-50%)" }}
        >
          <path d="M30 17 C 10 4, -2 10, 4 22 C 8 30, 24 24 30 20 Z" fill="oklch(0.82 0.06 340)" opacity="0.95" />
          <path d="M30 17 C 50 4, 62 10, 56 22 C 52 30, 36 24 30 20 Z" fill="oklch(0.82 0.06 340)" opacity="0.95" />
          <ellipse cx="30" cy="18" rx="5" ry="4" fill="oklch(0.68 0.09 15)" />
        </svg>
      </div>
    );
  }
  if (variant === "botanical-stamp") {
    const w = width ?? 80;
    const h = height ?? 100;
    const tone = (content2 ?? "blue") as string;
    const bg =
      tone === "rose"
        ? "linear-gradient(180deg, oklch(0.88 0.05 20) 0%, oklch(0.78 0.07 15) 100%)"
        : "linear-gradient(180deg, oklch(0.82 0.05 235) 0%, oklch(0.68 0.08 240) 100%)";
    return (
      <div
        style={{
          width: w,
          height: h,
          padding: 5,
          background: "oklch(0.95 0.02 85)",
          boxShadow: "0 3px 7px oklch(0.3 0.05 40 / 0.28)",
          // perforated edge
          WebkitMaskImage:
            "radial-gradient(circle at 4px 50%, transparent 3px, black 3.5px)",
          maskImage: "radial-gradient(circle at 4px 50%, transparent 3px, black 3.5px)",
          WebkitMaskSize: "8px 8px",
          maskSize: "8px 8px",
          WebkitMaskRepeat: "repeat-y",
          maskRepeat: "repeat-y",
          position: "relative",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            padding: 6,
            background: bg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            fontFamily: "var(--font-serif)",
            color: "oklch(0.95 0.02 90)",
          }}
        >
          <div style={{ fontSize: 8, letterSpacing: "0.2em", opacity: 0.9 }}>
            {content ?? "POSTAGE"}
          </div>
          <svg width="46" height="46" viewBox="0 0 46 46">
            {[0, 72, 144, 216, 288].map((d) => (
              <ellipse key={d} cx="23" cy="10" rx="5" ry="9" fill="oklch(0.9 0.05 60)" opacity="0.85" transform={`rotate(${d} 23 23)`} />
            ))}
            <circle cx="23" cy="23" r="3.5" fill="oklch(0.82 0.15 90)" />
            <path d="M23 28 L 23 42" stroke="oklch(0.5 0.09 130)" strokeWidth="1" />
            <path d="M23 34 Q 18 34 16 38" stroke="oklch(0.5 0.09 130)" strokeWidth="1" fill="none" />
          </svg>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}>
            20 CN
          </div>
        </div>
      </div>
    );
  }
  if (variant === "postcard") {
    const w = width ?? 220;
    const h = height ?? 140;
    return (
      <div
        style={{
          width: w,
          height: h,
          padding: 10,
          background: "oklch(0.94 0.03 82)",
          backgroundImage:
            "radial-gradient(ellipse at 20% 30%, oklch(0.88 0.05 55 / 0.6), transparent 60%), radial-gradient(ellipse at 80% 70%, oklch(0.85 0.06 60 / 0.5), transparent 65%)",
          boxShadow: "0 5px 14px oklch(0.3 0.05 40 / 0.3)",
          border: "1px solid oklch(0.4 0.05 45 / 0.35)",
          fontFamily: "var(--font-serif)",
          color: "oklch(0.3 0.05 45)",
          position: "relative",
          transform: "rotate(1deg)",
        }}
      >
        {/* left postmark */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            width: 46,
            height: 46,
            borderRadius: "50%",
            border: "1.5px solid oklch(0.55 0.12 25 / 0.7)",
            display: "grid",
            placeItems: "center",
            fontSize: 7,
            letterSpacing: "0.1em",
            color: "oklch(0.5 0.12 25 / 0.85)",
            transform: "rotate(-8deg)",
          }}
        >
          <div style={{ textAlign: "center", lineHeight: 1.1 }}>
            POST<br />
            {content ?? "1926"}
          </div>
        </div>
        {/* right stamp */}
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 40,
            height: 46,
            background: "oklch(0.85 0.05 20 / 0.85)",
            border: "1px dashed oklch(0.5 0.1 25 / 0.55)",
            display: "grid",
            placeItems: "center",
            fontSize: 9,
            color: "oklch(0.4 0.1 25)",
          }}
        >
          ✿
        </div>
        {/* postmark waves */}
        <svg
          width={w - 80}
          height="22"
          viewBox="0 0 140 22"
          style={{ position: "absolute", top: 24, left: 62 }}
          preserveAspectRatio="none"
        >
          {[4, 10, 16].map((y) => (
            <path key={y} d={`M0 ${y} Q 20 ${y - 2} 40 ${y} T 80 ${y} T 120 ${y} T 160 ${y}`} stroke="oklch(0.5 0.1 25 / 0.55)" strokeWidth="1" fill="none" />
          ))}
        </svg>
        {/* decorative border bottom */}
        <div style={{ position: "absolute", left: 14, right: 14, bottom: 12, fontFamily: "var(--font-hand)", fontSize: 12, color: "oklch(0.45 0.08 40)", letterSpacing: "0.05em" }}>
          {content2 ?? "～ to my dearest ～"}
        </div>
      </div>
    );
  }
  return null;
}

/* ---------- Backgrounds (诗歌背景素材 · 4 styles) ---------- */

function BgPiece({
  el,
  selected,
  onChangeText,
}: {
  el: CanvasElement;
  selected: boolean;
  onChangeText: (t: string, which: "content" | "content2") => void;
}) {
  const variant = (el.variant as BgVariant) ?? "grid-large";
  const fontStack = el.fontFamily === "hand" ? "var(--font-hand)" : "var(--font-serif)";

  const editable = (which: "content" | "content2", cls: string) => (
    <div
      contentEditable={selected}
      suppressContentEditableWarning
      onBlur={(e) => onChangeText(e.currentTarget.textContent || "", which)}
      onPointerDown={(e) => selected && e.stopPropagation()}
      className={`outline-none ${cls}`}
      style={{ fontFamily: fontStack }}
    >
      {which === "content" ? el.content : el.content2}
    </div>
  );

  if (variant === "grid-large") {
    return (
      <div
        className="relative shadow-[0_6px_18px_oklch(0.3_0.05_40/0.22)]"
        style={{
          width: el.width ?? 320,
          minHeight: el.height ?? 220,
          padding: "22px 26px 26px 34px",
          backgroundColor: "oklch(0.985 0.008 90)",
          backgroundImage:
            "linear-gradient(oklch(0.75 0.05 235 / 0.28) 1px, transparent 1px), linear-gradient(90deg, oklch(0.75 0.05 235 / 0.28) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
          clipPath:
            "polygon(0 0, 100% 2%, 98% 20%, 100% 45%, 97% 70%, 100% 96%, 82% 100%, 60% 96%, 40% 100%, 20% 96%, 2% 100%, 0 78%, 3% 50%, 0 25%)",
        }}
      >
        <div className="absolute left-1 top-2 flex h-[calc(100%-16px)] flex-col justify-around">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "oklch(0.6 0.05 60 / 0.35)" }}
            />
          ))}
        </div>
        {editable(
          "content",
          "text-[color:var(--color-ink)] text-[18px] leading-[1.9] whitespace-pre-wrap",
        )}
      </div>
    );
  }

  if (variant === "kraft-large") {
    return (
      <div
        className="relative shadow-[0_6px_18px_oklch(0.3_0.05_40/0.28)]"
        style={{
          width: el.width ?? 280,
          minHeight: el.height ?? 180,
          padding: "20px 24px",
          backgroundColor: "oklch(0.62 0.08 60)",
          backgroundImage:
            "radial-gradient(oklch(0.4 0.05 50 / 0.15) 1px, transparent 1.5px)",
          backgroundSize: "6px 6px",
          color: "oklch(0.22 0.04 50)",
          clipPath:
            "polygon(3% 4%, 20% 0, 40% 5%, 60% 0, 80% 4%, 100% 0, 96% 25%, 100% 55%, 96% 82%, 100% 100%, 78% 96%, 58% 100%, 38% 96%, 18% 100%, 0 96%, 2% 68%, 0 40%, 4% 20%)",
        }}
      >
        {editable("content", "text-[17px] leading-[1.9] whitespace-pre-wrap")}
      </div>
    );
  }

  if (variant === "polaroid") {
    return (
      <div
        className="relative bg-[oklch(0.98_0.008_85)] shadow-[0_8px_24px_oklch(0.3_0.05_40/0.3)]"
        style={{
          width: el.width ?? 200,
          padding: "10px 10px 40px",
        }}
      >
        <div
          className="grain"
          style={{
            width: "100%",
            height: (el.width ?? 200) - 20,
            background:
              "linear-gradient(135deg, oklch(0.93 0.03 85) 0%, oklch(0.87 0.045 75) 55%, oklch(0.8 0.05 65) 100%)",
          }}
        />
        <div
          className="mt-2 text-center text-[15px] text-[color:var(--color-ink)]"
          style={{ fontFamily: fontStack }}
        >
          <div
            contentEditable={selected}
            suppressContentEditableWarning
            onBlur={(e) => onChangeText(e.currentTarget.textContent || "", "content")}
            onPointerDown={(e) => selected && e.stopPropagation()}
            className="outline-none"
          >
            {el.content}
          </div>
        </div>
      </div>
    );
  }

  // letter — 信纸背景
  return (
    <div
      className="relative shadow-[0_6px_18px_oklch(0.3_0.05_40/0.22)]"
      style={{
        width: el.width ?? 320,
        minHeight: el.height ?? 240,
        padding: "36px 32px 30px",
        backgroundColor: "oklch(0.975 0.018 90)",
        backgroundImage:
          "repeating-linear-gradient(to bottom, transparent 0 26px, oklch(0.55 0.06 240 / 0.22) 26px 27px)",
        border: "1px solid oklch(0.7 0.05 50 / 0.3)",
      }}
    >
      {/* top double rule + red stripe */}
      <div
        className="absolute left-0 right-0 top-0 h-[10px]"
        style={{
          background:
            "repeating-linear-gradient(45deg, oklch(0.55 0.2 25) 0 6px, oklch(0.98 0.01 85) 6px 12px, oklch(0.42 0.14 245) 12px 18px, oklch(0.98 0.01 85) 18px 24px)",
        }}
      />
      <div
        className="absolute left-6 right-6 top-[18px] h-[1px]"
        style={{ background: "oklch(0.55 0.06 240 / 0.35)" }}
      />
      {editable(
        "content",
        "text-[color:var(--color-ink)] text-[18px] leading-[27px] whitespace-pre-wrap pt-1",
      )}
    </div>
  );
}

/* ---------- Export ---------- */

export async function exportPng(): Promise<string | null> {
  const node = document.getElementById("collage-canvas");
  if (!node) return null;
  const children = Array.from(node.children) as HTMLElement[];
  if (children.length === 0) return null;

  // 导出前把 To/署名 移动到 DOM 最末尾，确保即使 z-index 解析异常也能画在最上层
  const overlays = children.filter((c) => {
    const kind = c.getAttribute("data-el-kind");
    return kind === "header" || kind === "signature";
  });
  overlays.forEach((c) => node.appendChild(c));

  // 临时套用工作台纸张背景，使导出海报沿用工作台质感
  const hadPaper = node.classList.contains("paper-texture");
  node.classList.add("paper-texture", "grain");

  try {
    // Compute bbox in canvas-local (unscaled) coordinates.
    const PAD = 40;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of children) {
      const l = c.offsetLeft;
      const t = c.offsetTop;
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      // account for rotation by expanding bbox by half-diagonal
      const diag = Math.ceil(Math.hypot(w, h) / 2);
      const cx = l + w / 2;
      const cy = t + h / 2;
      minX = Math.min(minX, cx - diag);
      minY = Math.min(minY, cy - diag);
      maxX = Math.max(maxX, cx + diag);
      maxY = Math.max(maxY, cy + diag);
    }
    minX = Math.floor(minX - PAD);
    minY = Math.floor(minY - PAD);
    maxX = Math.ceil(maxX + PAD);
    maxY = Math.ceil(maxY + PAD);
    const W = Math.max(200, maxX - minX);
    const H = Math.max(200, maxY - minY);

    return toPng(node, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#f2ecdd",
      width: W,
      height: H,
      // 跳过选中手柄等仅编辑时可见的 UI
      filter: (n) =>
        !(n instanceof HTMLElement && n.dataset.exportIgnore === "1"),
      style: {
        transform: `translate(${-minX}px, ${-minY}px)`,
        transformOrigin: "top left",
        width: "4000px",
        height: "4000px",
      },
    });
  } finally {
    if (!hadPaper) node.classList.remove("paper-texture", "grain");
  }
}

export async function downloadPng() {
  const url = await exportPng();
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = `collage-poem-${Date.now()}.png`;
  a.click();
}

export async function downloadPdf() {
  const url = await exportPng();
  if (!url) return;
  const img = new Image();
  img.src = url;
  await new Promise((r) => (img.onload = r));
  const pdf = new jsPDF({
    orientation: img.width > img.height ? "landscape" : "portrait",
    unit: "px",
    format: [img.width, img.height],
  });
  pdf.addImage(url, "PNG", 0, 0, img.width, img.height);
  pdf.save(`collage-poem-${Date.now()}.pdf`);
}
