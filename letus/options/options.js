/* LETUS Assist - 設定ページ */
(function () {
  'use strict';

  const LA = window.LA;
  let settings = null;

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((o, k) => {
      if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
      return o[k];
    }, obj);
    parent[last] = value;
  }

  function fillIconSelects() {
    for (const sel of document.querySelectorAll('select[data-icon-select]')) {
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '— アイコンなし —';
      sel.appendChild(none);
      for (const grp of window.LA_ICONS) {
        const og = document.createElement('optgroup');
        og.label = grp.group;
        for (const cls of grp.items) {
          const o = document.createElement('option');
          o.value = cls;
          o.textContent = cls.replace(/^fa-/, '');
          og.appendChild(o);
        }
        sel.appendChild(og);
      }
      const custom = document.createElement('option');
      custom.value = '__custom__';
      custom.textContent = 'その他（下の入力欄）';
      sel.appendChild(custom);
    }
  }

  function syncIconInputs(changed) {
    const sel = document.querySelector('select[data-icon-select][data-path="' + changed.dataset.path + '"]');
    const txt = document.querySelector('input[data-icon-text][data-path="' + changed.dataset.path + '"]');
    if (!sel || !txt) return;
    if (changed === sel) {
      if (sel.value === '__custom__') { txt.focus(); return; }
      txt.value = sel.value;
    } else {
      sel.value = window.LA_ICON_FLAT.indexOf(txt.value.trim()) >= 0 ? txt.value.trim() : '__custom__';
    }
  }

  function applyToForm() {
    for (const el of document.querySelectorAll('[data-path]')) {
      const v = getPath(settings, el.dataset.path);
      if (v === undefined || v === null) continue;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'number') el.value = v;
      else el.value = Array.isArray(v) ? v.join(',') : v;
    }
    for (const sel of document.querySelectorAll('select[data-icon-select]')) {
      const txt = document.querySelector('input[data-icon-text][data-path="' + sel.dataset.path + '"]');
      const v = String(getPath(settings, sel.dataset.path) || '');
      sel.value = window.LA_ICON_FLAT.indexOf(v) >= 0 ? v : (v ? '__custom__' : '');
      if (txt) txt.value = v;
    }
    for (const el of document.querySelectorAll('input[type="color"][data-alpha]')) {
      const v = String(getPath(settings, el.dataset.path) || '#ffffff');
      const m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/i);
      if (m) {
        el.value = '#' + m[1];
        el.dataset.alpha = m[2] || '';
      } else {
        el.value = '#ffffff';
        el.dataset.alpha = '00';
      }
    }
  }

  let saveTimer = null;
  function queueSave() {
    const state = document.getElementById('saveState');
    state.textContent = '保存中…';
    state.classList.remove('saved');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await LA.setSettings(settings);
      state.textContent = '保存しました';
      state.classList.add('saved');
      setTimeout(() => { state.textContent = '自動保存されます'; state.classList.remove('saved'); }, 1500);
    }, 250);
  }

  function onInput(e) {
    const el = e.target;
    if (!el.dataset.path) return;
    const path = el.dataset.path;
    let v;

    if (el.type === 'number') v = Number(el.value);
    else if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'color') {
      const a = el.dataset.alpha || 'ff';
      v = el.value + a;
    } else if (el.dataset.orderSelect) v = String(el.value).split(',');
    else if (el.dataset.path === 'todo.msReminder' || el.dataset.path === 'top.newsCollapsed') v = el.value === 'true';
    else v = el.value;

    if (el.dataset.iconSelect || el.dataset.iconText) syncIconInputs(el);
    if (el.dataset.iconText) v = el.value.trim();
    if (typeof v === 'number' && Number.isNaN(v)) return;

    setPath(settings, path, v);
    queueSave();
  }

  /* ---------------------------------------------------------------- 実績 */

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function renderAchv() {
    const el = document.getElementById('achv');
    if (!el || !window.LA_GAME) return;
    const g = (settings && settings.game) || {};
    const xp = g.xp || 0;
    const info = window.LA_GAME.levelInfo(xp);
    const hist = Array.isArray(g.history) ? g.history : [];
    const streak = g.streakDays || 0;
    const tier = window.LA_GAME.tierFor(Math.max(1, streak));

    el.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'head';
    head.innerHTML =
      '<span class="lv">Lv.' + info.level + '</span>' +
      '<span class="awname">' + info.title + '</span>' +
      '<span class="xp">' + fmt(xp) + ' XP ／ 次のレベルまで ' + fmt(Math.max(0, info.need - info.into)) + ' XP</span>';
    el.appendChild(head);

    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = Math.round(info.ratio * 100) + '%';
    bar.appendChild(fill);
    el.appendChild(bar);

    const stats = document.createElement('div');
    stats.className = 'stats';
    const items = [
      ['現在の連続提出', streak + ' 日' + (streak > 1 ? '（×' + tier.mult + ' ' + tier.label + '）' : '')],
      ['最長連続', (g.bestStreak || 0) + ' 日'],
      ['総提出数', (g.totalSubmits || 0) + ' 回'],
      ['合計集中時間', (g.totalFocusMinutes || 0) + ' 分']
    ];
    for (const [k, v] of items) {
      const d = document.createElement('div');
      d.className = 'stat';
      d.innerHTML = '<div class="k">' + k + '</div><div class="v">' + v + '</div>';
      stats.appendChild(d);
    }
    el.appendChild(stats);

    if (!hist.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'まだ提出の記録がありません。課題を提出すると記録されます。';
      el.appendChild(e);
    } else {
      const table = document.createElement('table');
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>日時</th><th>課題</th><th class="num">XP</th><th class="num">倍率</th></tr>';
      const tbody = document.createElement('tbody');
      for (const h of hist.slice(0, 10)) {
        const d = new Date(h.ts);
        const p = (n) => String(n).padStart(2, '0');
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + '</td>' +
          '<td>' + (h.name || '') + (h.course ? '<br><small>' + h.course + '</small>' : '') + '</td>' +
          '<td class="num">+' + fmt(h.xp) + '</td>' +
          '<td class="num">' + (h.mult > 1 ? '×' + h.mult + ' ' + (h.tier || '') : '×1') + '</td>';
        tbody.appendChild(tr);
      }
      table.append(thead, tbody);
      el.appendChild(table);
    }
  }

  /* ------------------------------------------------------ 個別の色・アイコン */

  function renderStyleList() {
    const el = document.getElementById('styleList');
    const st = document.getElementById('styleStatus');
    if (!el) return;
    const map = (settings && settings.top && settings.top.courseStyles) || {};
    const hrefs = Object.keys(map);
    el.innerHTML = '';

    if (!hrefs.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = '個別設定はありません。LETUS のトップページで各コースの ⚙ から設定できます。';
      el.appendChild(e);
      if (st) { st.className = 'status'; st.textContent = ''; }
      return;
    }

    if (st) {
      st.className = 'status';
      st.textContent = hrefs.length + ' 件のコースに個別設定があります。';
    }

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>コース</th><th>文字色</th><th>アイコン</th><th></th></tr>';
    const tbody = document.createElement('tbody');
    for (const href of hrefs) {
      const e = map[href] || {};
      const tr = document.createElement('tr');

      const tdName = document.createElement('td');
      const link = document.createElement('a');
      link.href = href; link.target = '_blank'; link.rel = 'noreferrer';
      link.textContent = e.name || href;
      tdName.appendChild(link);

      const tdColor = document.createElement('td');
      if (e.color) {
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = e.color;
        const code = document.createElement('span');
        code.className = 'mono';
        code.textContent = ' ' + e.color;
        tdColor.append(sw, code);
      } else {
        tdColor.innerHTML = '<span class="empty">全体設定</span>';
      }

      const tdIcon = document.createElement('td');
      tdIcon.innerHTML = e.icon
        ? '<i class="icon fa ' + e.icon + ' fa-fw"></i> <span class="mono">' + e.icon + '</span>'
        : '<span class="empty">全体設定</span>';

      const tdBtn = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = '解除';
      btn.addEventListener('click', async () => {
        await LA.patchCourseStyle(href, null);
        settings = await LA.getSettings();
        renderStyleList();
        msg('styleStatus', '個別設定を解除しました。', 'ok');
      });
      tdBtn.appendChild(btn);

      tr.append(tdName, tdColor, tdIcon, tdBtn);
      tbody.appendChild(tr);
    }
    table.append(thead, tbody);
    el.appendChild(table);
  }

  function updateHiddenStatus() {
    const el = document.getElementById('hiddenStatus');
    if (!el) return;
    const list = settings && settings.top && settings.top.hiddenCourses;
    const n = Array.isArray(list) ? list.length : 0;
    if (!n) {
      el.className = 'status';
      el.textContent = '非表示のコースはありません。';
    } else {
      el.className = 'status bad';
      el.textContent = '現在 ' + n + ' 件のコースが「マイコース」一覧で非表示になっています。';
    }
  }

  /* ---------------------------------------------------------- 接続状態 */

  function msg(id, text, cls) {
    const n = document.getElementById(id);
    n.textContent = text;
    n.className = 'status' + (cls ? ' ' + cls : '');
  }

  async function refreshStatus() {
    const res = await chrome.runtime.sendMessage({ type: 'todo.status' });
    if (!res || !res.ok) {
      msg('googleStatus', '確認できませんでした。', 'bad');
      msg('msStatus', '確認できませんでした。', 'bad');
      return;
    }
    msg('googleStatus',
      res.google.configured
        ? '✅ Google Tasks API のクライアントIDが設定されています。ボタンを押すと初回のみログイン画面が開きます。'
        : '⚠ manifest.json の oauth2.client_id が未設定です（下の「Google Tasks 連携」の手順を参照）。',
      res.google.configured ? 'ok' : 'bad');

    msg('msStatus',
      res.microsoft.connected
        ? '✅ Microsoft To Do に接続済みです。'
        : (res.microsoft.clientIdSet
            ? '⚠ クライアントIDは入力済みですが、まだ接続していません。「接続」を押してください。'
            : '⚠ Azure アプリのクライアントIDが未設定です。'),
      res.microsoft.connected ? 'ok' : 'bad');
  }

  function send(type, extra) {
    return chrome.runtime.sendMessage(Object.assign({ type }, extra || {}));
  }

  /* ---------------------------------------------------------------- 起動 */

  fillIconSelects();
  document.getElementById('msRedirect').textContent =
    'https://' + chrome.runtime.id + '.chromiumapp.org/';

  LA.getSettings().then((s) => {
    settings = s;
    applyToForm();
    updateHiddenStatus();
    renderStyleList();
    renderAchv();
    refreshStatus();
    refreshPermission();
  });

  document.addEventListener('input', onInput);
  document.addEventListener('change', onInput);

  // LETUS のページ側で変更した内容も設定ページに反映する
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes[LA.STORAGE_KEY]) return;
    if (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    settings = await LA.getSettings();
    applyToForm();
    updateHiddenStatus();
    renderStyleList();
    renderAchv();
  });

  /* ---------------------------------------------------- To Do 連携の許可 */

  const TODO_CONSUME = {
    permissions: ['identity'],
    origins: [
      'https://tasks.googleapis.com/*',
      'https://graph.microsoft.com/*',
      'https://login.microsoftonline.com/*'
    ]
  };

  async function refreshPermission() {
    const el = document.getElementById('permStatus');
    if (!el) return;
    let granted = false;
    try {
      granted = await new Promise((r) => chrome.permissions.contains(TODO_CONSUME, (ok) => r(!!ok)));
    } catch (e) { /* ignore */ }
    el.className = 'status' + (granted ? ' ok' : ' bad');
    el.textContent = granted
      ? '✅ To Do 連携は有効です（許可済み）。'
      : '⚠ To Do 連携は未許可です。「To Do 連携を有効にする」を押してください。';
  }

  document.getElementById('todoEnable').addEventListener('click', () => {
    // クリック直後（ユーザー操作中）に要求する必要がある
    try {
      chrome.permissions.request(TODO_CONSUME, (ok) => {
        msg('permResult', ok ? '✅ To Do 連携を有効にしました。' : '⚠ 許可されませんでした。', ok ? 'ok' : 'bad');
        refreshPermission();
      });
    } catch (e) {
      msg('permResult', '要求に失敗しました: ' + (e && e.message), 'bad');
    }
  });

  document.getElementById('todoDisable').addEventListener('click', async () => {
    const r = await send('todo.dropPermission');
    msg('permResult', r.message, r.ok ? 'ok' : 'bad');
    refreshPermission();
  });

  document.getElementById('googleDisconnect').addEventListener('click', async () => {
    const r = await send('google.disconnect');
    msg('googleStatus', r.message, r.ok ? 'ok' : 'bad');
  });

  document.getElementById('msConnect').addEventListener('click', async () => {
    const clientId = getPath(settings, 'todo.msClientId');
    if (!clientId) { msg('msResult', '先にクライアントIDを入力してください。', 'bad'); return; }
    await LA.setSettings(settings);
    msg('msResult', 'サインイン画面を開いています…', '');
    const r = await send('ms.connect', {
      msClientId: clientId,
      msTenant: getPath(settings, 'todo.msTenant')
    });
    msg('msResult', r.message, r.ok ? 'ok' : 'bad');
    refreshStatus();
  });

  document.getElementById('msDisconnect').addEventListener('click', async () => {
    const r = await send('ms.disconnect');
    msg('msResult', r.message, r.ok ? 'ok' : 'bad');
    refreshStatus();
  });

  document.getElementById('msTest').addEventListener('click', async () => {
    msg('msResult', 'リストを取得しています…', '');
    const r = await send('ms.lists');
    if (r.ok) msg('msResult', '取得できたリスト: ' + (r.lists.join(' / ') || '(なし)'), 'ok');
    else msg('msResult', r.message, 'bad');
  });

  document.getElementById('resetCourseOrder').addEventListener('click', async () => {
    await LA.setSettings({ top: { courseOrder: null, order: ['mycourses', 'sitenews'] } });
    settings = await LA.getSettings();
    applyToForm();
    updateHiddenStatus();
    msg('hiddenStatus', 'コース一覧の並び順をリセットしました（LETUS のページを再読み込みしてください）。', 'ok');
  });

  document.getElementById('clearCourseStyles').addEventListener('click', async () => {
    const n = Object.keys((settings.top && settings.top.courseStyles) || {}).length;
    if (!n) { msg('styleStatus', '個別設定はありません。', 'ok'); return; }
    if (!confirm(n + ' 件の個別の色・アイコン設定をすべて解除します。よろしいですか？')) return;
    await LA.setCourseStyles({});
    settings = await LA.getSettings();
    renderStyleList();
    msg('styleStatus', n + ' 件の個別設定を解除しました。', 'ok');
  });

  document.getElementById('unhideAll').addEventListener('click', async () => {
    const n = Array.isArray(settings.top.hiddenCourses) ? settings.top.hiddenCourses.length : 0;
    if (!n) { msg('hiddenStatus', '非表示のコースはありません。', 'ok'); return; }
    await LA.setSettings({ top: { hiddenCourses: [] } });
    settings = await LA.getSettings();
    updateHiddenStatus();
    msg('hiddenStatus', n + ' 件の非表示コースをすべて表示しました（LETUS のページを再読み込みしてください）。', 'ok');
  });

  document.getElementById('testCelebrate').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('letus/preview/preview.html') });
  });

  document.getElementById('resetGame').addEventListener('click', async () => {
    if (!confirm('XP・レベル・連続提出日数・履歴をすべてリセットします。よろしいですか？')) return;
    settings = await LA.getSettings();
    settings.game = await window.LA_GAME.resetGame();
    renderAchv();
    msg('gameStatus', '実績をリセットしました。', 'ok');
  });

  document.getElementById('resetAll').addEventListener('click', async () => {
    if (!confirm('すべての設定を初期値に戻します。よろしいですか？')) return;
    settings = await LA.resetSettings();
    applyToForm();
    updateHiddenStatus();
    renderStyleList();
    renderAchv();
    refreshStatus();
    refreshPermission();
  });
})();
