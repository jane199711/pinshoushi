import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import heroImage from "@/assets/hero-landing.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "拼首诗 · 送给重要的人" },
      {
        name: "description",
        content:
          "拼首诗，送给重要的人。把想说的话，拼成一首独一无二的诗，做成一张手作贺卡。",
      },
      { property: "og:title", content: "拼首诗 · 送给重要的人" },
      {
        property: "og:description",
        content: "拼首诗，送给重要的人。亲手拼一首只属于 TA 的诗。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const nav = useNavigate();
  return (
    <main className="relative h-screen w-full overflow-hidden">
      <img
        src={heroImage}
        alt="手作拼贴诗歌 · 摊开的诗集与干花、蝴蝶、蜡封、丝带礼盒"
        width={1920}
        height={1280}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* soft vignette so the text stays readable on the vintage palette */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/62" />

      <div className="relative z-10 flex h-full flex-col items-center justify-between px-6 py-10 text-center">
        <div
          className="inline-flex items-center gap-2 rounded-full bg-[#f3e6c8]/90 px-4 py-1.5 text-[11px] tracking-[0.3em] text-[#3a2410] shadow-md ring-1 ring-[#e0b357]/60 backdrop-blur"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          <Heart className="h-3.5 w-3.5 text-[#e0b357]" />
          COLLAGE · POETRY · GIFT
        </div>

        <div className="max-w-2xl space-y-6">
          <h1
            className="text-5xl font-bold leading-tight tracking-tight text-[#f8eecb] drop-shadow-[0_2px_18px_rgba(28,16,6,0.78)] md:text-7xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            拼首诗
            <br />
            <span className="text-[#f1c465]">送给重要的人</span>
          </h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-[#f2e6c8] drop-shadow-[0_1px_10px_rgba(28,16,6,0.7)] md:text-base">
            为你在乎的人，亲手拼一首独一无二的诗，做成一张手作贺卡。
          </p>
          <Button
            size="lg"
            onClick={() => nav({ to: "/studio" })}
            className="torn-paper group h-14 rounded-none px-10 text-lg transition hover:scale-[1.03]"
          >
            开始拼贴
          </Button>
        </div>

        <p className="text-[11px] tracking-widest text-[#ecdcb0] drop-shadow-[0_1px_8px_rgba(28,16,6,0.7)]">
          手作 · 拼贴 · 心意 —— 拼首诗
        </p>
      </div>
    </main>
  );
}
