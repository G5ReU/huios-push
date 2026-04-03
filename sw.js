self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// 页面内手动通知（保留）
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "SHOW_NOTIFICATION") return;
  const title = e.data.title || "HuiOS";
  const options = {
    body: e.data.body || "",
    icon: e.data.icon || "",
tag: e.data.tag || ("msg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)),
    data: e.data.data || {}
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// 关键：接收后端 Web Push
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }

  const title = data.title || "HuiOS";
  const options = {
    body: data.body || "",
    icon: data.icon || "",
tag: data.tag || ("push-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8)),
    data: {
      url: data.url || "https://huios.pages.dev"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 点击通知跳转
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "https://huios.pages.dev";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});