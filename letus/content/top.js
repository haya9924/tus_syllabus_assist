/* LETUS Assist - トップページ bootstrap */
(function () {
  'use strict';

  const T = window.LA_TOP;
  if (!T || !window.LA) return;
  const D = T.D;

  if (!D.getElementById('site-news-forum') || !T.coursesBlock()) return; // トップページのみ

  let settings = null;
  let timer = null;
  let applying = false;

  function restoreCourseOrder(s) {
    const ul = T.courseListOf(T.coursesBlock());
    if (!ul || !s.top.courseOrder || !s.top.courseOrder.length) return;
    const order = s.top.courseOrder;
    const items = Array.from(ul.children);
    const rank = new Map();
    order.forEach((h, i) => { if (!rank.has(h)) rank.set(h, i); });
    const known = [];
    const unknown = [];
    for (const li of items) {
      const h = T.courseHrefOf(li);
      if (rank.has(h)) known.push([rank.get(h), li]);
      else unknown.push(li);
    }
    known.sort((a, b) => a[0] - b[0]);
    const finalList = known.map((x) => x[1]).concat(unknown);
    if (finalList.some((li, i) => li !== items[i])) {
      finalList.forEach((li) => ul.appendChild(li));
    }
  }

  function applyLayout() {
    T.applyLayout(settings);
  }

  function applyStyle() {
    T.applyStyle(settings);
    T.applySorting(settings);
  }

  /** ドラッグ/並べ替え中は DOM を触らない（操作を邪魔しない） */
  function busy() {
    return D.querySelector('.la-dragging') !== null || D.body.classList.contains('la-busy-sort');
  }

  function apply() {
    if (applying || !settings || busy()) return;
    applying = true;
    try {
      applyLayout();
      applyStyle();
      restoreCourseOrder(settings);
    } finally {
      applying = false;
    }
  }

  /**
   * MutationObserver のコールバック。
   * Moodle の YUI が id を付けたり非同期でブロックを描画したりするたびに発火するため、
   * ここでは「見た目」と「順序の復元」だけを行い、レイアウトは傷んでいない限り触らない。
   */
  function ensure() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (busy() || !settings) return;

      // ブロックが消えた（別ページへ遷移した）場合はスロットを片付ける
      if (!D.getElementById('site-news-forum') || !T.coursesBlock()) {
        T.removeSlot('mycourses');
        T.removeSlot('sitenews');
        T.removeAnchor('courses');
        T.removeAnchor('news');
        return;
      }

      // レイアウトが崩れていないか検査し、必要なときだけ組み直す
      const cslot = T.slotFor('mycourses');
      const nslot = T.slotFor('sitenews');
      const block = T.coursesBlock();
      const news = D.getElementById('site-news-forum');
      const broken = !cslot || !nslot ||
        !block.closest('.la-slot') || !news.closest('.la-slot') ||
        !T.anchorAlive('courses') || !T.anchorAlive('news');

      if (broken) apply();
      else applyStyle();

      restoreCourseOrder(settings);
    }, 250);
  }

  function save(patch) {
    window.LA.setSettings(patch).then((next) => {
      settings = next;
      T.applyStyle(next);
    });
  }

  // 設定の変更を即時反映（タブの開き直し不要）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[window.LA.STORAGE_KEY]) return;
    window.LA.getSettings().then((s) => {
      settings = s;
      apply();
    });
  });

  window.LA.getSettings().then((s) => {
    settings = s;
    T.setSavers(save, ensure);
    apply();

    const mo = new MutationObserver(ensure);
    mo.observe(D.getElementById('page-content') || D.body, { childList: true, subtree: true });
    window.addEventListener('popstate', ensure);
  });
})();