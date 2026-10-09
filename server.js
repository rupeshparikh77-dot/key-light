// KEYLIGHT server — serves the app and stores leaderboard scores + feedback.
// Storage is a single JSON file. Set DATA_DIR to a persistent disk to keep data
// across restarts (see the README). On Render's free tier without a disk, data
// resets whenever the service restarts or wakes from sleep.

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", 1);                 // so req.ip works behind Render's proxy
app.use(express.json({ limit: "16kb" }));

const DATA_DIR  = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const ADMIN_KEY = process.env.ADMIN_KEY || "";       // optional: read feedback via ?key=
const ADMIN_PIN = process.env.ADMIN_PIN || "160417"; // in-app admin PIN (override on Render)

function ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {} }

let store = { scores: {}, feedback: [] };
function load() {
  ensureDir();
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    store = { scores: d.scores || {}, feedback: d.feedback || [] };
  } catch (e) { store = { scores: {}, feedback: [] }; }
}
let saveTimer = null;
function save() {                          // debounced + atomic write
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null; ensureDir();
    const tmp = DATA_FILE + ".tmp";
    try { fs.writeFileSync(tmp, JSON.stringify(store)); fs.renameSync(tmp, DATA_FILE); }
    catch (e) { console.error("save failed:", e.message); }
  }, 300);
}
load();

function clean(s, max) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}

// light per-IP rate limit on writes: 40 posts / minute
const hits = new Map();
function limited(ip) {
  const now = Date.now(), w = hits.get(ip) || { n: 0, t: now };
  if (now - w.t > 60000) { w.n = 0; w.t = now; }
  w.n++; hits.set(ip, w);
  return w.n > 40;
}
app.use("/api", (req, res, next) => {
  if (req.method === "POST" && limited(req.ip)) return res.status(429).json({ error: "slow down" });
  next();
});

// ---- API ----
app.get("/api/leaderboard", (req, res) => {
  const song  = clean(req.query.song, 60) || "_";
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  res.json({ song, scores: (store.scores[song] || []).slice(0, limit) });
});

app.post("/api/score", (req, res) => {
  const song  = clean(req.body.song, 60);
  const name  = clean(req.body.name, 20) || "Anon";
  const score = Math.floor(Number(req.body.score));
  if (!song || !isFinite(score) || score < 0 || score > 1e7) return res.status(400).json({ error: "bad score" });
  const arr = store.scores[song] || (store.scores[song] = []);
  arr.push({ name, score, ts: Date.now() });
  arr.sort((a, b) => b.score - a.score);
  store.scores[song] = arr.slice(0, 100);            // keep top 100 per song
  save();
  res.json({ song, scores: store.scores[song].slice(0, 10) });
});

app.post("/api/feedback", (req, res) => {
  const message = clean(req.body.message, 1000);
  const name    = clean(req.body.name, 40);
  if (!message) return res.status(400).json({ error: "empty" });
  store.feedback.push({ name, message, ts: Date.now() });
  if (store.feedback.length > 1000) store.feedback = store.feedback.slice(-1000);
  save();
  res.json({ ok: true });
});

// Read feedback (owner only). Visit /api/feedback?key=YOUR_ADMIN_KEY
app.get("/api/feedback", (req, res) => {
  if (!ADMIN_KEY || req.query.key !== ADMIN_KEY) return res.status(403).json({ error: "forbidden" });
  res.json({ feedback: store.feedback.slice().reverse() });
});

// In-app admin, gated by a PIN (checked here, never shipped in the page).
function pinOk(req) { return ADMIN_PIN && clean(req.body && req.body.pin, 32) === ADMIN_PIN; }

app.post("/api/admin", (req, res) => {           // unlock -> return feedback
  if (!pinOk(req)) return res.status(403).json({ error: "forbidden" });
  res.json({ ok: true, feedback: store.feedback.slice().reverse() });
});

app.post("/api/admin/clear", (req, res) => {     // wipe all leaderboard scores
  if (!pinOk(req)) return res.status(403).json({ error: "forbidden" });
  let n = 0; for (const k in store.scores) n += (store.scores[k] || []).length;
  store.scores = {};
  save();
  res.json({ ok: true, cleared: n });
});

// ---- static app (only the public/ folder is served; data/ stays private) ----
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

function flushNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  ensureDir();
  const tmp = DATA_FILE + ".tmp";
  try { fs.writeFileSync(tmp, JSON.stringify(store)); fs.renameSync(tmp, DATA_FILE); }
  catch (e) { console.error("flush failed:", e.message); }
}
["SIGTERM", "SIGINT"].forEach(sig => process.on(sig, () => { flushNow(); process.exit(0); }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("KEYLIGHT listening on " + PORT));
