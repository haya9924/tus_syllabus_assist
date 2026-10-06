/* LETUS Assist - トップページ: レイアウト（サイトニュース と マイコース の位置入れ替え） */
(function (g) {
  'use strict';

  const T = g.LA_TOP;
  const D = T.D;

  /** ブロックを .la-slot に入れ、元の位置に anchor を残す */
  function wrap(slotKey, homeKey, findBlock, label) {
    const block = findBlock();
    if (!block) return null;

    // 既にスロット化済み
    const existing = block.closest('.la-slot');
    if (existing) {
      if (!T.anchorAlive(homeKey)) {
        // anchor を失った場合は現在の親から記録し直す（消えていれば記録されない）
        T.recordAnchor(homeKey, existing);
      }
      return existing;
    }

    let slot = T.slotFor(slotKey);
    if (!slot) {
      slot = T.createSlot(slotKey, { label: label });
      D.body.appendChild(slot);
    }
    T.recordAnchor(homeKey, block);
    slot.appendChild(block);
    return slot;
  }

  function wrapCourses() {
    return wrap('mycourses', 'courses', T.coursesBlock, 'マイコース');
  }

  function wrapNews() {
    const slot = wrap('sitenews', 'news', T.newsForum, 'サイトニュース');
    if (slot) {
      // スキップリンク（前後）も一緒にスロットへ移す
      for (const n of [T.newsSkipBefore(), T.newsSkipAfter()]) {
        if (n && n.parentNode !== slot) slot.insertBefore(n, slot.firstChild.nextSibling);
      }
    }
    return slot;
  }

  /** サイトニュースを <details> で折りたためる（サイドバーで高さ/幅が潰れないように） */
  function setNewsCollapsed(on) {
    const news = T.newsForum();
    if (!news) return;
    const existing = news.querySelector(':scope > details.la-news');
    if (on && !existing) {
      const h = news.querySelector(':scope > h2');
      const details = D.createElement('details');
      details.className = 'la-news';
      const summary = D.createElement('summary');
      summary.className = 'la-news-summary';
      if (h) summary.appendChild(h);
      else summary.textContent = 'サイトニュース';
      const body = D.createElement('div');
      body.className = 'la-news-body';
      for (const child of Array.from(news.children)) {
        if (child !== h) body.appendChild(child);
      }
      details.append(summary, body);
      news.appendChild(details);
    } else if (!on && existing) {
      const h = existing.querySelector('h2');
      if (h) existing.parentNode.insertBefore(h, existing);
      const body = existing.querySelector('.la-news-body');
      while (body && body.firstChild) {
        existing.parentNode.insertBefore(body.firstChild, existing);
      }
      existing.remove();
    }
  }

  /**
   * 冪等なレイアウト適用。
   * すべて「記録済み anchor の直前に挿入」だけで行うので、何回呼んでも結果が変わらない。
   */
  function applyLayout(settings) {
    const cslot = wrapCourses();
    const nslot = wrapNews();
    if (!cslot || !nslot) return;

    const mode = settings.top.mode || 'swap';
    const swap = mode === 'swap';

    const order = settings.top.order || ['mycourses', 'sitenews'];

    nslot.classList.toggle('la-slot-narrow', swap);
    cslot.classList.toggle('la-slot-wide', mode !== 'native');

    if (mode === 'both-main') {
      // 両方メインカラム。サイトニュースの元位置に order の順に並べる。
      // insertBefore は「移動」なので、先頭のスロットを先に置き、
      // 末尾のスロットをその後に置くと order どおりの並びになる。
      const lastKey = order[order.length - 1] === 'sitenews' ? 'sitenews' : 'mycourses';
      const lastSlot = lastKey === 'mycourses' ? cslot : nslot;
      const firstSlot = lastKey === 'mycourses' ? nslot : cslot;
      T.placeAt(firstSlot, 'news');
      T.placeAt(lastSlot, 'news');
      setNewsCollapsed(false);
    } else if (swap) {
      // === 本位の「入れ替え」===
      //   マイコース       → サイトニュースの元位置（メインカラム）
      //   サイトニュース   → マイコースの元位置（左サイドバー）
      T.placeAt(nslot, 'courses');
      T.placeAt(cslot, 'news');
      setNewsCollapsed(!!settings.top.newsCollapsed);
    } else {
      T.placeAt(cslot, 'courses');
      T.placeAt(nslot, 'news');
      setNewsCollapsed(false);
    }

    D.body.classList.toggle('la-native', mode === 'native');
    D.body.classList.toggle('la-swap', swap);
    D.body.classList.toggle('la-bothmain', mode === 'both-main');
  }

  g.LA_TOP.applyLayout = applyLayout;
  g.LA_TOP.setNewsCollapsed = setNewsCollapsed;
})(window);