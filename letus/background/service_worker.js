/* LETUS Assist - Service Worker: メッセージ処理と To Do 連携の振り分け */
import '../shared/dateutil.js';
import * as google from './google.js';
import * as microsoft from './microsoft.js';

const DATE = globalThis.LA_DATE;
const DEFAULTS_KEY = 'letusAssist';

// To Do 連携に必要な権限（オプション権限。初回の利用時に要求する）
const TODO_PERMISSIONS = ['identity'];
const TODO_ORIGINS = [
  'https://tasks.googleapis.com/*',
  'https://graph.microsoft.com/*',
  'https://login.microsoftonline.com/*'
];
const TODO_CONSUME = { permissions: TODO_PERMISSIONS, origins: TODO_ORIGINS };

function todoPermitted() {
  return new Promise((resolve) => {
    try {
      chrome.permissions.contains(TODO_CONSUME, (ok) => resolve(!!ok));
    } catch (e) { resolve(false); }
  });
}

// 通知は使わない（permissions を増やさないため）。結果は画面内の表示で伝える。
function notify() { /* no-op */ }

function getTodoOptions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS_KEY, (res) => {
      resolve((res && res[DEFAULTS_KEY] && res[DEFAULTS_KEY].todo) || {});
    });
  });
}

function dueToUtc(parts, timeZone) {
  if (!parts) return null;
  return DATE.toRfc3339Utc(parts, timeZone || 'Asia/Tokyo');
}

async function addToGoogle(msg) {
  const opt = Object.assign({}, msg.options, await getTodoOptions());
  const dueUtc = dueToUtc(msg.payload.dueParts, opt.timeZone);
  const task = await google.addTask({
    title: msg.title,
    note: msg.note,
    dueUtc,
    taskList: opt.googleTaskList
  });
  return 'Google Tasks に追加しました（' + (task.due ? new Date(task.due).toLocaleString('ja-JP') : '期限なし') + '）';
}

async function addToMicrosoft(msg) {
  const opt = Object.assign({}, msg.options, await getTodoOptions());
  const task = await microsoft.addTask({
    title: msg.title,
    note: msg.note,
    dueParts: msg.payload.dueParts,
    timeZone: opt.timeZone,
    listName: opt.msListName,
    reminder: opt.msReminder,
    reminderMinutes: opt.reminderMinutesBefore
  });
  return 'Microsoft To Do に追加しました（リスト: ' + (opt.msListName || 'Tasks') + '）';
}

const handlers = {
  async 'todo.add'(msg) {
    try {
      if (!(await todoPermitted())) {
        return {
          ok: false,
          needPermission: true,
          consume: TODO_CONSUME,
          message: 'To Do 連携には許可が必要です。拡張機能の設定で「To Do 連携を有効にする」を押してください。'
        };
      }
      const message = msg.service === 'google'
        ? await addToGoogle(msg)
        : await addToMicrosoft(msg);
      notify('LETUS Assist', message);
      return { ok: true, message };
    } catch (err) {
      return { ok: false, message: String((err && err.message) || err) };
    }
  },

  async 'todo.status'() {
    const opt = await getTodoOptions();
    return {
      ok: true,
      granted: await todoPermitted(),
      consume: TODO_CONSUME,
      google: { configured: google.isConfigured() },
      microsoft: {
        clientIdSet: !!opt.msClientId,
        connected: await microsoft.isConnected()
      }
    };
  },

  /** To Do 連携に必要な権限の付与状態 */
  async 'todo.hasPermission'() {
    return { ok: true, granted: await todoPermitted() };
  },

  /** 権限を外す（設定ページから） */
  async 'todo.dropPermission'() {
    try {
      await chrome.permissions.remove({ permissions: TODO_PERMISSIONS, origins: TODO_ORIGINS });
      return { ok: true, message: 'To Do 連携の許可を解除しました。' };
    } catch (e) {
      return { ok: false, message: String(e && e.message) };
    }
  },

  async 'ms.connect'(msg) {
    const opt = Object.assign({}, await getTodoOptions(), msg);
    try {
      const auth = await microsoft.connect(opt.msClientId, opt.msTenant);
      return { ok: true, message: '接続しました（テナント: ' + auth.tenant + '）' };
    } catch (err) {
      return { ok: false, message: String((err && err.message) || err) };
    }
  },

  async 'ms.disconnect'() {
    await microsoft.clearAuth();
    return { ok: true, message: '接続を解除しました。' };
  },

  async 'ms.lists'() {
    try {
      return { ok: true, lists: (await microsoft.listLists()).map((l) => l.displayName) };
    } catch (err) {
      return { ok: false, message: String((err && err.message) || err) };
    }
  },

  async 'google.disconnect'() {
    await google.removeToken();
    return { ok: true, message: 'Google の認証を解除しました。' };
  },

  async 'openOptions'() {
    await chrome.runtime.openOptionsPage();
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = msg && handlers[msg.type];
  if (!fn) return false;
  Promise.resolve(fn(msg, sender)).then(sendResponse, (err) => {
    sendResponse({ ok: false, message: String((err && err.message) || err) });
  });
  return true;
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});
