/* LETUS Assist - トップページ: 共通ユーティリティとブロックスロット生成 */
(function (g) {
  'use strict';

  const D = document;
  const NS = 'la';

  const home = {
    courses: { parent: null, next: null, anchor: null },
    news: { parent: null, next: null, anchor: null }
  };

  function el(tag, cls, text) {
    const n = D.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function coursesBlock() {
    return D.querySelector('section.block_course_list') ||
      D.querySelector('section[data-block="course_list"]');
  }

  function newsForum() {
    return D.getElementById('site-news-forum');
  }

  function newsSkipBefore() {
    const news = newsForum();
    if (!news) return null;
    const p = news.previousElementSibling;
    return p && p.classList.contains('skip-block') ? p : null;
  }

  function newsSkipAfter() {
    const news = newsForum();
    if (!news) return null;
    const n = news.nextElementSibling;
    return n && n.id === 'skipsitenews' ? n : null;
  }

  function courseListOf(block) {
    if (!block) return null;
    return block.querySelector('ul.unlist') || block.querySelector('ul.list');
  }

  function courseHrefOf(li) {
    const a = li.querySelector('a[href*="course/view.php"]') || li.querySelector('a[href]');
    return a ? a.getAttribute('href') : '';
  }

  function courseTitleOf(li) {
    const a = li.querySelector('a[href]');
    return a ? a.textContent.trim() : '';
  }

  /** コース一覧の直後にある「非表示のコース」パネル */
  function hiddenPanelOf(ul) {
    if (!ul || !ul.parentNode) return null;
    const next = ul.nextElementSibling;
    return next && next.classList && next.classList.contains('la-hidden-list') ? next : null;
  }

  function slotFor(key) {
    return D.querySelector('.' + NS + '-slot[data-la-slot="' + key + '"]');
  }

  /**
   * ブロックの「本来の位置」を Anchor 要素で記録する。
   * 兄弟要素が入れ替わったり Moodle が再描画しても、
   * placeholder 自身が残っている限り位置を特定できる。
   */
  function recordAnchor(key, node) {
    const h = home[key];
    if (!node || !node.parentNode) return false;
    if (h.anchor && h.anchor.isConnected) return true;

    const anchor = D.createElement('div');
    anchor.className = NS + '-anchor';
    anchor.dataset.laAnchor = key;
    anchor.setAttribute('aria-hidden', 'true');
    node.parentNode.insertBefore(anchor, node);

    h.parent = node.parentNode;
    h.next = node.nextElementSibling;
    h.anchor = anchor;
    return true;
  }

  function anchorAlive(key) {
    const h = home[key];
    return !!(h.anchor && h.anchor.isConnected && h.anchor.parentNode);
  }

  /**
   * slot をAnchor の位置へ移動する。appendChild は使わない（ホスト末尾に飛んでしまうため）。
   * 冪等: 何回呼んでも同じ結果になる。
   */
  function placeAt(slot, key) {
    if (!slot) return false;
    const h = home[key];
    if (anchorAlive(key)) {
      if (slot.parentNode === h.anchor.parentNode && slot.nextElementSibling === h.anchor) {
        return false;   // すでに正しい位置
      }
      h.anchor.parentNode.insertBefore(slot, h.anchor);
      return true;
    }
    // アンカーが失われた場合の復旧（元の親がまだ生きていればそこで使う）
    if (h.parent && h.parent.isConnected) {
      if (h.next && h.next.parentNode === h.parent) h.parent.insertBefore(slot, h.next);
      else h.parent.appendChild(slot);
      return true;
    }
    return false;
  }

  function removeAnchor(key) {
    const h = home[key];
    if (h.anchor && h.anchor.isConnected) h.anchor.remove();
    h.parent = null; h.next = null; h.anchor = null;
  }

function createSlot(key, opts) {
    const o = opts || {};
    const slot = el('div', NS + '-slot');
    slot.dataset.laSlot = key;

    const bar = el('div', NS + '-slotbar');
    const grip = el('span', NS + '-grip', '⠿');
    grip.title = 'ドラッグで並べ替え';
    grip.draggable = true;

    const up = el('button', NS + '-mini', '▲');
    up.type = 'button'; up.title = '上へ';
    const down = el('button', NS + '-mini', '▼');
    down.type = 'button'; down.title = '下へ';
    const label = el('span', NS + '-slotlabel', o.label || '');
    const toggle = el('button', NS + '-mini la-edit-toggle', '並べ替え');
    toggle.type = 'button';
    toggle.title = '並べ替えモードの ON / OFF';
    const cfg = el('button', NS + '-mini la-open-options', '⚙');
    cfg.type = 'button'; cfg.title = 'LETUS Assist の設定を開く';

    bar.append(grip, up, down, label, toggle, cfg);
    slot.appendChild(bar);
    slot.laLabel = label;
    slot.laUp = up;
    slot.laDown = down;
    slot.laGrip = grip;
    slot.laToggle = toggle;
    slot.laCfg = cfg;
    return slot;
  }

  function removeSlot(key) {
    const s = slotFor(key);
    if (s) s.remove();
  }

  g.LA_TOP = {
    D, NS, home, el,
    coursesBlock, newsForum, newsSkipBefore, newsSkipAfter,
    courseListOf, courseHrefOf, courseTitleOf, hiddenPanelOf,
    slotFor, createSlot, removeSlot,
    recordAnchor, anchorAlive, placeAt, removeAnchor
  };
})(window);
