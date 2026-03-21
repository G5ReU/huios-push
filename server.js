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

webpush.setVapidDetails(
  VAPID_SUBJECT,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const SUBS_FILE = "./subscriptions.json";

function loadSubs() {
  try {
    if (!fs.existsSync(SUBS_FILE)) return [];
    const txt = fs.readFileSync(SUBS_FILE, "utf8");
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    return [];
  }
}

function saveSubs(arr) {
  fs.writeFileSync(SUBS_FILE, JSON.stringify(arr, null, 2), "utf8");
}

function sameSub(a, b) {
  return a && b && a.endpoint === b.endpoint;
}

let subscriptions = loadSubs();

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
    if (!sub.endpoint) {
      return res.status(400).json({ error: "bad subscription" });
    }

    const exists = subscriptions.some(s => sameSub(s, sub));
    if (!exists) {
      subscriptions.push(sub);
      saveSubs(subscriptions);
    }

    res.json({ ok: true, saved: true, total: subscriptions.length });
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

    const exists = subscriptions.some(s => sameSub(s, sub));
    if (!exists) {
      subscriptions.push(sub);
      saveSubs(subscriptions);
    }

    res.json({ ok: true, saved: true, total: subscriptions.length });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.get("/last-sub", (req, res) => {
  const last = subscriptions.length ? subscriptions[subscriptions.length - 1] : null;
  res.json(last || { empty: true });
});

app.get("/subscriptions", (req, res) => {
  res.json({
    ok: true,
    total: subscriptions.length,
    endpoints: subscriptions.map(s => s.endpoint)
  });
});

app.get("/send-test", async (req, res) => {
  try {
    if (!subscriptions.length) {
      return res.status(400).json({ error: "no subscription saved" });
    }

    const payload = JSON.stringify({
      title: "测试推送",
      body: "这是一份手动推送～您已成功！",
      url: "https://huios.pages.dev"
    });

    let success = 0;
    const alive = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        success++;
        alive.push(sub);
      } catch (e) {
        const code = e?.statusCode;
        if (code !== 404 && code !== 410) {
          alive.push(sub);
        }
      }
    }

    subscriptions = alive;
    saveSubs(subscriptions);

    res.json({ ok: true, sent: success, total: subscriptions.length });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: String(e),
      stack: e?.stack || ""
    });
  }
});

app.post("/send-push", async (req, res) => {
  try {
    if (!subscriptions.length) {
      return res.status(400).json({ error: "no subscription saved" });
    }

    const title = req.body?.title || "HuiOS";
    const body = req.body?.body || "";
    const url = req.body?.url || "https://huios.pages.dev";

    const payload = JSON.stringify({ title, body, url });

    let success = 0;
    const alive = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        success++;
        alive.push(sub);
      } catch (e) {
        const code = e?.statusCode;
        if (code !== 404 && code !== 410) {
          alive.push(sub);
        }
      }
    }

    subscriptions = alive;
    saveSubs(subscriptions);

    res.json({
      ok: true,
      sent: success,
      total: subscriptions.length,
      title,
      body,
      url
    });
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