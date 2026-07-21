import { useEffect, useRef, useState } from "react";
import {
  generateLocalFragments,
  getAllThemeWords,
  getAllThemeWordsForAll,
  type Fragment,
} from "@/lib/poetry.local";
import { TextCarrier, TEXT_VARIANTS, type TextVariant } from "./Canvas";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { loadPreset, type Template } from "@/lib/work-storage";

type Piece = { id: string; word: string; variant: TextVariant };

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function initPieces(fragments: Fragment[]): Piece[] {
  return shuffle(fragments).map((f, i) => ({
    id: `pf-${i}-${f.text}`,
    word: f.text,
    // 样式等概率随机分配
    variant: TEXT_VARIANTS[Math.floor(Math.random() * TEXT_VARIANTS.length)],
  }));
}

/** 每批从主题牌堆发出的主题词数量（约 90% 主题词 + 少量公共词） */
const BATCH_THEME = 44;

export function AiFragments({ autoRun = false }: { autoRun?: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [trashHover, setTrashHover] = useState(false);

  // 主题牌堆：每主题维护一个已洗匀的剩余词队列，发牌后移除；
  // 队列不足时重洗（剔除上一批，避免立刻重复）。保证同主题「换一批」尽量不重复。
  const deckRef = useRef<{ tpl: string; queue: string[] }>({ tpl: "", queue: [] });
  const lastBatchRef = useRef<string[]>([]);

  const uniqWords = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

  const buildDeck = (words: string[]): string[] => {
    const pool = uniqWords(words);
    const shuffled = shuffle(pool);
    // 剔除上一批，保证「换一批」不重复
    const filtered = shuffled.filter((w) => !lastBatchRef.current.includes(w));
    return filtered.length >= 6 ? filtered : shuffle(pool);
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const p = loadPreset();
      // 完全本地生成，加一点点延迟营造「挑选词语」的手感
      await new Promise((r) => setTimeout(r, 260));
      const tpl = (p?.template ?? "free") as string;

      // 主题词全集：指定主题（含「自由」穆旦主题）用该主题词库；未设置则用全部主题合并
      // —— 始终从牌堆发牌，保证同主题「换一批」不重复（不再走随机）
      const baseWords =
        getAllThemeWords(tpl as Template).length > 0
          ? getAllThemeWords(tpl as Template)
          : getAllThemeWordsForAll();

      if (deckRef.current.tpl !== tpl || deckRef.current.queue.length < 40) {
        deckRef.current = { tpl: tpl, queue: buildDeck(baseWords) };
      }
      const need = Math.min(deckRef.current.queue.length, BATCH_THEME);
      const dealt = deckRef.current.queue.splice(0, need);
      lastBatchRef.current = dealt;
      const fragments = generateLocalFragments(p, { themeWordsOverride: dealt });

      setPieces(initPieces(fragments));
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  // 进入面板即先生成一批（含从「飘落」切到「一键生成」时）
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 兼容旧调用：autoRun 时也确保已生成
  useEffect(() => {
    if (autoRun && !pieces) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  const removePiece = (id: string) => {
    setPieces((d) => {
      if (!d) return d;
      return d.filter((p) => p.id !== id);
    });
  };

  // 拖到删除区：根据 dataTransfer 中的碎片 id 移除
  const onTrashDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setTrashHover(false);
    const id = e.dataTransfer.getData("application/x-collage-id");
    if (id) removePiece(id);
  };

  return (
    <div className="flex h-full flex-col gap-3" data-drop-trash="ai">
      <div className="flex items-center justify-between">
        <div
          className="flex items-center gap-2 text-sm font-semibold tracking-widest"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          <Sparkles className="h-4 w-4 text-[color:var(--color-coral)]" />
          诗歌碎片
        </div>
        <Button
          onClick={run}
          disabled={loading}
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs"
        >
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "生成中" : "换一批"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex-1 overflow-y-auto pr-1">
        {!pieces && loading && (
          <div className="mt-8 text-center text-xs text-muted-foreground">
            正在为 TA 挑选词语…
          </div>
        )}
        {pieces && pieces.length === 0 && (
          <div className="mt-8 text-center text-xs text-muted-foreground">
            碎片都被清走了，点「换一批」重新生成
          </div>
        )}
        {pieces && pieces.length > 0 && (
          <div className="flex flex-wrap items-start gap-2.5">
            {pieces.map((p) => (
              <DraggableFragment
                key={p.id}
                piece={p}
                onDropAway={() => removePiece(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 删除区：把碎片拖到这里即可删除 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setTrashHover(true);
        }}
        onDragLeave={() => setTrashHover(false)}
        onDrop={onTrashDrop}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed py-2.5 text-xs transition ${
          trashHover
            ? "border-red-400 bg-red-500/15 text-red-300"
            : "border-border/60 text-muted-foreground"
        }`}
      >
        <Trash2 className="h-4 w-4" />
        {trashHover ? "松手删除" : "不想用的词拖到这里删除"}
      </div>

      <p className="border-t border-border/50 pt-2 text-[10px] leading-relaxed text-muted-foreground">
        拖拽词语到画布拼贴 · 双击画布上的词可编辑 · 拖到删除区移除
      </p>
    </div>
  );
}

function DraggableFragment({
  piece,
  onDropAway,
}: {
  piece: Piece;
  onDropAway: () => void;
}) {
  const fontFamily =
    piece.variant === "grid-note" || piece.variant === "blue-washi" ? "hand" : "serif";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(
          "application/x-collage",
          JSON.stringify({
            kind: "text",
            variant: piece.variant,
            content: piece.word,
            fontFamily,
          }),
        );
        // 记录碎片 id，供删除区识别
        e.dataTransfer.setData("application/x-collage-id", piece.id);
      }}
      onDragEnd={(e) => {
        // 落在画布（dropEffect=copy）即已加入画布，从本面板移除；
        // 落在删除区（dropEffect=move）由删除区自行移除，这里不重复处理。
        if (e.dataTransfer.dropEffect === "copy") onDropAway();
      }}
      className="cursor-grab transition hover:-translate-y-0.5 active:cursor-grabbing"
      title="拖拽到画布"
      style={{
        transform: `scale(${piece.word.length > 8 ? 0.68 : 0.8})`,
        transformOrigin: "top left",
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
          fontFamily,
        }}
      />
    </div>
  );
}
