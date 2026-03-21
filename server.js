import express from "express";
import cors from "cors";
import webpush from "web-push";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const VAPID_SUBJECT = "mailto:l5nhuy@outlook.com";
const VAPID_PUBLIC_KEY = "BJ9fCmUNkHinIHGZgnuKA-h-Da2AppEL_YOw1IcVEWx_FgtD563m1pnAQVKjXx2uOZgQX8xgdpuqGHX3Dp_nugQ";
const VAPID_PRIVATE_KEY = "TWIIZq7blAQtmwzSo1-4y5p1G5F57QzxX4SiO3tU_tg";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const SUBS_FILE = "./subscriptions.json";

function loadSubs() {
  try {
    if (!fs.existsSync(SUBS_FILE)) return [];
    const txt = fs.readFileSync(SUBS_FILE, "utf8");
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveSubs(arr) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(arr, null, 2), "utf8");
}

// 清空旧的无userId订阅
let subscriptions = loadSubs().filter(s => s.userId);
saveSubs(subscriptions);

app.get("/", (req, res) => res.send("ok"));

app.get("/vapid-public-key", (req, res) => {
  res.type("text/plain").send(VAPID_PUBLIC_KEY);
});

// 订阅（必须带userId）
app.post("/subscribe", (req, res) => {
  try {
    const { sub, userId } = req.body;
    if (!sub || !sub.endpoint) return res.status(400).json({ error: "bad subscription" });
    if (!userId) return res.status(400).json({ error: "no userId" });

    // 移除同一设备的旧订阅
    subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
    subscriptions.push({ ...sub, userId });
    saveSubs(subscriptions);

    res.json({ ok: true, userId, total: subscriptions.length });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// 调试：查看订阅情况
app.get("/subscriptions", (req, res) => {
  const { userId } = req.query;
  const list = userId
    ? subscriptions.filter(s => s.userId === userId)
    : subscriptions;

  res.json({
    ok: true,
    total: subscriptions.length,
    filtered: list.length,
    userId: userId || "（未过滤）",
    subs: list.map(s => ({
      userId: s.userId,
      endpoint: s.endpoint.slice(0, 60) + "...",
      hasKeys: !!(s.keys && s.keys.p256dh && s.keys.auth)
    }))
  });
});

// 测试推送（只推给指定userId）
app.get("/send-test", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "请带上 ?userId=你的ID" });

  const targets = subscriptions.filter(s => s.userId === userId);
  if (!targets.length) return res.status(400).json({ error: "该用户没有订阅" });

  const payload = JSON.stringify({
    title: "测试推送",
    body: "这是一份手动推送，您已成功！",
    url: "https://huios.pages.dev"
  });

  let success = 0;
  const alive = [];
  for (const sub of subscriptions) {
    try {
      if (sub.userId === userId) {
        await webpush.sendNotification(sub, payload);
        success++;
      }
      alive.push(sub);
    } catch (e) {
      const code = e?.statusCode;
      if (code !== 404 && code !== 410) alive.push(sub);
    }
  }
  subscriptions = alive;
  saveSubs(subscriptions);

  res.json({ ok: true, sent: success, userId });
});

// 正式推送（只推给指定userId）
app.post("/send-push", async (req, res) => {
  try {
    const { title, body, url, userId } = req.body;
    if (!userId) return res.status(400).json({ error: "no userId" });

    const targets = subscriptions.filter(s => s.userId === userId);
    if (!targets.length) return res.status(400).json({ error: "该用户没有订阅" });

    const payload = JSON.stringify({
      title: title || "HuiOS",
      body: body || "",
      url: url || "https://huios.pages.dev"
    });

    let success = 0;
    const alive = [];
    for (const sub of subscriptions) {
      try {
        if (sub.userId === userId) {
          await webpush.sendNotification(sub, payload);
          success++;
        }
        alive.push(sub);
      } catch (e) {
        const code = e?.statusCode;
        if (code !== 404 && code !== 410) alive.push(sub);
      }
    }
    subscriptions = alive;
    saveSubs(subscriptions);

    res.json({ ok: true, sent: success, total: targets.length, userId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("server running on port", port));