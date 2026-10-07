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

  /* --------------------------------------------------------- ダークモード */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function themeHint(cfg) {
    if (cfg.mode === 'off') return 'ダークモードはオフです';
    if (cfg.mode === 'on') return 'いつでも暗くなります';
    if (cfg.schedule === 'system') return 'OS（端末）の設定に合わせます';
    const tr = window.TUS_THEME ? TUS_THEME.nextTransition(cfg, new Date()) : null;
    if (!tr) return '切替の予定がありません（時刻が同じになっていませんか）';
    const a = tr.at;
    return (a.getMonth() + 1) + '/' + a.getDate() + ' ' + pad2(a.getHours()) + ':' + pad2(a.getMinutes()) +
      ' に' + (tr.dark ? '暗くなる' : '明るくなる');
  }

  function syncThemeUI(cfg) {
    $('tus-mode').value = cfg.mode;
    $('tus-schedule').value = cfg.schedule;
    $('tus-start').value = cfg.time.start;
    $('tus-end').value = cfg.time.end;
    $('tus-t-class').checked = cfg.targets.class !== false;
    $('tus-t-letus').checked = cfg.targets.letus !== false;
    $('tus-t-ui').checked = cfg.targets.ui !== false;
    $('tus-auto').hidden = cfg.mode !== 'auto';
    $('tus-time-row').hidden = cfg.schedule !== 'time';
    $('tus-next').textContent = themeHint(cfg);
  }

  function loadTheme() {
    if (!window.TUS_THEME) return;
    TUS_THEME.getSettings().then(syncThemeUI);
  }

  function saveTheme(patch) {
    if (!window.TUS_THEME) return;
    TUS_THEME.setSettings(patch).then(syncThemeUI);
  }

  $('tus-mode').addEventListener('change', (e) => saveTheme({ mode: e.target.value }));
  $('tus-schedule').addEventListener('change', (e) => saveTheme({ schedule: e.target.value }));
  $('tus-start').addEventListener('change', (e) => saveTheme({ time: { start: e.target.value } }));
  $('tus-end').addEventListener('change', (e) => saveTheme({ time: { end: e.target.value } }));
  $('tus-t-class').addEventListener('change', (e) => saveTheme({ targets: { class: e.target.checked } }));
  $('tus-t-letus').addEventListener('change', (e) => saveTheme({ targets: { letus: e.target.checked } }));
  $('tus-t-ui').addEventListener('change', (e) => saveTheme({ targets: { ui: e.target.checked } }));

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
  loadTheme();
  renderGame();
  renderTodoStatus();
})();
