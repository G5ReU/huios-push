import express from "express";
import cors from "cors";
import webpush from "web-push";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const VAPID_SUBJECT = "mailto:l5nhuy@outlook.com";
const VAPID_PUBLIC_KEY = "BJ9fCmUNkHinIHGZgnuKA-h-Da2AppEL_YOw1IcVEWx_FgtD563m1pnAQVKjXx2uOZgQX8xgdpuqGHX3Dp_nugQ";
const VAPID_PRIVATE_KEY = "TWIIZq7blAQtmwzSo1-4y5p1G5F57QzxX4SiO3tU_tg";

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

let lastSub = null;

app.get("/", (req, res) => {
  res.send("ok");
});

app.get("/vapid-public-key", (req, res) => {
  res.type("text/plain").send(VAPID_PUBLIC_KEY);
});

app.get("/subscribe", (req, res) => {
  try {
    const subText = req.query.sub;
    if (!subText) {
      return res.status(400).json({ error: "no sub" });
    }

    const sub = JSON.parse(subText);
    lastSub = sub;

    res.json({ ok: true, saved: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/subscribe", (req, res) => {
  try {
    const sub = req.body;
    if (!sub || !sub.endpoint) {
      return res.status(400).json({ error: "bad subscription" });
    }

    lastSub = sub;
    res.json({ ok: true, saved: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.get("/last-sub", (req, res) => {
  res.json(lastSub || { empty: true });
});

app.get("/send-test", async (req, res) => {
  try {
    if (!lastSub) {
      return res.status(400).json({ error: "no subscription saved" });
    }

    const payload = JSON.stringify({
      title: "测试推送",
      body: "你已经成功收到来自 HuiOS 的推送！",
      url: "https://huios.pages.dev"
    });

    await webpush.sendNotification(lastSub, payload);

    res.json({ ok: true, sent: true });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
      stack: e?.stack || ""
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("server running on port", port);
});