// 复古拼贴手帐 · 真实实物贴纸素材（透明底 PNG，取自素材参考图，手工裁剪/撕扯质感）
import wordLoveUrl from "@/assets/decor/word-love.png";
import sheetMusicUrl from "@/assets/decor/sheet-music.png";
import paperGinghamGreenUrl from "@/assets/decor/paper-gingham-green.png";
import paperGinghamRedUrl from "@/assets/decor/paper-gingham-red.png";
import tapeKraftUrl from "@/assets/decor/tape-kraft.png";
import tapeBlueUrl from "@/assets/decor/tape-blue.png";
import sealBronzeUrl from "@/assets/decor/seal-bronze.png";
import sealGoldUrl from "@/assets/decor/seal-gold.png";
import sealBlueUrl from "@/assets/decor/seal-blue.png";
import envelopePinkUrl from "@/assets/decor/envelope-pink.png";
import bowGreenUrl from "@/assets/decor/bow-green.png";
import bowMauveUrl from "@/assets/decor/bow-mauve.png";
import bowBlueUrl from "@/assets/decor/bow-blue.png";
import moonUrl from "@/assets/decor/moon.png";
import cloudUrl from "@/assets/decor/cloud.png";
import sparkleUrl from "@/assets/decor/sparkle.png";
import sunUrl from "@/assets/decor/sun.png";
import signpostUrl from "@/assets/decor/signpost.png";
import catUrl from "@/assets/decor/cat.png";
import eyeUrl from "@/assets/decor/eye-photo.png";
import pressedFlowerUrl from "@/assets/decor/pressed-flower.png";
import butterflyUrl from "@/assets/decor/butterfly.png";
import wildflowerUrl from "@/assets/decor/wildflower.png";
import lollipopUrl from "@/assets/decor/lollipop.png";
import heartGlassUrl from "@/assets/decor/heart-glass.png";

// 角色：底层纸片 / 主体 / 火漆印 / 蝴蝶结 / 胶带 / 植物 / 小点缀
export type StickerRole = "base" | "subject" | "seal" | "bow" | "tape" | "plant" | "accent";
// 色调族：暖(黄棕红金) / 冷(蓝绿) / 粉 / 中性(黑白米牛皮)
export type StickerTone = "warm" | "cool" | "pink" | "neutral";
export type Sticker = {
  src: string;
  label: string;
  width: number;
  role: StickerRole;
  tone: StickerTone;
};

// 放入画布时的显示宽度（px），高度按图片比例自适应
export const STICKERS: Sticker[] = [
  // 纸片 · 剪字（可作底层）
  { src: wordLoveUrl, label: "Love 剪字", width: 150, role: "base", tone: "neutral" },
  { src: sheetMusicUrl, label: "乐谱残页", width: 120, role: "base", tone: "warm" },
  { src: paperGinghamGreenUrl, label: "绿格纸片", width: 175, role: "base", tone: "cool" },
  { src: paperGinghamRedUrl, label: "红格纸片", width: 175, role: "base", tone: "warm" },
  // 胶带
  { src: tapeKraftUrl, label: "牛皮胶带", width: 175, role: "tape", tone: "warm" },
  { src: tapeBlueUrl, label: "蓝色胶带", width: 175, role: "tape", tone: "cool" },
  // 火漆印 · 信封
  { src: sealBronzeUrl, label: "花卉火漆·古铜", width: 92, role: "seal", tone: "warm" },
  { src: sealGoldUrl, label: "枝叶火漆·烫金", width: 92, role: "seal", tone: "warm" },
  { src: sealBlueUrl, label: "花草火漆·浅蓝", width: 84, role: "seal", tone: "cool" },
  { src: envelopePinkUrl, label: "粉褐小信封", width: 150, role: "subject", tone: "pink" },
  // 蝴蝶结
  { src: bowGreenUrl, label: "格纹蝴蝶结", width: 130, role: "bow", tone: "cool" },
  { src: bowMauveUrl, label: "缎带结·藕紫", width: 130, role: "bow", tone: "pink" },
  { src: bowBlueUrl, label: "缎带结·雾蓝", width: 130, role: "bow", tone: "cool" },
  // 日月星辰
  { src: moonUrl, label: "月牙", width: 95, role: "subject", tone: "cool" },
  { src: cloudUrl, label: "水彩云", width: 155, role: "subject", tone: "cool" },
  { src: sparkleUrl, label: "蓝色星芒", width: 130, role: "accent", tone: "cool" },
  { src: sunUrl, label: "水彩太阳", width: 120, role: "subject", tone: "warm" },
  // 生活拼贴（主体）
  { src: signpostUrl, label: "复古路牌", width: 105, role: "subject", tone: "neutral" },
  { src: catUrl, label: "奶牛猫抱信", width: 120, role: "subject", tone: "neutral" },
  { src: eyeUrl, label: "复古眼睛拼贴", width: 150, role: "subject", tone: "neutral" },
  // 植物
  { src: pressedFlowerUrl, label: "压花干枝", width: 120, role: "plant", tone: "warm" },
  { src: butterflyUrl, label: "粉蝶贴纸", width: 150, role: "subject", tone: "pink" },
  { src: wildflowerUrl, label: "粉色野花", width: 105, role: "plant", tone: "warm" },
  // 甜点
  { src: lollipopUrl, label: "旋风棒棒糖", width: 95, role: "subject", tone: "pink" },
  { src: heartGlassUrl, label: "粉色玻璃心", width: 120, role: "accent", tone: "pink" },
];

export function MaterialPalette({
  title,
}: {
  // kept for backward-compat with existing callers
  defaultTheme?: string;
  title?: string;
}) {
  return (
    <div className="flex h-full flex-col" data-drop-trash="palette">
      {title && (
        <div
          className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-widest"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {title}
        </div>
      )}
      <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
        拖拽素材到画布 · 选中后可缩放 / 旋转 · 点右上角 ✕ 删除
      </p>

      <div className="flex flex-wrap content-start gap-3 overflow-y-auto pr-1">
        {STICKERS.map((s, i) => (
          <div
            key={i}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "copy";
              e.dataTransfer.setData(
                "application/x-collage",
                JSON.stringify({ kind: "image", src: s.src, width: s.width }),
              );
            }}
            className="group relative flex h-[120px] w-[calc(50%-6px)] cursor-grab flex-col items-center justify-center overflow-hidden rounded-lg border border-[#D4C5A9]/60 bg-[#F5F0E6] p-2 transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
            title={s.label}
          >
            <div className="pointer-events-none flex flex-1 items-center justify-center overflow-hidden">
              <img
                src={s.src}
                alt={s.label}
                draggable={false}
                className="max-h-[80px] w-auto max-w-[88%] object-contain drop-shadow-[0_2px_4px_rgba(74,59,42,0.25)]"
              />
            </div>
            <div className="mt-1 text-[10px] tracking-widest text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
