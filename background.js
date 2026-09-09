// TUS CLASS Helper - Background Service Worker
// バッジ更新とダッシュボードオープンのみ

const TUS_HOST = "class.admin.tus.ac.jp";

async function getStoredCount() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["courses"], (data) => {
      resolve(data && data.courses ? Object.keys(data.courses).length : 0);
    });
  });
}

async function updateBadge() {
  const count = await getStoredCount();
  if (count > 0) {
    await chrome.action.setBadgeText({ text: String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: "#1f7ae0" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  if (msg.type === "OPEN_DASHBOARD") {
    const url = chrome.runtime.getURL("dashboard/dashboard.html");
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "OPEN_POPUP") {
    // ポップアップを強制表示（アイコンクリックの代替）
    chrome.action.openPopup && chrome.action.openPopup();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === "COUNTS_CHANGED") {
    updateBadge();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.courses) {
    updateBadge();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

updateBadge();
