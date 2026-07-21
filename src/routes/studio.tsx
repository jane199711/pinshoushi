import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Canvas,
  createElement,
  downloadPng,
  TEXT_VARIANTS,
  type CanvasElement,
  type ElementKind,
  type TextVariant,
} from "@/components/collage/Canvas";
import { FallingFragments } from "@/components/collage/FallingFragments";
import { generateLocalPoem } from "@/lib/poetry.local";
import {
  savePreset,
  loadPreset,
  type Relation,
  type Template,
  RELATION_LABEL,
  TEMPLATE_LABEL,
} from "@/lib/work-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [{ title: "工作台 · 拼首诗" }],
  }),
  component: StudioPage,
});

const STYLES = ["清新", "忧郁", "温柔", "俏皮", "复古", "轻盈", "热烈"];
const MOODS = ["想念", "温柔", "怅然", "雀跃", "感激", "释然", "浪漫", "悸动"];

const TEMPLATES: { key: Template; hint: string }[] = [
  { key: "birthday", hint: "生日" },
  { key: "anniversary", hint: "纪念" },
  { key: "confession", hint: "告白" },
  { key: "thanks", hint: "感谢" },
  { key: "missing", hint: "想念" },
  { key: "free", hint: "自由·穆旦" },
];

const RELATIONS: Relation[] = ["lover", "friend", "family", "self", "other"];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`max-w-full h-9 px-3 text-[13px] font-semibold leading-none border-none truncate transition ${
        active
          ? "tape-torn-blue shadow-sm"
          : "tape-torn"
      }`}
    >
      {children}
    </button>
  );
}

function StudioPage() {
  // ─── 预选项状态（原 create 页面的内容）────────
  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [relation, setRelation] = useState<Relation>("friend");
  const [template, setTemplate] = useState<Template>("birthday");
  const [style, setStyle] = useState<string[]>(["温柔"]);
  const [moods, setMoods] = useState<string[]>([]);

  // 当任何预选项变化时，实时保存 preset（影响碎片生成）
  useEffect(() => {
    savePreset({
      recipient: recipient.trim() || "你",
      sender: sender.trim() || "你的朋友",
      relation,
      template,
      style,
      scenes: [],
      images: [],
      moods,
    });
  }, [recipient, sender, relation, template, style, moods]);

  // ─── 画布状态 ──────────────────────────────
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hideChrome, setHideChrome] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // ─── 碎片飘落控制 ──────────────────────────
  // 飘落暂停/继续（空格键切换）
  const [fallingActive, setFallingActive] = useState(true);
  // 碎片池版本号：每次预设变化时递增，触发 FallingFragments 重建词池
  const [fragmentKey, setFragmentKey] = useState(0);

  // 空格键暂停/继续飘落
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || hideChrome) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      setFallingActive((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hideChrome]);

  // ─── 左侧菜单栏状态 ────────────────────────
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarAutoHidden, setSidebarAutoHidden] = useState(false);
  const sidebarHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasSelectedOnce, setHasSelectedOnce] = useState(false);

  // 首次选好后2秒自动隐藏
  const scheduleAutoHide = useCallback(() => {
    if (sidebarHideTimerRef.current) clearTimeout(sidebarHideTimerRef.current);
    if (!hasSelectedOnce) {
      setHasSelectedOnce(true);
      sidebarHideTimerRef.current = setTimeout(() => {
        setSidebarAutoHidden(true);
        setSidebarVisible(false);
      }, 2000);
    }
  }, [hasSelectedOnce]);

  // 鼠标移到左侧边缘显示菜单栏
  const handleSidebarMouseEnter = () => {
    if (sidebarHideTimerRef.current) clearTimeout(sidebarHideTimerRef.current);
    if (sidebarAutoHidden) {
      setSidebarVisible(true);
    }
  };
  const handleSidebarMouseLeave = () => {
    if (sidebarAutoHidden && hasSelectedOnce) {
      sidebarHideTimerRef.current = setTimeout(() => {
        setSidebarVisible(false);
      }, 600);
    }
  };

  // 预选项变化时刷新碎片池（如果正在飘落则实时变化）
  useEffect(() => {
    setFragmentKey((k) => k + 1);
  }, [template, style, moods, relation]);

  // ─── To / 署名按钮状态 ─────────────────────
  const [showToEditor, setShowToEditor] = useState(false);
  const [showSigEditor, setShowSigEditor] = useState(false);

  // 初始化时从 localStorage 恢复
  useEffect(() => {
    const p = loadPreset();
    if (p) {
      if (p.recipient && p.recipient !== "你") setRecipient(p.recipient);
      if (p.sender && p.sender !== "你的朋友") setSender(p.sender);
      if (p.relation) setRelation(p.relation);
      if (p.template) setTemplate(p.template);
      if (p.style?.length) setStyle(p.style);
      if (p.moods?.length) setMoods(p.moods);
    }
  }, []);

  // ─── 视图居中 ─────────────────────────────
  const [recenter, setRecenter] = useState<{ x: number; y: number; nonce: number } | null>(null);
  const recenterNonce = useRef(0);
  const recenterOn = (elts: CanvasElement[]) => {
    if (!elts.length) return;
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const e of elts) {
      const w = e.kind === "image" ? (e.width ?? 200) : (e.content?.length ?? 2) * 24 + 50;
      const h = e.kind === "image" ? (e.width ?? 200) * 0.8 : 52;
      a = Math.min(a, e.x); b = Math.min(b, e.y);
      c = Math.max(c, e.x + w); d = Math.max(d, e.y + h);
    }
    recenterNonce.current += 1;
    setRecenter({ x: (a + c) / 2, y: (b + d) / 2, nonce: recenterNonce.current });
  };

  // 诗块 token：纯字符串（自动随机样式）或带样式的"种子"（已有固定词，保留其 variant/fontFamily）
  type PoemToken = string | { text: string; variant?: TextVariant; fontFamily?: "serif" | "hand" };

  // ─── 把若干诗行铺成画布元素（指定左上角原点）───────────────
  const layoutLines = useCallback(
    (lines: PoemToken[][], originX: number, originY: number): CanvasElement[] => {
      const rand = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
      const lineH = 82;
      const gap = 42;
      const texts: CanvasElement[] = [];
      lines.forEach((line, li) => {
        let x = originX + (Math.random() - 0.5) * 24;
        const baseY = originY + li * lineH;
        line.forEach((tok) => {
          const text = typeof tok === "string" ? tok : tok.text;
          const variant: TextVariant =
            typeof tok === "string" ? rand(TEXT_VARIANTS) : tok.variant ?? rand(TEXT_VARIANTS);
          const fontFamily: "serif" | "hand" =
            variant === "grid-note" || variant === "blue-washi"
              ? "hand"
              : typeof tok === "string"
                ? "serif"
                : tok.fontFamily ?? "serif";
          texts.push(
            createElement({
              kind: "text",
              variant,
              content: text,
              fontFamily,
              x,
              y: baseY + (Math.random() - 0.5) * 8,
              rotation: (Math.random() - 0.5) * 4,
            }),
          );
          x += text.length * 24 + 48 + gap;
        });
      });
      return texts;
    },
    [],
  );

  // ─── 生成完整诗歌（不含 To/署名）───────────────
  const buildPoem = useCallback(
    (p: ReturnType<typeof loadPreset>): CanvasElement[] => {
      return layoutLines(generateLocalPoem(p), 480, 250);
    },
    [layoutLines],
  );

  // 把画布上已有的固定词作为"种子"注入到按规则生成的诗行里：
  // 每个种子占据一个独立的词块（不会相互覆盖），保证每个已有词都进入诗；
  // 不再强制作为第一行，原有位置也会被重新排布。
  function injectSeeds(
    lines: string[][],
    seeds: { text: string; variant?: TextVariant; fontFamily?: "serif" | "hand" }[],
  ): PoemToken[][] {
    const merged: PoemToken[][] = lines.map((l) => l.slice());
    if (seeds.length === 0) return merged;

    // 收集所有已有词块的位置（行, 列），洗匀后逐个用种子替换，互不覆盖
    const slots: [number, number][] = [];
    merged.forEach((line, li) => line.forEach((_, bi) => slots.push([li, bi])));
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }

    let si = 0;
    for (const [li, bi] of slots) {
      if (si >= seeds.length) break;
      merged[li][bi] = {
        text: seeds[si].text,
        variant: seeds[si].variant,
        fontFamily: seeds[si].fontFamily,
      };
      si += 1;
    }

    // 种子多于词块时，余下的种子追加到各行末尾（每行一个，铺成更长的诗）
    let li = 0;
    while (si < seeds.length) {
      const line = merged[li % merged.length];
      line.push({
        text: seeds[si].text,
        variant: seeds[si].variant,
        fontFamily: seeds[si].fontFamily,
      });
      si += 1;
      li += 1;
    }
    return merged;
  }

  // ─── 一键成诗 ───────────────────────────────
  // 画布空白 → 按现有规则生成整首诗；画布已有固定词 → 把它们的内容编入一首新诗，
  // 全部词（含原有词）重新排布成诗，原有词的位置可移动，不强作第一行、不锁定。
  const generatePoem = () => {
    const p = loadPreset();
    const existing = elements.filter((e) => e.kind === "text" && e.content && e.content.trim());
    if (existing.length === 0) {
      const texts = buildPoem(p);
      setElements(texts);
      recenterOn(texts);
    } else {
      const seeds = existing.map((e) => ({
        text: e.content!.trim(),
        variant: e.variant as TextVariant | undefined,
        fontFamily: e.fontFamily,
      }));
      const merged = injectSeeds(generateLocalPoem(p), seeds);
      const texts = layoutLines(merged, 480, 250);
      setElements(texts);
      recenterOn(texts);
    }
    setSelectedId(null);
  };

  // 一键清空画布
  const clearCanvas = () => {
    setElements([]);
    setSelectedId(null);
  };

  // ─── 下载：临时将 To/署名加入画布 → 导出 → 移除 ──
  const handleDownload = async () => {
    setSelectedId(null);
    setDownloading(true);

    try {
      // 构建当前 preset
      const p = loadPreset();

      // 计算诗歌包围盒以定位 To 和署名
      const textEls = elements.filter((e) => e.kind === "text");
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const e of textEls) {
        const w = (e.content?.length ?? 2) * 24 + 50;
        const h = 52;
        minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
        maxX = Math.max(maxX, e.x + w); maxY = Math.max(maxY, e.y + h);
      }

      const overlays: CanvasElement[] = [];
      if (textEls.length > 0) {
        // 让 To 和署名远离诗歌主体，避免导出海报时遮挡词条。
        // 左上角 To 框往左上方再退，右下角署名往右下方再退。
        overlays.push(
          createElement({
            kind: "header" as ElementKind,
            content: recipient.trim() || p?.recipient || "你",
            x: minX - 120,
            y: minY - 110,
            rotation: -3,
          }),
          createElement({
            kind: "signature" as ElementKind,
            content: sender.trim() || p?.sender || "你的朋友",
            x: maxX - 20,
            y: maxY + 80,
            rotation: 2,
          }),
        );
      }

      // 临时添加到画布，多留一点时间让字体/背景图稳定
      setElements((els) => [...els, ...overlays]);
      await new Promise((r) => setTimeout(r, 300));
      await downloadPng();
    } finally {
      // 导出完成后移除（无论成功或失败都要清掉）
      setElements((els) => els.filter((e) => e.kind !== "header" && e.kind !== "signature"));
      setDownloading(false);
    }
  };

  // ─── 切换函数 ─────────────────────────────
  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // 选择器点击时触发自动隐藏倒计时
  const handleSelectorClick = (fn: () => void) => {
    fn();
    scheduleAutoHide();
  };

  // ─── 首次进入引导教程 ────────────────────
  const TOUR_KEY = "poem-tour-done";
  // 默认每次刷新都显示引导教程（不读/不写 localStorage），仍可加 ?tour 参数显式触发
  const forceTour = true;
  const [tourStep, setTourStep] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    if (forceTour) return 0;
    try {
      return window.localStorage.getItem(TOUR_KEY) ? null : 0;
    } catch {
      return null;
    }
  });
  const [tourRect, setTourRect] = useState<{ top: number; left: number; w: number; h: number } | null>(null);

  type TourKind = "next" | "wait-click" | "wait-drag";
  const TOUR_STEPS: {
    kind: TourKind;
    manual?: boolean;
    target?: "to" | "sidebar" | "generate" | "falling" | "clear" | "export" | "sig";
    title: string;
    text: string;
  }[] = [
    { kind: "next", target: "to", title: "写给谁的诗", text: "点左上角这里，填写这首诗要送给的人。" },
    { kind: "next", target: "sidebar", title: "选择主题", text: "在底部工具栏选择主题，飘落的碎词会实时换成匹配的词。" },
    { kind: "next", target: "generate", title: "一键成诗", text: "点「一键成诗」按钮，一键生成一首完整诗稿铺到画布上，再自由调整。" },
    { kind: "wait-click", manual: true, title: "试试点击碎片", text: "轻触屏幕上任意一个飘落的碎词，把它固定到画布上。然后点「下一步」。" },
    { kind: "wait-drag", manual: true, title: "试试拖拽", text: "按住固定的词语拖动，把它摆到喜欢的位置。然后点「下一步」。" },
    { kind: "next", title: "双击编辑", text: "双击画布上的词语可以修改文字内容。" },
    { kind: "next", title: "叠放替换", text: "把飘落的碎词拖到已有词语上松开，可以替换内容。" },
    { kind: "next", title: "删除词语", text: "长按画布上的某个词语，右侧会出现删除区，把它拖进删除区松手即可删除。" },
    { kind: "next", target: "falling", title: "暂停飘落", text: "点底部这个飘落控制键，或按下键盘上的空格键，都可以暂停或继续飘落，方便你慢慢挑选词语。" },
    { kind: "next", target: "clear", title: "清空画布", text: "想重新开始？点「清空」按钮可以一键移除画布上的所有内容。" },
    { kind: "next", target: "sig", title: "署名", text: "点右下角这里写下你的署名。" },
    { kind: "next", target: "export", title: "导出作品", text: "满意了点右上角这里，把拼贴诗导出成图片保存。" },
  ];

  const measureTourTarget = useCallback(() => {
    const step = TOUR_STEPS[tourStep ?? 0];
    if (!step) return;
    const idMap: Record<string, string> = {
      to: "tour-to",
      sidebar: "tour-sidebar",
      generate: "tour-generate",
      falling: "tour-falling",
      clear: "tour-clear",
      export: "tour-export",
      sig: "tour-sig",
    };
    const elId = step.target ? idMap[step.target] : null;
    if (!elId) {
      setTourRect(null);
      return;
    }
    const el = document.getElementById(elId);
    if (el) {
      const r = el.getBoundingClientRect();
      setTourRect({ top: r.top, left: r.left, w: r.width, h: r.height });
    }
  }, [tourStep]);

  useEffect(() => {
    if (tourStep === null) return;
    const t = requestAnimationFrame(measureTourTarget);
    return () => cancelAnimationFrame(t);
  }, [tourStep, measureTourTarget]);

  const endTour = () => {
    setTourStep(null);
    if (!forceTour) {
      try {
        window.localStorage.setItem(TOUR_KEY, "1");
      } catch {
        /* noop */
      }
    }
  };
  const tourNext = () => {
    if (tourStep === null) return;
    if (tourStep + 1 >= TOUR_STEPS.length) endTour();
    else setTourStep(tourStep + 1);
  };

  // 交互式步骤：等待用户真正执行动作后推进
  useEffect(() => {
    if (tourStep === null) return;
    const step = TOUR_STEPS[tourStep];
    if (!step) return;

    if (step.kind === "wait-click") {
      if (step.manual) return; // 手动步骤：由用户点「下一步」推进
      const handler = (e: PointerEvent) => {
        // 点击教程气泡自身不推进
        const t = e.target as HTMLElement;
        if (t.closest(".tour-bubble")) return;
        tourNext();
      };
      window.addEventListener("pointerdown", handler, { once: true });
      return () => window.removeEventListener("pointerdown", handler);
    }

    if (step.kind === "wait-drag") {
      if (step.manual) return; // 手动步骤：由用户点「下一步」推进
      let startX = 0, startY = 0, listening = false;
      const onDown = (e: PointerEvent) => {
        startX = e.clientX; startY = e.clientY; listening = true;
      };
      const onMove = (e: PointerEvent) => {
        if (!listening) return;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 12) {
          window.removeEventListener("pointerdown", onDown);
          window.removeEventListener("pointermove", onMove);
          tourNext();
        }
      };
      window.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      return () => {
        window.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
      };
    }
  }, [tourStep, tourNext]);

  return (
    <main className="relative flex h-screen w-screen overflow-hidden">
      {/* ====== 画布 ====== */}
      <div className="absolute inset-0">
        <Canvas
          elements={elements}
          setElements={setElements}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          hideChrome={hideChrome}
          recenterTo={recenter}
        />
      </div>

      {/* ====== 顶栏 ====== */}
      {!hideChrome && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-4">
          {/* 左侧：返回 + To 按钮 */}
          <div className="pointer-events-auto flex items-center gap-2">
            <Link to="/" className="tape-torn flex items-center justify-center px-3 py-2 text-sm font-semibold transition">
              返回
            </Link>

            {/* To 按钮 — 点击可编辑收件人名字（手撕胶带） */}
            <div className="relative" id="tour-to">
              <button
                onClick={() => setShowToEditor(!showToEditor)}
                className="tape-torn flex items-center gap-2 px-5 py-3 rotate-1 transition"
                style={{ fontFamily: "var(--font-hanchan), var(--font-hand)", "--tape-tilt": "1deg" } as React.CSSProperties}
              >
                <span className="text-2xl leading-none" style={{ color: "rgba(74,53,32,0.72)" }}>To</span>
                <span className="text-[32px] font-semibold">
                  {recipient.trim() || "你"}
                </span>
              </button>
              {showToEditor && (
                <div className="absolute left-0 top-full mt-2 z-50 rounded-lg bg-card p-2 shadow-xl ring-1 ring-black/10">
                  <Input
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="TA 的名字"
                    className="h-8 w-32 bg-background/90 text-sm"
                    autoFocus
                    onBlur={() => setShowToEditor(false)}
                    onKeyDown={(e) => e.key === "Enter" && setShowToEditor(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 右侧：操作按钮（仅保留导出） */}
          <div className="pointer-events-auto flex items-center gap-2" id="tour-export">
            <Button
              variant="outline"
              onClick={clearCanvas}
              disabled={elements.length === 0}
              id="tour-clear"
              className="h-9 px-3.5 text-[13px] font-semibold"
            >
              清空
            </Button>
            <Button
              onClick={handleDownload}
              disabled={downloading || elements.length === 0}
              className="h-9 px-3.5 text-[13px] font-semibold"
            >
              {downloading ? "导出中…" : "下载诗歌"}
            </Button>
          </div>
        </header>
      )}

      {/* ====== 底部工具栏（主题 + 一键成诗 + 模式切换）====== */}
      {!hideChrome && (
        <div id="tour-sidebar" className="pointer-events-auto absolute bottom-0 inset-x-0 z-50 flex items-center justify-center gap-2 px-4 py-3">
          <div className="flex items-center gap-1.5 px-4 py-2.5 -rotate-1">
            {/* 主题选择 */}
            {TEMPLATES.map((t) => (
              <Chip
                key={t.key}
                active={template === t.key}
                onClick={() => {
                  setTemplate(t.key);
                  setFragmentKey((k) => k + 1);
                }}
              >
                {TEMPLATE_LABEL[t.key]}
              </Chip>
            ))}

            <div className="mx-1 h-5 w-px bg-border/40" />

            {/* 一键成诗 */}
            <Button
              onClick={generatePoem}
              id="tour-generate"
              className="h-9 px-3 text-[13px] font-semibold"
            >
              一键成诗
            </Button>

            <div className="mx-1 h-5 w-px bg-border/40" />

            {/* 飘落 / 暂停（一个按钮切换两种状态，空格键也可切换） */}
            <button
              onClick={() => setFallingActive(!fallingActive)}
              id="tour-falling"
              className={`tape-torn h-9 px-3 text-[13px] font-semibold leading-none ${
                fallingActive ? "tape-torn-blue" : ""
              }`}
            >
              {fallingActive ? "暂停飘落" : "飘落碎片"}
            </button>
          </div>
        </div>
      )}

      {/* ====== 署名按钮（右下角）===== */}
      {!hideChrome && (
        <div className="pointer-events-auto absolute right-5 bottom-16 z-40" id="tour-sig">
          <div className="relative">
              <button
                onClick={() => setShowSigEditor(!showSigEditor)}
                className="tape-torn flex items-center gap-2 px-5 py-3 -rotate-1 transition"
                style={{ fontFamily: "var(--font-hanchan), var(--font-hand)", "--tape-tilt": "-1deg" } as React.CSSProperties}
              >
                <span className="text-[32px] leading-none">—</span>
                <span className="text-[32px] font-semibold">
                  {sender.trim() || "你的朋友"}
                </span>
              </button>
            {showSigEditor && (
              <div className="absolute bottom-full right-0 mb-2 z-50 rounded-lg bg-card p-2 shadow-xl ring-1 ring-black/10">
                <Input
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder="你的署名"
                  className="h-8 w-36 bg-background/90 text-sm"
                  autoFocus
                  onBlur={() => setShowSigEditor(false)}
                  onKeyDown={(e) => e.key === "Enter" && setShowSigEditor(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== 碎片飘落层 ====== */}
      {!hideChrome && (
        <FallingFragments
          placedCount={elements.filter((e) => e.kind === "text").length}
          key={fragmentKey}
          active={fallingActive}
          onPinToCanvas={(el) => {
            setElements((prev) => [...prev, el]);
          }}
        />
      )}

      {/* ====== 首次进入引导教程 ====== */}
      {tourStep !== null && TOUR_STEPS[tourStep] && (
        <>
          {/* 半透明遮罩：不拦截点击，仅提供视觉聚焦 */}
          <div className="pointer-events-none absolute inset-0 z-[80] bg-black/30" />
          {/* 高亮目标区域 */}
          {tourRect && (
            <div
              className="pointer-events-none absolute z-[81] rounded-xl ring-2 ring-[color:var(--color-coral)]"
              style={{
                top: tourRect.top - 6,
                left: tourRect.left - 6,
                width: tourRect.w + 12,
                height: tourRect.h + 12,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.3)",
                transition: "all 0.25s ease",
              }}
            />
          )}
          {/* 引导气泡 */}
          <OnboardingBubble
            step={tourStep}
            total={TOUR_STEPS.length}
            kind={TOUR_STEPS[tourStep].kind}
            manual={TOUR_STEPS[tourStep].manual}
            title={TOUR_STEPS[tourStep].title}
            text={TOUR_STEPS[tourStep].text}
            rect={tourRect}
            onNext={tourNext}
            onSkip={endTour}
          />
        </>
      )}
    </main>
  );
}

/* ---------- 首次进入引导气泡 ---------- */
function OnboardingBubble({
  step,
  total,
  kind,
  manual,
  title,
  text,
  rect,
  onNext,
  onSkip,
}: {
  step: number;
  total: number;
  kind: "next" | "wait-click" | "wait-drag";
  manual?: boolean;
  title: string;
  text: string;
  rect: { top: number; left: number; w: number; h: number } | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  // 有锚点时把气泡放在目标右侧/下方；无锚点时居中偏下
  const style: React.CSSProperties = rect
    ? {
        top: Math.min(rect.top, window.innerHeight - 220),
        left: Math.min(rect.left + rect.w + 16, window.innerWidth - 320),
      }
    : { left: "50%", top: "72%", transform: "translateX(-50%)" };

  const isWait = kind !== "next" && !manual;

  return (
    <div
      className="tour-bubble pointer-events-auto absolute z-[82] w-[300px] rounded-2xl bg-card p-4 shadow-2xl ring-1 ring-black/10"
      style={style}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--color-coral)" }}>
          {title}
        </span>
        <span className="text-[10px] text-muted-foreground">{step + 1} / {total}</span>
      </div>
      <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={onSkip} className="text-[11px] text-muted-foreground underline-offset-2 hover:underline">
          跳过
        </button>
        {isWait ? (
          <span className="text-[10px] text-muted-foreground">完成后自动继续 →</span>
        ) : (
          <button
            onClick={onNext}
            className="rounded-full bg-[color:var(--color-coral)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[color:var(--color-coral)]/90"
          >
            {step + 1 >= total ? "开始创作" : "下一步"}
          </button>
        )}
      </div>
    </div>
  );
}
