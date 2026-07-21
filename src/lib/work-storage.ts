import { nanoid } from "nanoid";
import type { CanvasElement } from "@/components/collage/Canvas";

export type Relation = "lover" | "friend" | "family" | "self" | "other";
export type Template = "birthday" | "anniversary" | "confession" | "thanks" | "missing" | "free";

export type Preset = {
  recipient: string;
  sender: string;        // 署名（你的名字）
  relation: Relation;
  template: Template;
  style: string[];      // 诗歌风格
  scenes: string[];
  images: string[];
  moods: string[];
};

export type CardStyle = "scrapbook" | "letter" | "botanical" | "midnight";

export type Work = {
  id: string;
  preset: Preset;
  elements: CanvasElement[];
  signature: string;
  posterUrl?: string;   // dataURL PNG snapshot
  cardStyle?: CardStyle; // 动态贺卡样式
  createdAt: number;
};

const PRESET_KEY = "collage-preset";
const workKey = (id: string) => `collage-work-${id}`;

export function savePreset(p: Preset) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PRESET_KEY, JSON.stringify(p));
}
export function loadPreset(): Preset | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(PRESET_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as Preset; } catch { return null; }
}

export function saveWork(w: Omit<Work, "id" | "createdAt"> & { id?: string }): Work {
  const id = w.id ?? nanoid(8);
  const work: Work = { ...w, id, createdAt: Date.now() };
  localStorage.setItem(workKey(id), JSON.stringify(work));
  return work;
}
export function loadWork(id: string): Work | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(workKey(id));
  if (!raw) return null;
  try { return JSON.parse(raw) as Work; } catch { return null; }
}

/** 局部更新已保存的作品（保留 createdAt 等原字段）。 */
export function updateWork(id: string, patch: Partial<Omit<Work, "id">>): Work | null {
  if (typeof window === "undefined") return null;
  const cur = loadWork(id);
  if (!cur) return null;
  const next: Work = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt };
  localStorage.setItem(workKey(id), JSON.stringify(next));
  return next;
}

export const TEMPLATE_LABEL: Record<Template, string> = {
  birthday: "生日快乐",
  anniversary: "纪念日",
  confession: "告白",
  thanks: "感谢",
  missing: "想念",
  free: "自由",
};

export const RELATION_LABEL: Record<Relation, string> = {
  lover: "恋人",
  friend: "朋友",
  family: "家人",
  self: "自己",
  other: "TA",
};
