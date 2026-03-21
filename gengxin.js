// ========================================
// 更新公告.js
// ========================================
// 配置区：每次更新只需修改这里
const UPDATE_CONFIG = {
  version: 'v1.0.2',
  content: `
🎉 欢迎使用 HuiPhone！

【修复】
· 修复弹窗层级低问题
· 修复长按编辑框不显示问题
· 修复报错

【优化】
· 终于有全屏啦啦啦啦！！
  `.trim()
};

// ========================================
// 以下不需要修改
// ========================================
(function() {
  const STORAGE_KEY = 'skipUpdateNotice_' + UPDATE_CONFIG.version;

  function shouldShow() {
    return localStorage.getItem(STORAGE_KEY) !== '1';
  }

  function markSkip() {
    localStorage.setItem(STORAGE_KEY, '1');
  }

  function closeNotice() {
    const mask = document.getElementById('updateNoticeMask');
    if (!mask) return;
    mask.style.opacity = '0';
    mask.style.transform = 'scale(0.96)';
    setTimeout(() => {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }, 250);
  }

  function showNotice() {
    if (!shouldShow()) return;

    const mask = document.createElement('div');
    mask.id = 'updateNoticeMask';
    mask.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      opacity: 0;
      transition: opacity 0.25s ease;
    `;

    mask.innerHTML = `
      <div id="updateNoticeBox" style="
        background: white;
        border-radius: 18px;
        width: min(88vw, 360px);
        max-height: 70vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
        transform: translateY(16px);
        transition: transform 0.25s ease;
      ">
        <div style="
          padding: 20px 20px 14px;
          border-bottom: 1px solid #f0f0f0;
          flex-shrink: 0;
          text-align: center;
        ">
          <div style="
            display: inline-block;
            background: linear-gradient(135deg, var(--primary, #B8A9C9), var(--primary-dark, #9D8BB8));
            color: white;
            font-size: 12px;
            font-weight: 600;
            padding: 3px 12px;
            border-radius: 20px;
            letter-spacing: 1px;
            margin-bottom: 8px;
          ">${UPDATE_CONFIG.version}</div>
          <div style="font-size: 17px; font-weight: 700; color: #222;">更新公告</div>
        </div>

        <div style="
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          font-size: 14px;
          color: #444;
          line-height: 1.8;
          white-space: pre-wrap;
          -webkit-overflow-scrolling: touch;
        ">${escapeHtml(UPDATE_CONFIG.content)}</div>

        <div style="
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-top: 1px solid #f0f0f0;
          flex-shrink: 0;
        ">
          <button id="updateNoticeSkip" style="
            padding: 14px;
            border: none;
            background: none;
            font-size: 14px;
            color: #999;
            cursor: pointer;
            border-right: 1px solid #f0f0f0;
            font-family: inherit;
          ">本次不再提示</button>
          <button id="updateNoticeClose" style="
            padding: 14px;
            border: none;
            background: none;
            font-size: 14px;
            font-weight: 600;
            color: var(--primary-dark, #9D8BB8);
            cursor: pointer;
            font-family: inherit;
          ">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(mask);

    requestAnimationFrame(() => {
      mask.style.opacity = '1';
      const box = document.getElementById('updateNoticeBox');
      if (box) box.style.transform = 'translateY(0)';
    });

    mask.addEventListener('click', function(e) {
      if (e.target === mask) closeNotice();
    });

    document.getElementById('updateNoticeClose').onclick = function() {
      closeNotice();
    };

    document.getElementById('updateNoticeSkip').onclick = function() {
      markSkip();
      closeNotice();
    };
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showNotice);
  } else {
    showNotice();
  }
})();
const PUSH_API_BASE = "https://huios-push-production.up.railway.app";

function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function initNotifyStatus() {
    const statusEl = document.getElementById("notifyStatusText");
    const toggleEl = document.getElementById("notifyOn");
    const testEl = document.getElementById("testNotifyItem");

    if (!statusEl || !toggleEl) return;

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        statusEl.textContent = "当前浏览器不支持推送";
        toggleEl.checked = false;
        if (testEl) testEl.style.display = "none";
        return;
    }

    try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();

        if (sub) {
            statusEl.textContent = "已开启推送";
            toggleEl.checked = true;
            if (testEl) testEl.style.display = "";
        } else {
            statusEl.textContent = "未开启推送";
            toggleEl.checked = false;
            if (testEl) testEl.style.display = "none";
        }
    } catch (e) {
        console.error("检查推送状态失败:", e);
        statusEl.textContent = "推送状态检测失败";
    }
}

async function onNotifyToggle(checked) {
    const statusEl = document.getElementById("notifyStatusText");
    const testEl = document.getElementById("testNotifyItem");
    const toggleEl = document.getElementById("notifyOn");

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        alert("当前浏览器不支持推送");
        if (toggleEl) toggleEl.checked = false;
        return;
    }

    try {
        alert("开始设置推送");
        const reg = await navigator.serviceWorker.ready;
        alert("Service Worker 已就绪");

        if (checked) {
            const permission = await Notification.requestPermission();
            alert("通知权限结果：" + permission);

            if (permission !== "granted") {
                if (toggleEl) toggleEl.checked = false;
                if (statusEl) statusEl.textContent = "通知权限被拒绝";
                return;
            }

            let oldSub = await reg.pushManager.getSubscription();
            alert("已有订阅：" + (oldSub ? "有" : "没有"));

            if (oldSub) {
                alert("删除旧订阅中");
                try {
                    await oldSub.unsubscribe();
                    alert("旧订阅已删除");
                } catch (e) {
                    alert("删除旧订阅失败，但继续尝试新建");
                }
            }

            alert("开始获取公钥");
            const publicKey = await fetch(`${PUSH_API_BASE}/vapid-public-key`, {
                method: "GET",
                cache: "no-store"
            }).then(r => r.text());

            alert("公钥获取成功：" + publicKey.slice(0, 20) + "...");

            alert("开始创建新订阅");
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
            alert("新订阅创建成功");

            const subData = sub.toJSON ? sub.toJSON() : JSON.parse(JSON.stringify(sub));
            alert("开始发送订阅到后端");

const resp = await fetch(`${PUSH_API_BASE}/subscribe?sub=${encodeURIComponent(JSON.stringify(subData))}`, {
    method: "GET",
    mode: "cors",
    cache: "no-store"
});

            alert("后端返回状态：" + resp.status);
            const text = await resp.text();
            alert("后端返回内容：" + text);

            if (!resp.ok) {
                throw new Error(text || ("HTTP " + resp.status));
            }

            if (statusEl) statusEl.textContent = "已开启推送";
            if (testEl) testEl.style.display = "";
            if (toggleEl) toggleEl.checked = true;
            if (typeof toast === "function") toast("推送已开启");
        } else {
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await sub.unsubscribe();
            }
            if (statusEl) statusEl.textContent = "未开启推送";
            if (testEl) testEl.style.display = "none";
            if (typeof toast === "function") toast("推送已关闭");
        }
    } catch (e) {
        alert("失败位置报错：" + (e && e.message ? e.message : String(e)));
        console.error("切换推送失败:", e);
        if (toggleEl) toggleEl.checked = false;
        if (statusEl) statusEl.textContent = "开启失败";
    }
}

async function sendTestNotify() {
    try {
        const res = await fetch(`${PUSH_API_BASE}/send-test`, {
            method: "GET"
        });

        const text = await res.text();
        console.log(text);

        if (res.ok) {
            if (typeof toast === "function") toast("测试通知已发送");
            else alert("测试通知已发送");
        } else {
            alert("发送失败：" + text);
        }
    } catch (e) {
        console.error(e);
        alert("发送失败：" + e.message);
    }
}