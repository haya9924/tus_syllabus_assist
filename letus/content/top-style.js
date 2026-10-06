/* LETUS Assist - トップページ: 外観（文字サイズ・色・アイコン） */
(function (g) {
  'use strict';

  const T = g.LA_TOP;
  const D = T.D;

  /** #rgb / #rrggbb / #rrggbbaa を暗くする（個別色のホバー用） */
  function darken(hex, factor) {
    const f = factor === undefined ? 0.82 : factor;
    if (typeof hex !== 'string') return hex;
    let h = hex.trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return hex;
    const to = (i) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) * f)));
    const p = (n) => n.toString(16).padStart(2, '0');
    const alpha = h.length === 8 ? h.slice(6, 8) : '';
    return '#' + p(to(0)) + p(to(2)) + p(to(4)) + alpha;
  }

  function setIcon(node, cls, title) {
    let i = node.querySelector(':scope > i.icon');
    if (!i) {
      i = D.createElement('i');
      node.insertBefore(i, node.firstChild);
    }
    i.className = 'icon fa ' + cls + ' fa-fw';
    if (title) {
      i.setAttribute('title', title);
      i.setAttribute('aria-label', title);
    } else {
      i.removeAttribute('title');
      i.removeAttribute('aria-label');
    }
    i.setAttribute('role', 'img');
    return i;
  }

  function removeIcon(node) {
    const i = node.querySelector(':scope > i.icon');
    if (i) i.remove();
  }

  function setText(node, text) {
    if (node.textContent.trim() === text) return;
    const frag = D.createDocumentFragment();
    const i = node.querySelector(':scope > i.icon');
    if (i) frag.appendChild(i);
    frag.appendChild(D.createTextNode(text));
    node.textContent = '';
    node.appendChild(frag);
  }

  function styleCourses(s) {
    const t = s.top;
    const styles = (t.courseStyles && typeof t.courseStyles === 'object') ? t.courseStyles : {};
    const block = T.coursesBlock();
    if (!block) return;
    const slot = T.slotFor('mycourses');
    if (slot) {
      slot.laLabel.textContent = t.courseHeaderText;
      slot.style.setProperty('--la-hover', t.courseHoverColor);
      slot.style.setProperty('--la-accent', t.courseAccent);
    }

    const header = block.querySelector('h3.card-title, h2.card-title, h3');
    if (header) {
      if (t.courseHeaderIcon) setIcon(header, t.courseHeaderIcon, t.courseHeaderText);
      else removeIcon(header);
      setText(header, t.courseHeaderText);
      header.style.fontSize = t.courseHeaderFontSize + 'px';
      header.style.color = t.courseHeaderColor;
      header.style.fontWeight = '700';
    }

    const ul = T.courseListOf(block);
    if (!ul) return;
    ul.style.fontSize = t.courseFontSize + 'px';
    if (t.courseColumns > 1) {
      ul.style.display = 'grid';
      ul.style.gridTemplateColumns = 'repeat(' + t.courseColumns + ', minmax(0, 1fr))';
      ul.style.columnGap = '1em';
      ul.style.rowGap = '0';
    } else {
      ul.style.display = '';
      ul.style.gridTemplateColumns = '';
    }

    for (const li of ul.children) {
      const a = li.querySelector('.column > a') || li.querySelector('a');
      if (!a) continue;
      const st = styles[T.courseHrefOf(li)] || null;
      const icon = (st && st.icon) || t.courseIcon;
      const color = (st && st.color) || t.courseTextColor;

      if (icon) setIcon(a, icon, 'コース');
      else removeIcon(a);

      a.style.color = color;
      a.style.fontSize = t.courseFontSize + 'px';
      a.style.lineHeight = '1.7';

      // 個別色のときは、その色を暗くしたものをホバー色にする
      if (st && st.color) li.style.setProperty('--la-hover', darken(st.color, 0.82));
      else li.style.removeProperty('--la-hover');
    }
    block.style.background = t.courseBgColor;
  }

  function styleNews(s) {
    const t = s.top;
    const news = T.newsForum();
    if (!news) return;
    const slot = T.slotFor('sitenews');
    if (slot) {
      slot.laLabel.textContent = t.newsHeaderText;
      slot.style.setProperty('--la-hover', t.newsHeaderColor);
    }
    const header = news.querySelector('h2, h3');
    if (header) {
      if (t.newsHeaderIcon) setIcon(header, t.newsHeaderIcon, t.newsHeaderText);
      setText(header, t.newsHeaderText);
      header.style.fontSize = t.newsHeaderFontSize + 'px';
      header.style.color = t.newsHeaderColor;
      header.style.fontWeight = '700';
    }
    news.style.fontSize = t.newsFontSize + 'px';
    news.style.color = t.newsTextColor;
  }

  g.LA_TOP.applyStyle = function (s) {
    styleCourses(s);
    styleNews(s);
  };
  g.LA_TOP.darken = darken;
})(window);
