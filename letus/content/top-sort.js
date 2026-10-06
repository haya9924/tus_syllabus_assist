/* LETUS Assist - トップページ: 並べ替え・非表示・コース個別設定
 *   操作列（⠿ ▲▼ ⚙）は「並べ替え」モードのときだけ表示する。
 *   非表示は ⚙ ダイアログ内のチェックボックスからのみ（誤操作防止）。
 */
(function (g) {
  'use strict';

  const T = g.LA_TOP;
  const D = T.D;
  let save = null;
  let onChange = null;
  let settingsCache = null;

  /* --------------------------------------------------------- 表示 / 非表示 */

  function hiddenList() {
    const list = (settingsCache && settingsCache.top && settingsCache.top.hiddenCourses) || [];
    return Array.isArray(list) ? list.slice() : [];
  }

  function hiddenSet() {
    return new Set(hiddenList());
  }

  function isCourseHidden(href) {
    return href ? hiddenSet().has(href) : false;
  }

  function courseNameOf(li) {
    const a = li.querySelector('a[href]');
    if (!a) return '';
    const t = (a.getAttribute('title') || a.textContent || '').trim();
    return t.replace(/\s+/g, ' ');
  }

  function saveHidden(arr) {
    const next = Array.from(new Set(arr.filter(Boolean)));
    if (settingsCache) settingsCache.top.hiddenCourses = next;
    save({ top: { hiddenCourses: next } });
  }

  /**
   * 非表示の li は inline style で display:none にする。
   * （CSS で隠すと LETUS 側のスタイルを上書きすることになるため）
   */
  function applyVisibility(ul) {
    if (!ul) return 0;
    const hidden = hiddenSet();
    let count = 0;
    for (const li of ul.children) {
      if (!li.classList.contains('la-item')) continue;
      if (hidden.has(T.courseHrefOf(li))) {
        count++;
        li.classList.add('la-hidden');
        li.style.display = 'none';
      } else {
        li.classList.remove('la-hidden');
        li.style.removeProperty('display');
      }
    }
    renderHiddenPanel(ul, hidden);
    return count;
  }

  /** 非表示にしたコースの管理リスト（名前つき） */
  function renderHiddenPanel(ul, hidden) {
    const list = T.hiddenPanelOf(ul);
    if (!list) return;
    const set = hidden || hiddenSet();
    const summary = list.querySelector('.la-hidden-summary');
    const items = list.querySelector('.la-hidden-items');
    const note = list.querySelector('.la-hidden-note');
    if (!items) return;

    items.textContent = '';
    let n = 0;
    for (const li of ul.children) {
      if (!li.classList.contains('la-item')) continue;
      const href = T.courseHrefOf(li);
      if (!set.has(href)) continue;
      n++;

      const row = D.createElement('li');
      row.className = 'la-hidden-row';

      const a = li.querySelector('a[href]');
      const icon = a && a.querySelector('i.icon');
      if (icon) {
        const i = D.createElement('i');
        i.className = icon.className;
        i.setAttribute('aria-hidden', 'true');
        row.appendChild(i);
      }

      const name = D.createElement('span');
      name.className = 'la-hidden-name';
      name.textContent = courseNameOf(li);
      row.appendChild(name);

      const back = D.createElement('button');
      back.type = 'button';
      back.className = 'la-mini la-restore';
      back.textContent = '表示に戻す';
      back.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setCourseHidden(href, false, { name: name.textContent });
      });
      row.appendChild(back);
      items.appendChild(row);
    }

    if (summary) summary.textContent = n ? '非表示のコース（' + n + '）' : '非表示のコース';
    if (note) note.textContent = n ? '一覧から隠しているコースです。' : '';
    list.hidden = n === 0;
    if (n === 0 && list.open) list.open = false;
  }

  /**
   * 非表示の切り替え（トーストで元に戻せる）
   * @param {string} href
   * @param {boolean} on
   * @param {{name?:string, toast?:boolean}} [opts]
   */
  function setCourseHidden(href, on, opts) {
    if (!href) return;
    const o = opts || {};
    const set = hiddenSet();
    const was = set.has(href);
    if (on) set.add(href);
    else set.delete(href);

    saveHidden(Array.from(set));

    const ul = T.courseListOf(T.coursesBlock());
    applyVisibility(ul);
    applyStriping(ul);
    if (onChange) onChange();

    if (o.toast !== false && was !== !!on) {
      const nm = o.name || '';
      if (g.LA_TOAST) {
        g.LA_TOAST.show({
          text: nm ? '<b>' + escapeHtml(nm) + '</b> を' + (on ? '非表示にしました' : '表示に戻しました')
            : (on ? '非表示にしました' : '表示に戻しました'),
          actionLabel: '元に戻す',
          onAction: () => setCourseHidden(href, was, { name: nm, toast: false })
        });
      }
    }
  }

  function unhideAll() {
    if (!hiddenList().length) return;
    saveHidden([]);
    const ul = T.courseListOf(T.coursesBlock());
    applyVisibility(ul);
    applyStriping(ul);
    if (onChange) onChange();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  /** 一覧の下に「非表示のコース」管理パネルを作る */
  function ensureHiddenPanel() {
    const block = T.coursesBlock();
    const ul = T.courseListOf(block);
    if (!block || !ul) return null;
    const existing = T.hiddenPanelOf(ul);
    if (existing) return existing;

    const list = D.createElement('details');
    list.className = 'la-hidden-list';
    list.hidden = true;

    const summary = D.createElement('summary');
    summary.className = 'la-hidden-summary';
    summary.textContent = '非表示のコース';

    const body = D.createElement('div');
    body.className = 'la-hidden-body';
    const note = D.createElement('p');
    note.className = 'la-hidden-note';
    const items = D.createElement('ul');
    items.className = 'la-hidden-items';
    const all = D.createElement('button');
    all.type = 'button';
    all.className = 'la-mini la-unhide-all';
    all.textContent = 'すべて表示する';
    all.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      unhideAll();
      if (g.LA_TOAST) g.LA_TOAST.show({ text: '非表示のコースをすべて表示に戻しました', ms: 4000 });
    });
    body.append(note, items, all);
    list.append(summary, body);
    ul.parentNode.insertBefore(list, ul.nextSibling);
    return list;
  }

  /* ------------------------------------------------------------- 並べ替え */

  function visibleItems(ul) {
    return Array.from(ul.children).filter(
      (li) => li.classList.contains('la-item') && li.style.display !== 'none'
    );
  }

  function dragAfter(container, y, selector) {
    const els = Array.from(container.querySelectorAll(':scope > ' + selector))
      .filter((e) => e.style.display !== 'none');
    let best = null;
    let bestOffset = Number.NEGATIVE_INFINITY;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const off = y - r.top - r.height / 2;
      if (off < 0 && off > bestOffset) {
        bestOffset = off;
        best = el;
      }
    }
    return best;
  }

  /** 表示中の要素だけを上下に動かす（li.la-item なら同級のみを対象にする） */
  function moveBy(node, delta) {
    const parent = node.parentNode;
    const kids = (node.classList && node.classList.contains('la-item'))
      ? visibleItems(parent)
      : Array.from(parent.children);
    const i = kids.indexOf(node);
    const j = i + delta;
    if (j < 0 || j >= kids.length) return false;
    if (delta < 0) parent.insertBefore(node, kids[j]);
    else parent.insertBefore(kids[j], node);
    return true;
  }

  /* ------------------------------------------------------------- コース一覧 */

  /**
   * 交互の背景。LETUS 自身の .r0/.r1 は書き換えず、拡張専用の .la-r0/.la-r1 を付ける。
   * 非表示の項目は縞の計算から除外する。
   */
  function applyStriping(ul) {
    if (!ul) return;
    let i = 0;
    for (const li of ul.children) {
      if (!li.classList.contains('la-item')) continue;
      if (li.style.display === 'none') {
        li.classList.remove('la-r0', 'la-r1');
        continue;
      }
      li.classList.toggle('la-r0', i % 2 === 0);
      li.classList.toggle('la-r1', i % 2 === 1);
      i++;
    }
  }

  function makeControls(li) {
    const bar = D.createElement('span');
    bar.className = 'la-itembar';

    const grip = D.createElement('span');
    grip.className = 'la-grip';
    grip.textContent = '\u283F';
    grip.title = 'ドラッグで並べ替え';
    grip.draggable = true;

    const up = D.createElement('button');
    up.type = 'button'; up.className = 'la-mini'; up.textContent = '\u25B2'; up.title = '上へ';
    const down = D.createElement('button');
    down.type = 'button'; down.className = 'la-mini'; down.textContent = '\u25BC'; down.title = '下へ';

    const cog = D.createElement('button');
    cog.type = 'button'; cog.className = 'la-mini la-cog'; cog.textContent = '\u2699';
    cog.title = 'このコースの設定（色・アイコン・非表示）';

    bar.append(grip, up, down, cog);
    li.classList.add('la-item');
    li.insertBefore(bar, li.firstChild);

    up.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (moveBy(li, -1)) { applyStriping(li.parentNode); saveCourseOrder(li.parentNode); }
    });
    down.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (moveBy(li, 1)) { applyStriping(li.parentNode); saveCourseOrder(li.parentNode); }
    });
    cog.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (g.LA_COURSE_SETTINGS) g.LA_COURSE_SETTINGS.open(li);
    });
  }

  function ensureItemControls() {
    const ul = T.courseListOf(T.coursesBlock());
    if (!ul) return;
    for (const li of ul.children) {
      if (!li.classList.contains('la-item')) makeControls(li);
    }
    ensureHiddenPanel();
    applyVisibility(ul);
    applyStriping(ul);
  }

  function saveCourseOrder(ul) {
    const order = Array.from(ul.children)
      .map((li) => T.courseHrefOf(li))
      .filter(Boolean);
    save({ top: { courseOrder: order } });
  }

  function refreshCourseItems() {
    const ul = T.courseListOf(T.coursesBlock());
    if (!ul) return;
    ensureItemControls();
    applyVisibility(ul);
    applyStriping(ul);
  }

  function bindCourseDnD() {
    const block = T.coursesBlock();
    const ul = T.courseListOf(block);
    if (!ul || ul.dataset.laDnd === '1') return;
    ul.dataset.laDnd = '1';

    ul.addEventListener('dragstart', (e) => {
      const grip = e.target.closest('.la-grip');
      const li = grip && e.target.closest('li.la-item');
      if (!li || li.style.display === 'none') { e.preventDefault(); return; }
      li.classList.add('la-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', T.courseHrefOf(li)); } catch (_) {}
    });

    ul.addEventListener('dragover', (e) => {
      const dragging = ul.querySelector('li.la-dragging');
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const after = dragAfter(ul, e.clientY, 'li.la-item');
      if (after == null) {
        const last = visibleItems(ul).pop();
        if (last && last !== dragging) ul.insertBefore(dragging, last.nextSibling);
        else ul.appendChild(dragging);
      } else if (after !== dragging) {
        ul.insertBefore(dragging, after);
      }
    });

    ul.addEventListener('drop', (e) => e.preventDefault());

    ul.addEventListener('dragend', () => {
      const dragging = ul.querySelector('li.la-dragging');
      if (dragging) dragging.classList.remove('la-dragging');
      applyVisibility(ul);
      applyStriping(ul);
      saveCourseOrder(ul);
    });
  }

  /* ------------------------------------------------------- ブロックスロット */

  function saveSlotOrder(parent) {
    const keys = Array.from(parent.querySelectorAll(':scope > .la-slot'))
      .map((s) => s.dataset.laSlot);
    if (!keys.length) return;
    save({ top: { order: keys } });
  }

  function bindSlotDnD() {
    if (D.body.dataset.laSlotDnd === '1') return;
    D.body.dataset.laSlotDnd = '1';

    D.addEventListener('dragstart', (e) => {
      const grip = e.target.closest('.la-slotbar .la-grip');
      const slot = grip && e.target.closest('.la-slot');
      if (!slot) return;
      slot.classList.add('la-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', slot.dataset.laSlot); } catch (_) {}
    });

    D.addEventListener('dragover', (e) => {
      const slot = D.querySelector('.la-slot.la-dragging');
      if (!slot) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const parent = slot.parentNode;
      if (!parent) return;
      const after = dragAfter(parent, e.clientY, '.la-slot');
      if (after == null) parent.appendChild(slot);
      else if (after !== slot) parent.insertBefore(slot, after);
    });

    D.addEventListener('drop', (e) => e.preventDefault());

    D.addEventListener('dragend', () => {
      const slot = D.querySelector('.la-slot.la-dragging');
      if (!slot) return;
      slot.classList.remove('la-dragging');
      if (slot.parentNode) saveSlotOrder(slot.parentNode);
    });
  }

  function bindSlotButtons() {
    if (D.body.dataset.laSlotBtn === '1') return;
    D.body.dataset.laSlotBtn = '1';

    D.addEventListener('click', (e) => {
      const up = e.target.closest('.la-slotbar .la-mini');
      if (!up) return;
      const bar = up.parentNode;
      const slot = bar.parentNode;
      const isUp = up.textContent === '\u25B2';
      const isToggle = up.classList.contains('la-edit-toggle');
      const isCfg = up.classList.contains('la-open-options');

      if (isCfg) {
        e.preventDefault(); e.stopPropagation();
        chrome.runtime.sendMessage({ type: 'openOptions' });
        return;
      }
      e.preventDefault(); e.stopPropagation();
      if (isToggle) {
        const on = D.body.classList.toggle('la-edit');
        if (on !== settingsCache.ui.editMode) {
          save({ ui: { editMode: on } });
          if (settingsCache) settingsCache.ui.editMode = on;
        }
        up.textContent = on ? '並べ替え中' : '並べ替え';
        return;
      }
      if (moveBy(slot, isUp ? -1 : 1) && slot.parentNode) saveSlotOrder(slot.parentNode);
      if (onChange) onChange();
    });
  }

  function applyAll(s) {
    settingsCache = s;
    D.body.classList.toggle('la-edit', !!s.ui.editMode);
    for (const slot of D.querySelectorAll('.la-slot')) {
      const btn = slot.laToggle;
      if (btn) btn.textContent = s.ui.editMode ? '並べ替え中' : '並べ替え';
      // もう一方のブロックが同じ親にない場合（別カラム）は上下移動できない
      const siblingCount = slot.parentNode
        ? slot.parentNode.querySelectorAll(':scope > .la-slot').length
        : 1;
      const canOrder = siblingCount > 1;
      if (slot.laUp) slot.laUp.hidden = !canOrder;
      if (slot.laDown) slot.laDown.hidden = !canOrder;
      if (slot.laGrip) slot.laGrip.hidden = !canOrder;
    }
    ensureItemControls();
    bindCourseDnD();
    bindSlotDnD();
    bindSlotButtons();
    refreshCourseItems();
  }

  g.LA_TOP.applySorting = applyAll;
  g.LA_TOP.setSavers = function (saveFn, changeFn) {
    save = saveFn;
    onChange = changeFn;
  };
  g.LA_TOP.unhideAllCourses = function () {
    if (save) unhideAll();
  };
  // コース個別設定ダイアログから使う API
  g.LA_TOP.isCourseHidden = isCourseHidden;
  g.LA_TOP.setCourseHidden = setCourseHidden;
  g.LA_TOP.courseNameOf = courseNameOf;
  g.LA_TOP.refreshCourses = function () {
    refreshCourseItems();
  };
})(window);
