/* TUS Assist - ツールバーポップアップ（CLASS + LETUS 統合） */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ------------------------------------------------------------- CLASS */

  function parseCredits(text) {
    if (text == null) return 0;
    const m = String(text).replace(/[\s,]/g, '').match(/(\d+(?:\.\d+)?)/);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    return isNaN(v) ? 0 : v;
  }

  function refreshClass() {
    chrome.storage.local.get(['courses', 'timetable', 'gradeLinks'], (data) => {
      const courses = data.courses || {};
      const tt = data.timetable || {};
      const gl = data.gradeLinks || {};
      const planned = Object.values(courses).filter((c) => tt[c.classCode] && tt[c.classCode].planned);
      const total = planned.reduce((s, c) => s + parseCredits(c.credits), 0);
      $('tce-count').textContent = String(Object.keys(courses).length);
      $('tce-planned').textContent = String(planned.length);
      $('tce-credits').textContent = total.toFixed(1);
      $('tce-linked').textContent = String(Object.keys(gl).length);
    });
  }

  function refreshSidebarToggle() {
    chrome.storage.local.get(['settings'], (data) => {
      const s = (data && data.settings && data.settings.sidebar) || {};
      $('tce-sidebar-toggle').checked = s.enabled !== false;
    });
  }

  /* ------------------------------------------------------------- LETUS */

  function line(label, value, ok) {
    const d = document.createElement('div');
    d.className = 'row' + (ok === undefined ? '' : (ok ? ' ok' : ' ng'));
    const a = document.createElement('span');
    a.className = 'lbl';
    a.textContent = label;
    const b = document.createElement('span');
    b.className = 'val';
    b.textContent = value;
    d.append(a, b);
    return d;
  }

  function renderGame() {
    if (!window.LA_GAME) return;
    chrome.storage.local.get('letusAssist', (r) => {
      const g = (r && r.letusAssist && r.letusAssist.game) || { xp: 0, streakDays: 0, totalSubmits: 0 };
      const info = window.LA_GAME.levelInfo(g.xp || 0);
      const box = document.createElement('div');
      box.className = 'achv';
      box.innerHTML =
        '<div class="row2"><span class="lv">Lv.' + info.level + '</span>' +
        '<span class="awname">' + info.title + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.round(info.ratio * 100) + '%"></i></div>' +
        '<div class="sub">' + fmt(g.xp || 0) + ' XP ／ 連続 ' +
        (g.streakDays || 0) + ' 日 ／ 提出 ' + (g.totalSubmits || 0) + ' 回</div>';
      $('body').appendChild(box);
    });
  }

  function renderTodoStatus() {
    chrome.runtime.sendMessage({ type: 'todo.status' }).then((res) => {
      if (!res || !res.ok) {
        $('body').appendChild(line('状態', '取得できませんでした', false));
        return;
      }
      if (!res.granted) {
        $('body').appendChild(line('To Do 連携', '許可が必要（設定から有効化）', false));
      } else {
        $('body').appendChild(line('Google Tasks',
          res.google.configured ? '設定済み（初回ログイン要）' : '未設定（manifest.json）', res.google.configured));
        $('body').appendChild(line('Microsoft To Do',
          res.microsoft.connected ? '接続済み' : (res.microsoft.clientIdSet ? '未接続' : '未設定'),
          res.microsoft.connected));
      }
    }).catch(() => { /* ignore */ });
  }

  /* ------------------------------------------------------------ ボタン */

  $('tce-open-dashboard').addEventListener('click', () => {
    const url = chrome.runtime.getURL('dashboard/dashboard.html');
    chrome.tabs.create({ url }, () => window.close());
  });

  $('options').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openOptions' });
    window.close();
  });

  $('tce-open-class').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) return;
      const tab = tabs[0];
      const url = tab && tab.url ? tab.url : 'https://class.admin.tus.ac.jp/';
      chrome.tabs.create({ url }, () => window.close());
    });
  });

  $('tce-sidebar-toggle').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.get(['settings'], (data) => {
      const settings = (data && data.settings) || {};
      settings.sidebar = Object.assign({}, settings.sidebar, { enabled });
      chrome.storage.local.set({ settings });
    });
  });

  chrome.storage.onChanged.addListener(refreshClass);
  refreshClass();
  refreshSidebarToggle();
  renderGame();
  renderTodoStatus();
})();
