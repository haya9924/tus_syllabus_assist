/* LETUS Assist - 課題ページ: 提出ステータスの下に「Todo List に追加」ボタンを配置 */
(function () {
  'use strict';

  const D = document;
  if (!window.LA || !window.LA_DATE || !window.LA_ASSIGN) return;

  const DATE = window.LA_DATE;
  const added = new Set();
  let settings = null;
  let panel = null;

  /* ------------------------------------------------------------- 情報抽出 */

  const EX = window.LA_ASSIGN;
  const activityName = EX.activityName;
  const courseName = EX.courseName;
  const sectionName = EX.sectionName;
  const dueText = EX.dueText;

  function payload() {
    const due = dueText();
    let parts = due ? due.parts : null;
    let usedFallback = false;
    if (!parts && settings) {
      const mode = settings.todo.noDueFallback;
      if (mode !== 'none') {
        parts = DATE.fallbackParts(mode, settings.todo.timeZone);
        usedFallback = true;
      }
    }
    return {
      name: activityName(),
      course: courseName(),
      section: sectionName(),
      dueParts: parts,
      dueFallback: usedFallback,
      dueText: due ? due.text : '',
      url: location.href
    };
  }

  function render(p, tpl) {
    const map = {
      course: p.course || '',
      name: p.name || '',
      section: p.section || '',
      due: p.dueParts ? DATE.formatLocal(p.dueParts) : '期限なし',
      url: p.url || ''
    };
    let title = tpl.todo.titleTemplate || '{course} {name}';
    title = title.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
    let note = tpl.todo.noteTemplate || '{url}';
    note = note.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
    if (!tpl.todo.includeUrl && note === map.url) note = '';
    return { title: title.trim(), note: note.trim() };
  }

  /* -------------------------------------------------------------- UI 構築 */

  function anchorPoint() {
    const table = D.querySelector('.submissionstatustable');
    if (table) return { node: table, mode: 'after' };
    const desc = D.querySelector('.activity-description');
    if (desc) return { node: desc, mode: 'after' };
    const nav = D.querySelector('.activity-navigation');
    if (nav) return { node: nav, mode: 'before' };
    const main = D.getElementById('region-main');
    if (main) return { node: main, mode: 'append' };
    return null;
  }

  function serviceLabel(s) {
    return s === 'google' ? 'Google Tasks' : 'Microsoft To Do';
  }

  function build() {
    const anchor = anchorPoint();
    if (!anchor) return;

    panel = D.createElement('div');
    panel.id = 'la-todo-panel';

    const info = D.createElement('div');
    info.className = 'la-todo-info';
    panel.appendChild(info);

    const row = D.createElement('div');
    row.className = 'la-todo-actions';

    const main = D.createElement('button');
    main.type = 'button';
    main.className = 'btn btn-primary la-todo-main';
    row.appendChild(main);

    const menuBtn = D.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'btn btn-outline-secondary la-todo-menu-btn';
    menuBtn.textContent = '\u25BE';
    menuBtn.title = '追加先を選ぶ';
    row.appendChild(menuBtn);

    const menu = D.createElement('div');
    menu.className = 'la-todo-menu hidden';
    for (const svc of ['google', 'microsoft']) {
      const b = D.createElement('button');
      b.type = 'button';
      b.className = 'la-todo-menu-item';
      b.dataset.service = svc;
      b.textContent = serviceLabel(svc);
      b.addEventListener('click', () => { closeMenu(); add(svc); });
      menu.appendChild(b);
    }
    row.appendChild(menu);
    panel.appendChild(row);

    const status = D.createElement('div');
    status.className = 'la-todo-status';
    panel.appendChild(status);

    main.addEventListener('click', () => add(settings.todo.defaultService));
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    D.addEventListener('click', () => closeMenu());

    if (anchor.mode === 'after') anchor.node.insertAdjacentElement('afterend', panel);
    else if (anchor.mode === 'before') anchor.node.insertAdjacentElement('beforebegin', panel);
    else anchor.node.appendChild(panel);
  }

  function closeMenu() {
    if (!panel) return;
    panel.querySelector('.la-todo-menu').classList.add('hidden');
  }

  function refresh() {
    if (!panel || !settings) return;
    const p = payload();
    const r = render(p, settings);
    panel.querySelector('.la-todo-info').textContent =
      '課題: ' + (p.name || '-') +
      (p.course ? ' / ' + p.course : '') +
      ' / 期限: ' + (p.dueText || (p.dueParts ? '自動設定 ' + DATE.formatLocal(p.dueParts) : '設定なし'));
    panel.querySelector('.la-todo-main').textContent =
      '📋 ' + r.title + ' を ' + serviceLabel(settings.todo.defaultService) + ' に追加';
    const st = panel.querySelector('.la-todo-status');
    st.textContent = '';
    st.className = 'la-todo-status';
    panel.dataset.laTitle = r.title;
    panel.dataset.laNote = r.note;
  }

  function setStatus(kind, text) {
    if (!panel) return;
    const st = panel.querySelector('.la-todo-status');
    st.textContent = text;
    st.className = 'la-todo-status la-todo-' + kind;
  }

  function setBusy(busy) {
    if (!panel) return;
    panel.classList.toggle('la-busy', !!busy);
    panel.querySelectorAll('button').forEach((b) => { b.disabled = !!busy; });
  }

  // To Do 連携に必要なオプション権限（manifest 側と揃える）
  const TODO_CONSUME = {
    permissions: ['identity'],
    origins: [
      'https://tasks.googleapis.com/*',
      'https://graph.microsoft.com/*',
      'https://login.microsoftonline.com/*'
    ]
  };

  /**
   * オプション権限を要求する。クリック直後（ユーザー操作中）に呼ぶ必要がある。
   * すでに許可済みならダイアログは出ず true が返る。
   * chrome.permissions が使えない環境では null（判定不能）を返し、SW 側の判定に任せる。
   */
  function requestTodoPermission() {
    return new Promise((resolve) => {
      if (!chrome.permissions || !chrome.permissions.request) { resolve(null); return; }
      try {
        chrome.permissions.request(TODO_CONSUME, (ok) => resolve(!!ok));
      } catch (e) { resolve(false); }
    });
  }

  function add(service) {
    if (!settings) return;
    const p = payload();
    const r = render(p, settings);
    setBusy(true);
    setStatus('info', serviceLabel(service) + ' に追加しています…');

    requestTodoPermission().then((granted) => {
      if (granted === false) {
        setBusy(false);
        setStatus('error', '⚠ To Do 連携には許可が必要です。拡張機能の設定で「To Do 連携を有効にする」を押してください。');
        return;
      }
      sendAdd(service, p, r);
    });
  }

  function sendAdd(service, p, r) {
    chrome.runtime.sendMessage(
      { type: 'todo.add', service, payload: p, title: r.title, note: r.note, options: settings.todo },
      (res) => {
        setBusy(false);
        if (chrome.runtime.lastError) {
          setStatus('error', '通信エラー: ' + chrome.runtime.lastError.message);
          return;
        }
        if (res && res.ok) {
          added.add(p.url);
          setStatus('ok', '✅ ' + (res.message || '追加しました'));
        } else if (res && res.needPermission) {
          setStatus('error', '⚠ ' + (res.message || 'To Do 連携の許可が必要です。'));
        } else {
          setStatus('error', '⚠ ' + ((res && res.message) || '追加できませんでした'));
        }
      }
    );
  }

  /* ---------------------------------------------------------------- 起動 */

  if (!EX.isAssignPage()) return;

  window.LA.getSettings().then((s) => {
    settings = s;
    build();
    refresh();
    if (added.has(location.href)) setStatus('ok', '✅ この課題は追加済みです');
  });

  // 設定の変更（既定の追加先・テンプレート等）を即時反映
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[window.LA.STORAGE_KEY]) return;
    window.LA.getSettings().then((s) => {
      settings = s;
      if (!panel) build();
      refresh();
    });
  });
})();
