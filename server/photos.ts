/** 얼굴 카드 사진 저장소: DATA_DIR/photos/<id>.<ext> 파일 + 메모리 캐시 */
import fs from "node:fs";
import path from "node:path";
import { webcrypto as crypto } from "node:crypto";

type Photo = { mime: string; data: Buffer };
const photos = new Map<string, Photo>();
let dir = "";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_PHOTO_BYTES = 1_500_000;

export function initPhotos(dataDir: string) {
  dir = path.join(dataDir, "photos");
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const file of fs.readdirSync(dir)) {
      const m = /^([a-f0-9-]{36})\.(jpg|png|webp)$/.exec(file);
      if (!m) continue;
      const mime = Object.keys(EXT).find(k => EXT[k] === m[2])!;
      photos.set(m[1], { mime, data: fs.readFileSync(path.join(dir, file)) });
    }
  } catch (e) {
    console.error("[photos] 불러오기 실패:", (e as Error).message);
  }
}

export const photoExists = (id: string) => photos.has(id);
export const getPhoto = (id: string) => photos.get(id) ?? null;

/** data URL(이미지) → 저장 후 id. 잘못된 형식이면 null */
export function savePhotoDataUrl(dataUrl: unknown): string | null {
  if (typeof dataUrl !== "string") return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const data = Buffer.from(m[2], "base64");
  if (!data.length || data.length > MAX_PHOTO_BYTES) return null;
  // 파일 앞부분으로 실제 이미지인지 확인
  const sig = data.subarray(0, 12).toString("hex");
  const ok = (m[1] === "image/jpeg" && sig.startsWith("ffd8ff")) || (m[1] === "image/png" && sig.startsWith("89504e47")) || (m[1] === "image/webp" && data.subarray(8, 12).toString() === "WEBP");
  if (!ok) return null;
  const id = crypto.randomUUID();
  photos.set(id, { mime: m[1], data });
  if (dir) fs.writeFile(path.join(dir, `${id}.${EXT[m[1]]}`), data, err => { if (err) console.error("[photos] 저장 실패", err.message); });
  return id;
}

export function photoDataUrl(id: string): string | null {
  const p = photos.get(id);
  return p ? `data:${p.mime};base64,${p.data.toString("base64")}` : null;
}
