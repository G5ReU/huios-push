import express from "express";
import cors from "cors";
import webpush from "web-push";
import { readFileSync } from "fs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const VAPID_SUBJECT = "mailto:l5nhuy@outlook.com";
const VAPID_PUBLIC_KEY = "BJ9fCmUNkHinIHGZgnuKA-h-Da2AppEL_YOw1IcVEWx_FgtD563m1pnAQVKjXx2uOZgQX8xgdpuqGHX3Dp_nugQ";
const VAPID_PRIVATE_KEY = "TWIIZq7blAQtmwzSo1-4y5p1G5F57QzxX4SiO3tU_tg";
const ADMIN_PASSWORD = "jam13397714566";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// 内存存储
const subscriptions = new Map(); // endpoint -> { userId, p256dh, auth }
const users = new Map();         // userId -> { firstSeen, lastSeen, apiUrl }
const warnings = [];             // { id, userId, message, createdAt, read }
let warningIdCounter = 1;

function upsertUser(userId, apiUrl) {
  if (users.has(userId)) {
    const u = users.get(userId);
    u.lastSeen = new Date();
    if (apiUrl) u.apiUrl = apiUrl;
  } else {
    users.set(userId, { firstSeen: new Date(), lastSeen: new Date(), apiUrl: apiUrl || null });
  }
}

app.get("/", (req, res) => res.send("ok"));

app.get("/vapid-public-key", (req, res) => {
  res.type("text/plain").send(VAPID_PUBLIC_KEY);
});

// 订阅
app.post("/subscribe", (req, res) => {
  try {
    const { sub, userId, apiUrl } = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: "bad subscription" });
    if (!userId) return res.status(400).json({ error: "no userId" });

    subscriptions.set(sub.endpoint, {
      userId,
      p256dh: sub.keys?.p256dh,
      auth: sub.keys?.auth
    });

    upsertUser(userId, apiUrl);

    res.json({ ok: true, userId, total: subscriptions.size });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// 查询订阅（调试用）
app.get("/subscriptions", (req, res) => {
  const { userId } = req.query;
  const all = [...subscriptions.entries()].map(([endpoint, s]) => ({ endpoint, ...s }));
  const filtered = userId ? all.filter(s => s.userId === userId) : all;
  res.json({
    ok: true,
    total: subscriptions.size,
    filtered: filtered.length,
    subs: filtered.map(s => ({
      userId: s.userId,
      endpoint: s.endpoint.slice(0, 60) + "...",
      hasKeys: !!(s.p256dh && s.auth)
    }))
  });
});

// 测试推送
app.get("/send-test", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "请带上 ?userId=你的ID" });

  const userSubs = [...subscriptions.entries()].filter(([, s]) => s.userId === userId);
  if (!userSubs.length) return res.status(400).json({ error: "该用户没有订阅" });

  const payload = JSON.stringify({ title: "测试推送", body: "推送成功！", url: "https://huios.pages.dev" });
  let success = 0;
  for (const [endpoint, s] of userSubs) {
    try {
      await webpush.sendNotification({ endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      success++;
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        subscriptions.delete(endpoint);
      }
    }
  }
  res.json({ ok: true, sent: success, userId });
});

// 正式推送
app.post("/send-push", async (req, res) => {
  try {
    const { title, body, url, userId } = req.body;
    if (!userId) return res.status(400).json({ error: "no userId" });

    const userSubs = [...subscriptions.entries()].filter(([, s]) => s.userId === userId);
    if (!userSubs.length) return res.status(400).json({ error: "该用户没有订阅" });

    const payload = JSON.stringify({ title: title || "HuiOS", body: body || "", url: url || "https://huios.pages.dev" });
    let success = 0;
    for (const [endpoint, s] of userSubs) {
      try {
        await webpush.sendNotification({ endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        success++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          subscriptions.delete(endpoint);
        }
      }
    }
    res.json({ ok: true, sent: success, userId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ===== ADMIN =====

app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

app.get("/admin/users", (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });
  const result = [...users.entries()].map(([userId, u]) => ({
    user_id: userId,
    first_seen: u.firstSeen,
    last_seen: u.lastSeen,
    api_url: u.apiUrl
  })).sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen));
  res.json({ ok: true, users: result });
});

app.post("/admin/warn", (req, res) => {
  const { password, userId, message } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });
  warnings.push({ id: warningIdCounter++, userId, message, createdAt: new Date(), read: false });
  res.json({ ok: true });
});

app.get("/warnings", (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "no userId" });
  const unread = warnings.filter(w => w.userId === userId && !w.read);
  unread.forEach(w => { w.read = true; });
  res.json({ ok: true, warnings: unread });
});

app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(readFileSync("./admin.html", "utf8"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("server running on port", port));