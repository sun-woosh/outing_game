/**
 * ALL IN MACAU 서버 (Render/Docker 등 어디서나 실행되는 일반 Node.js 서버)
 *
 * 기존 ChatGPT Sites 버전이 먹통이 된 원인과 해결:
 *  - 모든 폰이 1.5초마다 서버에 상태를 물어봄(폴링) → 서버가 바뀐 것만 밀어줌(WebSocket)
 *  - 모든 동작이 DB의 한 행을 서로 덮어쓰며 최대 64번 재시도 → 서버 메모리에서 순서대로 처리
 *  - ChatGPT 로그인 필수 → 로그인 없이 공개 링크로 접속
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import compression from "compression";
import { Server, type Socket } from "socket.io";
import { GET, POST, tick, setChangeListener, exportStore, importStore, store, hostTokenForPassword, activeRoomData, type ApiResult } from "./game";
import { initPhotos, getPhoto, savePhotoDataUrl, photoDataUrl } from "./photos";

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const CLIENT_DIR = process.env.CLIENT_DIR || path.join(__dirname, "client");
const BROADCAST_MIN_INTERVAL_MS = 200;

if (!process.env.GAME_HOST_PASSWORD && !process.env.HOST_PIN) {
  console.warn("[경고] 운영자 비밀번호(GAME_HOST_PASSWORD 또는 HOST_PIN)가 설정되지 않았습니다. 운영자 로그인이 불가능합니다.");
}

initPhotos(DATA_DIR);

// ------------------------------------------------------------------ 상태 저장/복구
try {
  if (fs.existsSync(STATE_FILE)) {
    importStore(fs.readFileSync(STATE_FILE, "utf8"));
    console.log(`[state] 복구됨: 진행 중인 방 ${store.activeRoom ?? "없음"}`);
  }
} catch (e) {
  console.error("[state] 복구 실패, 새로 시작합니다:", (e as Error).message);
}
let saveTimer: NodeJS.Timeout | null = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = STATE_FILE + ".tmp";
    fs.mkdir(DATA_DIR, { recursive: true }, () => {
      fs.writeFile(tmp, exportStore(), err => {
        if (err) return console.error("[state] 저장 실패", err.message);
        fs.rename(tmp, STATE_FILE, () => {});
      });
    });
  }, 1000);
}
function saveNow() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STATE_FILE, exportStore()); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ 운영자 비밀번호 무차별 대입 방지
const loginFails = new Map<string, { count: number; since: number; lockedUntil: number }>();
async function guardedPost(body: unknown, who: string): Promise<ApiResult> {
  const isLogin = !!body && typeof body === "object" && (body as Record<string, unknown>).action === "host_login";
  if (!isLogin) return POST(body);
  const now = Date.now();
  let f = loginFails.get(who);
  if (f && f.lockedUntil > now) return { status: 429, body: { error: "비밀번호를 여러 번 틀렸습니다. 1분 후 다시 시도해 주세요." } };
  const r = await POST(body);
  if (r.status === 403) {
    if (!f || now - f.since > 60_000) f = { count: 0, since: now, lockedUntil: 0 };
    f.count += 1;
    if (f.count >= 5) f.lockedUntil = now + 60_000;
    loginFails.set(who, f);
  } else if (r.status < 400) loginFails.delete(who);
  return r;
}

// ------------------------------------------------------------------ HTTP
const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(compression()); // 화면 파일 약 430KB → 약 130KB
app.use("/api/game", express.json({ limit: "64kb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, room: store.activeRoom, sockets: io.engine.clientsCount });
});

// 기존 API 형식도 그대로 지원 (부하 테스트, 비상시 사용)
app.get("/api/game", async (req, res) => {
  const r = await GET({
    active: req.query.active === "1",
    room: typeof req.query.room === "string" ? req.query.room : null,
    teamToken: req.get("x-team-token") ?? (typeof req.query.teamToken === "string" ? req.query.teamToken : null),
    hostToken: req.get("x-host-token") ?? null,
  });
  res.status(r.status).set("Cache-Control", "no-store").json(r.body);
});
app.post("/api/game", async (req, res) => {
  const r = await guardedPost(req.body, req.ip || "?");
  res.status(r.status).set("Cache-Control", "no-store").json(r.body);
});

// ------------------------------------------------------------------ 얼굴 카드 사진
// 사진 주소는 추측할 수 없는 id이고, 참가자 화면에는 카드가 뒤집힐 때만 주소가 전달됩니다.
app.get("/photos/:id", (req, res) => {
  const p = getPhoto(req.params.id);
  if (!p) return res.status(404).end();
  res.set("Content-Type", p.mime).set("Cache-Control", "private, max-age=86400").send(p.data);
});
const isHostReq = async (req: express.Request) => {
  const t = req.get("x-host-token");
  return !!t && t === await hostTokenForPassword().catch(() => "");
};
const bigJson = express.json({ limit: "40mb" });
// 사진 한 장 업로드 → { id }
app.post("/api/face/photo", bigJson, async (req, res) => {
  if (!(await isHostReq(req))) return res.status(403).json({ error: "운영자 권한을 확인할 수 없습니다." });
  const id = savePhotoDataUrl(req.body?.data);
  if (!id) return res.status(400).json({ error: "JPG/PNG/WEBP 이미지(1.5MB 이하)만 올릴 수 있습니다." });
  res.json({ id });
});
// 인물+사진 전체를 파일로 내려받기 (재배포로 사진이 지워졌을 때 다시 불러오기용)
app.get("/api/face/export", async (req, res) => {
  if (!(await isHostReq(req))) return res.status(403).json({ error: "운영자 권한을 확인할 수 없습니다." });
  const room = activeRoomData();
  const people = (room?.settings.facePeople || []).map(p => ({ name: p.name, aliases: p.aliases, board: p.board ?? 1, photo: p.photo ? photoDataUrl(p.photo) : null }));
  res.set("Content-Disposition", 'attachment; filename="face-cards.json"').json({ type: "all-in-macau-face-cards", version: 1, people });
});
// 파일에서 불러오기 (대기실에서만)
app.post("/api/face/import", bigJson, async (req, res) => {
  const hostToken = req.get("x-host-token") || "";
  if (!(await isHostReq(req))) return res.status(403).json({ error: "운영자 권한을 확인할 수 없습니다." });
  const list = req.body?.people;
  if (!Array.isArray(list) || list.length > 40) return res.status(400).json({ error: "얼굴 카드 파일 형식이 아닙니다." });
  const people = list.map((p: Record<string, unknown>) => ({ name: typeof p.name === "string" ? p.name : "", aliases: Array.isArray(p.aliases) ? p.aliases : [], board: p.board, photo: p.photo ? savePhotoDataUrl(p.photo) : null }));
  const r = await POST({ action: "face_set_people", hostToken, facePeople: people });
  res.status(r.status).json(r.body);
});

// 화면 (React 빌드 결과)
app.use("/assets", express.static(path.join(CLIENT_DIR, "assets"), { maxAge: "30d", immutable: true }));
app.use(express.static(CLIENT_DIR, { index: false, maxAge: "5m" }));
app.get(["/", "/host", "/host/", "/beam", "/beam/"], (_req, res) => {
  res.set("Cache-Control", "no-cache").sendFile(path.join(CLIENT_DIR, "index.html"));
});

const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
const io = new Server(server, {
  pingInterval: 20_000,
  pingTimeout: 25_000,
  maxHttpBufferSize: 200_000, // 운영자 문항 설정 저장 대비
  perMessageDeflate: false,
});

// ------------------------------------------------------------------ 실시간 전송
type Creds = { teamToken: string; hostToken: string | null };
const credsOf = (s: Socket): Creds | null => (s.data.creds as Creds | undefined) ?? null;
const keyOf = (c: Creds) => `${c.hostToken === null ? "" : "H:" + c.hostToken}|${c.teamToken}`;

async function stateFor(c: Creds): Promise<ApiResult> {
  return GET({ active: true, teamToken: c.teamToken, hostToken: c.hostToken });
}

let dirty = false;
let lastBroadcast = 0;
let flushing = false;
async function flush() {
  if (!dirty || flushing || Date.now() - lastBroadcast < BROADCAST_MIN_INTERVAL_MS) return;
  dirty = false;
  flushing = true;
  lastBroadcast = Date.now();
  try {
    // 같은 자격(같은 테이블/운영자/빔)끼리 묶어 한 번만 계산
    const groups = new Map<string, { creds: Creds; sockets: Socket[] }>();
    for (const s of io.sockets.sockets.values()) {
      const c = credsOf(s);
      if (!c) continue;
      const k = keyOf(c);
      const g = groups.get(k);
      if (g) g.sockets.push(s); else groups.set(k, { creds: c, sockets: [s] });
    }
    for (const g of groups.values()) {
      const r = await stateFor(g.creds);
      for (const s of g.sockets) s.emit("state", r);
    }
  } finally {
    flushing = false;
  }
}
setInterval(() => void flush(), 50);
setChangeListener(() => { dirty = true; scheduleSave(); });
setInterval(() => { tick(); }, 250);

io.on("connection", socket => {
  // 소켓별 속도 제한 (초당 20회)
  let bucket = 20;
  const refill = setInterval(() => (bucket = 20), 1000);
  socket.use((_packet, next) => (bucket-- > 0 ? next() : next(new Error("rate"))));
  socket.on("error", () => {});
  socket.on("disconnect", () => clearInterval(refill));

  // 화면이 자기 자격(테이블 토큰/운영자 토큰)을 알려 주면 즉시 현재 상태를 보냄
  socket.on("hello", async (msg: unknown, ack?: (r: ApiResult) => void) => {
    const m = (msg && typeof msg === "object" ? msg : {}) as Record<string, unknown>;
    const creds: Creds = {
      teamToken: typeof m.teamToken === "string" ? m.teamToken.slice(0, 128) : "",
      hostToken: typeof m.hostToken === "string" ? m.hostToken.slice(0, 128) : null,
    };
    socket.data.creds = creds;
    const r = await stateFor(creds);
    if (typeof ack === "function") ack(r);
    else socket.emit("state", r);
  });

  socket.on("api", async (body: unknown, ack?: (r: ApiResult) => void) => {
    // Render 등 프록시 뒤에서는 실제 접속자 IP가 x-forwarded-for에 있습니다.
    const fwd = String(socket.handshake.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const r = await guardedPost(body, fwd || socket.handshake.address || socket.id);
    if (typeof ack === "function") ack(r);
  });
});

server.listen(PORT, () => {
  console.log(`ALL IN MACAU 서버 실행: http://localhost:${PORT}  (참가자 /  · 빔 /beam  · 운영자 /host)`);
});
for (const sig of ["SIGTERM", "SIGINT"] as const) process.on(sig, () => { saveNow(); process.exit(0); });
