import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  savePreset,
  type Relation,
  type Template,
  RELATION_LABEL,
  TEMPLATE_LABEL,
} from "@/lib/work-storage";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "开始创作 · 拼首诗" },
      {
        name: "description",
        content: "选择送给谁、主题与心境，为 TA 挑选专属的诗歌碎片。",
      },
    ],
  }),
  component: CreatePage,
});

const STYLES = ["清新", "忧郁", "温柔", "俏皮", "复古", "轻盈", "热烈"];
const MOODS = ["想念", "温柔", "怅然", "雀跃", "感激", "释然", "浪漫", "悸动"];

const TEMPLATES: { key: Template; hint: string }[] = [
  { key: "birthday", hint: "为 TA 的一岁写一首" },
  { key: "anniversary", hint: "把回忆折进纸里" },
  { key: "confession", hint: "说出没说完的话" },
  { key: "thanks", hint: "谢谢那段温柔的日子" },
  { key: "missing", hint: "写给远方的 TA" },
  { key: "free", hint: "自由·穆旦风格" },
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
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-transparent bg-[color:var(--color-coral)] text-white shadow-sm"
          : "border-border/70 bg-background/60 text-muted-foreground hover:border-[color:var(--color-coral)] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function CreatePage() {
  const nav = useNavigate();
  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [relation, setRelation] = useState<Relation>("friend");
  const [template, setTemplate] = useState<Template>("birthday");
  const [style, setStyle] = useState<string[]>(["温柔"]);
  const [moods, setMoods] = useState<string[]>([]);

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const start = () => {
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
    // 进入工作台后自动一键生成诗歌 + 装饰
    if (typeof window !== "undefined") sessionStorage.setItem("collage-autogen", "1");
    nav({ to: "/studio" });
  };

  return (
    <main className="warm-paper min-h-screen w-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          返回首页
        </Link>
        <header className="mb-8 text-center">
          <h1
            className="text-3xl font-bold tracking-tight md:text-4xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            为 TA 定制这首诗
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            告诉我们要送给谁、这是一份什么样的心意，我们会为 TA 挑选合适的词语。
          </p>
        </header>

        <section className="space-y-8 rounded-2xl bg-card/85 p-6 shadow-md ring-1 ring-black/5 backdrop-blur md:p-8">
          <div className="space-y-3">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">送给谁</label>
            <Input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="TA 的名字 / 昵称"
              className="bg-background/70 text-base"
            />
            <div className="flex flex-wrap gap-1.5">
              {RELATIONS.map((r) => (
                <Chip key={r} active={relation === r} onClick={() => setRelation(r)}>
                  {RELATION_LABEL[r]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">你的名字</label>
            <Input
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="署名 / 你的名字"
              className="bg-background/70 text-base"
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">主题</label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTemplate(t.key)}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                    template === t.key
                      ? "border-[color:var(--color-coral)] bg-[color:var(--color-coral)]/10 shadow-sm"
                      : "border-border/60 bg-background/50 hover:border-[color:var(--color-coral)]/60"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    {TEMPLATE_LABEL[t.key]}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{t.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <FieldChips label="诗歌风格" options={STYLES} value={style} onToggle={(v) => setStyle(toggle(style, v))} />
          <FieldChips label="情绪" options={MOODS} value={moods} onToggle={(v) => setMoods(toggle(moods, v))} />

          <Button size="lg" onClick={start} className="w-full text-base">
            一键成诗
          </Button>
        </section>
      </div>
    </main>
  );
}

function FieldChips({
  label,
  options,
  value,
  onToggle,
}: {
  label: string;
  options: string[];
  value: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Chip key={o} active={value.includes(o)} onClick={() => onToggle(o)}>
            {o}
          </Chip>
        ))}
      </div>
    </div>
  );
}
