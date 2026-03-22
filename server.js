import express from "express";
import cors from "cors";
import webpush from "web-push";
import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.set("trust proxy", true);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ===== Push 基础配置 =====
const VAPID_SUBJECT = "mailto:l5nhuy@outlook.com";
const VAPID_PUBLIC_KEY = "BJ9fCmUNkHinIHGZgnuKA-h-Da2AppEL_YOw1IcVEWx_FgtD563m1pnAQVKjXx2uOZgQX8xgdpuqGHX3Dp_nugQ";
const VAPID_PRIVATE_KEY = "TWIIZq7blAQtmwzSo1-4y5p1G5F57QzxX4SiO3tU_tg";
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ===== 文件 =====
const SUBS_FILE = "./subscriptions.json";
const USERS_FILE = "./users.json";
const APPEALS_FILE = "./appeals.json";
const AUDIT_FILE = "./audit.json";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";

// ===== 工具 =====
function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const txt = fs.readFileSync(file, "utf8");
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
function now() {
  return Date.now();
}
function getRawIp(req) {
  const xff = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || "";
}
function maskIp(ip) {
  if (!ip) return "";
  if (ip.includes(":")) {
    const p = ip.split(":");
    return (p.slice(0, 3).join(":") || ip) + ":*:*:*:*";
  }
  const p = ip.split(".");
  if (p.length === 4) return `${p[0]}.${p[1]}.*.*`;
  return ip;
}
function ipHash(ip) {
  return crypto.createHash("sha256").update(ip || "").digest("hex").slice(0, 24);
}
function ok(res, data = {}) {
  res.json({ ok: true, ...data });
}
function fail(res, code, msg) {
  res.status(code).json({ ok: false, error: msg });
}
function adminAuth(req) {
  const p = req.body?.password || req.query?.password;
  return p && p === ADMIN_PASSWORD;
}
function isUserBanned(user) {
  if (!user || !user.ban || !user.ban.active) return false;
  const until = user.ban.until || 0; // 0 = 永久
  if (until && now() > until) {
    user.ban.active = false;
    return false;
  }
  return true;
}

// ===== 数据载入 =====
let subscriptions = loadJson(SUBS_FILE, []);
let users = loadJson(USERS_FILE, {});      // { userId: {...} }
let appeals = loadJson(APPEALS_FILE, []);  // [{id,userId,text,status,...}]
let audit = loadJson(AUDIT_FILE, []);      // 审计日志

// 兼容旧订阅：清掉无userId
subscriptions = subscriptions.filter(s => s.userId);
saveJson(SUBS_FILE, subscriptions);

// ===== 通用 =====
app.get("/", (req, res) => res.send("ok"));
app.get("/vapid-public-key", (req, res) => {
  res.type("text/plain").send(VAPID_PUBLIC_KEY);
});

// ===== 客户端状态接口（前端进站先查） =====
app.get("/client/status", (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) return fail(res, 400, "no userId");

  if (!users[userId]) {
    users[userId] = {
      userId,
      firstSeen: now(),
      lastSeen: now(),
      ipMasked: maskIp(getRawIp(req)),
      ipHash: ipHash(getRawIp(req)),
      apiUrl: "",
      ban: { active: false, reason: "", until: 0 },
      last10AiMsgs: []
    };
    saveJson(USERS_FILE, users);
  } else {
    users[userId].lastSeen = now();
    users[userId].ipMasked = maskIp(getRawIp(req));
    users[userId].ipHash = ipHash(getRawIp(req));
    saveJson(USERS_FILE, users);
  }

  const u = users[userId];
  const banned = isUserBanned(u);
  saveJson(USERS_FILE, users);

  return ok(res, {
    userId,
    banned,
    reason: banned ? (u.ban.reason || "违反使用规范") : "",
    until: banned ? (u.ban.until || 0) : 0
  });
});

// ===== 申诉入口 =====
app.post("/client/appeal", (req, res) => {
  const { userId, text, contact } = req.body || {};
  if (!userId) return fail(res, 400, "no userId");
  if (!text || String(text).trim().length < 5) return fail(res, 400, "申诉内容太短");

  const id = "ap_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  appeals.unshift({
    id,
    userId: String(userId),
    text: String(text).trim().slice(0, 2000),
    contact: String(contact || "").slice(0, 200),
    status: "pending", // pending/approved/rejected
    createdAt: now(),
    handledAt: 0,
    handledBy: "",
    handleNote: "",
    ipMasked: maskIp(getRawIp(req)),
    ipHash: ipHash(getRawIp(req))
  });

  saveJson(APPEALS_FILE, appeals);
  return ok(res, { id });
});

// ===== 订阅 =====
app.post("/subscribe", (req, res) => {
  try {
    const { sub, userId } = req.body;
    if (!sub || !sub.endpoint) return fail(res, 400, "bad subscription");
    if (!userId) return fail(res, 400, "no userId");

    const uid = String(userId);

    // 更新用户基础档案
    if (!users[uid]) {
      users[uid] = {
        userId: uid,
        firstSeen: now(),
        lastSeen: now(),
        ipMasked: maskIp(getRawIp(req)),
        ipHash: ipHash(getRawIp(req)),
        apiUrl: "",
        ban: { active: false, reason: "", until: 0 },
        last10AiMsgs: []
      };
    } else {
      users[uid].lastSeen = now();
      users[uid].ipMasked = maskIp(getRawIp(req));
      users[uid].ipHash = ipHash(getRawIp(req));
    }
    saveJson(USERS_FILE, users);

    // 同设备去重
    subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
    subscriptions.push({ ...sub, userId: uid });
    saveJson(SUBS_FILE, subscriptions);

    ok(res, { userId: uid, total: subscriptions.length });
  } catch (e) {
    fail(res, 400, String(e));
  }
});

// ===== 调试订阅 =====
app.get("/subscriptions", (req, res) => {
  const { userId } = req.query;
  const list = userId ? subscriptions.filter(s => s.userId === userId) : subscriptions;

  ok(res, {
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

// ===== 统一发推送工具 =====
async function pushToUser(userId, payloadObj) {
  const targets = subscriptions.filter(s => s.userId === userId);
  if (!targets.length) return { sent: 0, total: 0 };

  const payload = JSON.stringify(payloadObj);
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
  saveJson(SUBS_FILE, subscriptions);
  return { sent: success, total: targets.length };
}

// ===== 测试推送 =====
app.get("/send-test", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return fail(res, 400, "请带上 ?userId=你的ID");

  const r = await pushToUser(String(userId), {
    title: "测试推送",
    body: "这是一份手动推送，您已成功！",
    url: "https://huios.pages.dev",
    tag: "huios-test"
  });

  ok(res, { userId, ...r });
});

// ===== 正式推送 =====
app.post("/send-push", async (req, res) => {
  try {
    const { title, body, url, userId, tag, icon } = req.body || {};
    if (!userId) return fail(res, 400, "no userId");

    const r = await pushToUser(String(userId), {
      title: title || "HuiOS",
      body: body || "",
      url: url || "https://huios.pages.dev",
      tag: tag || "huios-push",
      icon: icon || ""
    });

    ok(res, { userId, ...r });
  } catch (e) {
    fail(res, 500, String(e));
  }
});

// ===== Admin =====
app.post("/admin/login", (req, res) => {
  if (!adminAuth(req)) return fail(res, 401, "密码错误");
  ok(res);
});

// 用户列表（带搜索）
app.get("/admin/users", (req, res) => {
  if (!adminAuth(req)) return fail(res, 401, "unauthorized");

  const q = String(req.query.q || "").trim().toLowerCase();
  let list = Object.values(users);

  if (q) {
    list = list.filter(u =>
      String(u.userId || "").toLowerCase().includes(q) ||
      String(u.ipMasked || "").toLowerCase().includes(q) ||
      String(u.apiUrl || "").toLowerCase().includes(q)
    );
  }

  list.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

  ok(res, {
    users: list.map(u => ({
      user_id: u.userId,
      first_seen: u.firstSeen || 0,
      last_seen: u.lastSeen || 0,
      api_url: u.apiUrl || "",
      ip_masked: u.ipMasked || "",
      banned: !!isUserBanned(u),
      ban_reason: u.ban?.reason || "",
      ban_until: u.ban?.until || 0,
      last10_ai_msgs: (u.last10AiMsgs || []).slice(-10)
    }))
  });
});

// 管理员发提醒/警告/封禁通知
app.post("/admin/warn", async (req, res) => {
  if (!adminAuth(req)) return fail(res, 401, "unauthorized");
  const { userId, message, level } = req.body || {};
  if (!userId || !message) return fail(res, 400, "bad params");

  const lv = level || "warn"; // remind/warn/ban
  const colorTag = lv === "remind" ? "gold" : lv === "ban" ? "black" : "red";

  const r = await pushToUser(String(userId), {
    title: lv === "remind" ? "提醒通知" : lv === "ban" ? "封禁通知" : "警告通知",
    body: String(message).slice(0, 200),
    url: "https://huios.pages.dev",
    tag: "admin-" + colorTag
  });

  audit.unshift({
    t: now(),
    action: "admin_notify",
    userId: String(userId),
    level: lv,
    message: String(message).slice(0, 500)
  });
  saveJson(AUDIT_FILE, audit);

  ok(res, r);
});

// 拉黑
app.post("/admin/ban", (req, res) => {
  if (!adminAuth(req)) return fail(res, 401, "unauthorized");
  const { userId, reason, days } = req.body || {};
  if (!userId) return fail(res, 400, "no userId");

  if (!users[userId]) {
    users[userId] = {
      userId,
      firstSeen: now(),
      lastSeen: now(),
      ipMasked: "",
      ipHash: "",
      apiUrl: "",
      ban: { active: false, reason: "", until: 0 },
      last10AiMsgs: []
    };
  }

  const d = Number(days || 0);
  const until = d > 0 ? now() + d * 24 * 60 * 60 * 1000 : 0;

  users[userId].ban = {
    active: true,
    reason: String(reason || "违反使用规范").slice(0, 200),
    until
  };
  saveJson(USERS_FILE, users);

  audit.unshift({
    t: now(),
    action: "ban",
    userId: String(userId),
    reason: users[userId].ban.reason,
    until
  });
  saveJson(AUDIT_FILE, audit);

  ok(res, { userId, banned: true, until });
});

// 解封
app.post("/admin/unban", (req, res) => {
  if (!adminAuth(req)) return fail(res, 401, "unauthorized");
  const { userId, note } = req.body || {};
  if (!userId || !users[userId]) return fail(res, 400, "bad user");

  users[userId].ban = { active: false, reason: "", until: 0 };
  saveJson(USERS_FILE, users);

  audit.unshift({
    t: now(),
    action: "unban",
    userId: String(userId),
    note: String(note || "").slice(0, 200)
  });
  saveJson(AUDIT_FILE, audit);

  ok(res, { userId, banned: false });
});

// 申诉列表
app.get("/admin/appeals", (req, res) => {
  if (!adminAuth(req)) return fail(res, 401, "unauthorized");
  const status = String(req.query.status || "all");
  let list = appeals;
  if (status !== "all") list = appeals.filter(a => a.status === status);
  ok(res, { appeals: list });
});

// 处理申诉
app.post("/admin/appeals/handle", (req, res) => {
  if (!adminAuth(req)) return fail(res, 401, "unauthorized");
  const { appealId, action, note } = req.body || {}; // action: approve/reject
  const idx = appeals.findIndex(a => a.id === appealId);
  if (idx < 0) return fail(res, 404, "appeal not found");
  if (!["approve", "reject"].includes(action)) return fail(res, 400, "bad action");

  const a = appeals[idx];
  a.status = action === "approve" ? "approved" : "rejected";
  a.handledAt = now();
  a.handledBy = "admin";
  a.handleNote = String(note || "").slice(0, 500);

  // 批准申诉 => 自动解封
  if (action === "approve" && users[a.userId]) {
    users[a.userId].ban = { active: false, reason: "", until: 0 };
    saveJson(USERS_FILE, users);
  }

  saveJson(APPEALS_FILE, appeals);

  audit.unshift({
    t: now(),
    action: "appeal_" + action,
    userId: a.userId,
    appealId: a.id,
    note: a.handleNote
  });
  saveJson(AUDIT_FILE, audit);

  ok(res, { appealId: a.id, status: a.status });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("server running on port", port));