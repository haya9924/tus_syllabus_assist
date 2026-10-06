// TUS Assist - Background Service Worker（統合版 / module）
//
//   CLASS (class.admin.tus.ac.jp)  : バッジ更新・ダッシュボード起動
//   LETUS (letus.ed.tus.ac.jp)     : 課題の To Do 連携（Google / Microsoft）・設定ページ起動
//
// LETUS 側のリスナーは下の import で登録される。

import './letus/background/service_worker.js';

/* ------------------------------------------------------------------ CLASS */

const TUS_HOST = 'class.admin.tus.ac.jp';

async function getStoredCount() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['courses'], (data) => {
      resolve(data && data.courses ? Object.keys(data.courses).length : 0);
    });
  });
}

async function updateBadge() {
  const count = await getStoredCount();
  if (count > 0) {
    await chrome.action.setBadgeText({ text: String(count) });
    await chrome.action.setBadgeBackgroundColor({ color: '#1f7ae0' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  if (msg.type === 'OPEN_DASHBOARD') {
    const url = chrome.runtime.getURL('dashboard/dashboard.html');
    chrome.tabs.create({ url });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'OPEN_POPUP') {
    chrome.action.openPopup && chrome.action.openPopup();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'COUNTS_CHANGED') {
    updateBadge();
    sendResponse({ ok: true });
    return true;
  }
  // LETUS 側の設定ページを開く（共通）
  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.courses) {
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
