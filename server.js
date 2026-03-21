import express from "express";
import cors from "cors";
import webpush from "web-push";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const VAPID_SUBJECT = "mailto:l5nhuy@outlook.com";
const VAPID_PUBLIC_KEY = "BJ9fCmUNkHinIHGZgnuKA-h-Da2AppEL_YOw1IcVEWx_FgtD563m1pnAQVKjXx2uOZgQX8xgdpuqGHX3Dp_nugQ";
const VAPID_PRIVATE_KEY = "TWIIZq7blAQtmwzSo1-4y5p1G5F57QzxX4SiO3tU_tg";
const ADMIN_PASSWORD = "jam13397714566";
const DB_URL = "postgresql://postgres:jam13397714566@db.svomalcpqiigxklmakrj.supabase.co:5432/postgres";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const pool = new Pool({ 
  connectionString: DB_URL, 
  ssl: { rejectUnauthorized: false },
  family: 4
});

// 初始化数据库表
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT,
      auth TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      first_seen TIMESTAMP DEFAULT NOW(),
      last_seen TIMESTAMP DEFAULT NOW(),
      api_url TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warnings (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      read BOOLEAN DEFAULT FALSE
    )
  `);
  console.log("DB ready");
}
initDB();

// 更新用户记录
async function upsertUser(userId, apiUrl) {
  await pool.query(`
    INSERT INTO users (user_id, api_url, first_seen, last_seen)
    VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET last_seen = NOW(), api_url = COALESCE($2, users.api_url)
  `, [userId, apiUrl || null]);
}

app.get("/", (req, res) => res.send("ok"));

app.get("/vapid-public-key", (req, res) => {
  res.type("text/plain").send(VAPID_PUBLIC_KEY);
});

// 订阅
app.post("/subscribe", async (req, res) => {
  try {
    const { sub, userId, apiUrl } = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: "bad subscription" });
    if (!userId) return res.status(400).json({ error: "no userId" });

    await pool.query(`
      INSERT INTO subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4
    `, [userId, sub.endpoint, sub.keys?.p256dh, sub.keys?.auth]);

    await upsertUser(userId, apiUrl);

    const total = await pool.query("SELECT COUNT(*) FROM subscriptions");
    res.json({ ok: true, userId, total: parseInt(total.rows[0].count) });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// 查询订阅（调试用）
app.get("/subscriptions", async (req, res) => {
  const { userId } = req.query;
  const result = userId
    ? await pool.query("SELECT * FROM subscriptions WHERE user_id = $1", [userId])
    : await pool.query("SELECT * FROM subscriptions");
  const total = await pool.query("SELECT COUNT(*) FROM subscriptions");
  res.json({
    ok: true,
    total: parseInt(total.rows[0].count),
    filtered: result.rows.length,
    subs: result.rows.map(s => ({
      userId: s.user_id,
      endpoint: s.endpoint.slice(0, 60) + "...",
      hasKeys: !!(s.p256dh && s.auth)
    }))
  });
});

// 测试推送
app.get("/send-test", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "请带上 ?userId=你的ID" });

  const result = await pool.query("SELECT * FROM subscriptions WHERE user_id = $1", [userId]);
  if (!result.rows.length) return res.status(400).json({ error: "该用户没有订阅" });

  const payload = JSON.stringify({ title: "测试推送", body: "推送成功！", url: "https://huios.pages.dev" });
  let success = 0;
  for (const row of result.rows) {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
      success++;
    } catch (e) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await pool.query("DELETE FROM subscriptions WHERE endpoint = $1", [row.endpoint]);
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

    const result = await pool.query("SELECT * FROM subscriptions WHERE user_id = $1", [userId]);
    if (!result.rows.length) return res.status(400).json({ error: "该用户没有订阅" });

    const payload = JSON.stringify({ title: title || "HuiOS", body: body || "", url: url || "https://huios.pages.dev" });
    let success = 0;
    for (const row of result.rows) {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
        success++;
      } catch (e) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await pool.query("DELETE FROM subscriptions WHERE endpoint = $1", [row.endpoint]);
        }
      }
    }
    res.json({ ok: true, sent: success, userId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ===== ADMIN =====

// 验证密码
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ ok: false });
});

// 用户列表
app.get("/admin/users", async (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });
  const result = await pool.query("SELECT * FROM users ORDER BY last_seen DESC");
  res.json({ ok: true, users: result.rows });
});

// 发警告
app.post("/admin/warn", async (req, res) => {
  const { password, userId, message } = req.body;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });
  await pool.query("INSERT INTO warnings (user_id, message) VALUES ($1, $2)", [userId, message]);
  res.json({ ok: true });
});

// 用户获取自己的警告
app.get("/warnings", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "no userId" });
  const result = await pool.query("SELECT * FROM warnings WHERE user_id = $1 AND read = FALSE ORDER BY created_at DESC", [userId]);
  await pool.query("UPDATE warnings SET read = TRUE WHERE user_id = $1", [userId]);
  res.json({ ok: true, warnings: result.rows });
});

// 提供admin页面
import { readFileSync } from "fs";
app.get("/admin", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(readFileSync("./admin.html", "utf8"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("server running on port", port));