/* LETUS Assist - コースごとの ⚙ 設定ダイアログ（色・アイコン・非表示）
 * Shadow DOM の <dialog> なので LETUS の CSS と干渉しない。
 */
(function (g) {
  'use strict';

  const D = document;
  const HOST_ID = 'la-course-dialog-host';

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
dialog {
  pointer-events: auto;
  /* UA の margin:auto を * リセットで潰してしまうため明示的に戻す（中央寄せ） */
  margin: auto;
  border: 0;
  border-radius: 12px;
  padding: 0;
  width: min(460px, 92vw);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  color: #0f172a;
  font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  box-shadow: 0 20px 60px rgba(0,0,0,.35);
}
dialog::backdrop { background: rgba(15, 23, 42, .55); backdrop-filter: blur(2px); }
.head { padding: 16px 18px 12px; border-bottom: 1px solid #e2e8f0; }
.head .t { font-size: 15px; font-weight: 800; color: #0f766e; }
.head .s { font-size: 13px; color: #475569; word-break: break-word; }
.body { padding: 14px 18px; display: grid; gap: 14px; }

.prev {
  display: flex; align-items: center; gap: .5em;
  padding: 10px 12px; border-radius: 8px;
  background: #f8fafc; border: 1px dashed #cbd5e1;
  font-size: 15px; font-weight: 600;
  word-break: break-word;
}
.prev i { font-style: normal; }
.prev .pname { color: #0f766e; }

.row { display: grid; gap: 6px; }
.row > .lbl { font-size: 12px; font-weight: 700; color: #64748b; }
.ctl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
input[type="color"] {
  width: 46px; height: 32px; padding: 2px;
  border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; cursor: pointer;
}
select, input[type="text"] {
  font: inherit; font-size: 13px; padding: 5px 8px;
  border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #0f172a;
}
input[type="text"] { width: 150px; }
select { min-width: 170px; }
.chk { display: flex; align-items: center; gap: .5em; font-size: 14px; }
.chk input { width: 16px; height: 16px; }
.linkbtn {
  font: inherit; font-size: 12px; color: #0369a1;
  background: none; border: 0; cursor: pointer; text-decoration: underline; padding: 2px 0;
}
.note { font-size: 12px; color: #94a3b8; }

.foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px 16px; border-top: 1px solid #e2e8f0;
}
.foot .spacer { flex: 1; }
.btn {
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 7px 16px; border-radius: 8px; cursor: pointer;
  border: 1px solid #cbd5e1; background: #fff; color: #0f172a;
}
.btn:hover { background: #f1f5f9; }
.btn.primary { background: #0f766e; border-color: #0f766e; color: #fff; }
.btn.primary:hover { background: #0d635c; }
.btn.danger { border-color: #fca5a5; color: #b91c1c; }
.btn.danger:hover { background: #fef2f2; }
`;

  let host = null;
  let refs = null;
  let ctx = null;
  let saveTimer = 0;

  function currentStyle(href) {
    const s = ctx.settings;
    const map = (s && s.top && s.top.courseStyles) || {};
    return map[href] || {};
  }

  function queueSave(patch) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      g.LA.patchCourseStyle(ctx.href, patch).then(() => {
        if (g.LA_TOAST) return;
      });
    }, 200);
  }

  function applyPreview() {
    const st = currentStyle(ctx.href);
    const color = st.color || ctx.globalColor;
    const icon = st.icon || ctx.globalIcon;
    refs.preview.style.color = color;
    refs.previewIcon.className = 'icon fa ' + (icon || 'fa-circle') + ' fa-fw';
    refs.previewIcon.style.display = icon ? '' : 'none';
    refs.preview.style.setProperty('--h', g.LA_TOP.darken ? g.LA_TOP.darken(color, 0.82) : color);
  }

  function syncControls() {
    const st = currentStyle(ctx.href);
    refs.color.value = st.color || ctx.globalColor || '#0f766e';
    const icon = st.icon || '';
    refs.iconText.value = icon;
    refs.iconSel.value = (icon && g.LA_ICON_FLAT.indexOf(icon) >= 0) ? icon : (icon ? '__custom__' : '');
    refs.hide.checked = g.LA_TOP.isCourseHidden(ctx.href);
    applyPreview();
  }

  function fillIcons() {
    const none = D.createElement('option');
    none.value = '';
    none.textContent = '— 全体設定を使う —';
    refs.iconSel.appendChild(none);
    for (const grp of (g.LA_ICONS || [])) {
      const og = D.createElement('optgroup');
      og.label = grp.group;
      for (const cls of grp.items) {
        const o = D.createElement('option');
        o.value = cls;
        o.textContent = cls.replace(/^fa-/, '');
        og.appendChild(o);
      }
      refs.iconSel.appendChild(og);
    }
    const custom = D.createElement('option');
    custom.value = '__custom__';
    custom.textContent = 'その他（右の入力欄）';
    refs.iconSel.appendChild(custom);
  }

  function build() {
    host = D.createElement('div');
    host.id = HOST_ID;
    // ホストは透明な全画面レイヤー（<dialog> は top layer に出るので位置指定には影響しない）
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483500;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    const style = D.createElement('style');
    style.textContent = CSS;

    const dlg = D.createElement('dialog');

    const head = D.createElement('div');
    head.className = 'head';
    const t = D.createElement('div'); t.className = 't'; t.textContent = 'コースの設定';
    const s = D.createElement('div'); s.className = 's';
    head.append(t, s);

    const body = D.createElement('div');
    body.className = 'body';

    const preview = D.createElement('div');
    preview.className = 'prev';
    const previewIcon = D.createElement('i');
    const previewName = D.createElement('span');
    previewName.className = 'pname';
    preview.append(previewIcon, previewName);

    // 文字色
    const rowColor = D.createElement('div'); rowColor.className = 'row';
    const lc = D.createElement('div'); lc.className = 'lbl'; lc.textContent = '文字色';
    const cc = D.createElement('div'); cc.className = 'ctl';
    const color = D.createElement('input'); color.type = 'color';
    const resetColor = D.createElement('button');
    resetColor.type = 'button'; resetColor.className = 'linkbtn'; resetColor.textContent = '全体設定に戻す';
    cc.append(color, resetColor);
    rowColor.append(lc, cc);

    // アイコン
    const rowIcon = D.createElement('div'); rowIcon.className = 'row';
    const li = D.createElement('div'); li.className = 'lbl'; li.textContent = 'アイコン';
    const ci = D.createElement('div'); ci.className = 'ctl';
    const iconSel = D.createElement('select');
    const iconText = D.createElement('input'); iconText.type = 'text'; iconText.placeholder = 'fa-flask';
    ci.append(iconSel, iconText);
    const inote = D.createElement('div'); inote.className = 'note';
    inote.textContent = 'Font Awesome のクラス名を直接入力しても構いません。';
    rowIcon.append(li, ci, inote);

    // 非表示
    const rowHide = D.createElement('div'); rowHide.className = 'row';
    const lh = D.createElement('div'); lh.className = 'lbl'; lh.textContent = '表示';
    const chk = D.createElement('label'); chk.className = 'chk';
    const hide = D.createElement('input'); hide.type = 'checkbox';
    const hideLabel = D.createElement('span'); hideLabel.textContent = 'このコースを一覧から隠す';
    chk.append(hide, hideLabel);
    rowHide.append(lh, chk);

    body.append(preview, rowColor, rowIcon, rowHide);

    const foot = D.createElement('div');
    foot.className = 'foot';
    const clear = D.createElement('button');
    clear.type = 'button'; clear.className = 'btn danger'; clear.textContent = 'このコースの設定を解除';
    const spacer = D.createElement('div'); spacer.className = 'spacer';
    const done = D.createElement('button');
    done.type = 'button'; done.className = 'btn primary'; done.textContent = '閉じる';
    foot.append(clear, spacer, done);

    dlg.append(head, body, foot);
    root.append(style, dlg);

    refs = {
      dlg, sub: s, preview, previewIcon, previewName,
      color, resetColor, iconSel, iconText, hide, clear, done
    };

    // 文字色
    color.addEventListener('input', () => {
      const st = currentStyle(ctx.href);
      if (ctx.settings) {
        ctx.settings.top.courseStyles = Object.assign({}, ctx.settings.top.courseStyles,
          { [ctx.href]: Object.assign({}, st, { color: color.value, name: ctx.name }) });
      }
      applyPreview();
      queueSave({ color: color.value, name: ctx.name });
    });
    resetColor.addEventListener('click', () => {
      const st = currentStyle(ctx.href);
      if (ctx.settings) {
        const e = Object.assign({}, st); delete e.color;
        const map = Object.assign({}, ctx.settings.top.courseStyles);
        if (e.icon) map[ctx.href] = e; else delete map[ctx.href];
        ctx.settings.top.courseStyles = map;
      }
      color.value = ctx.globalColor || '#0f766e';
      applyPreview();
      queueSave({ color: null });
    });

    // アイコン
    iconSel.addEventListener('change', () => {
      if (iconSel.value === '__custom__') { iconText.focus(); return; }
      iconText.value = iconSel.value;
      const st = currentStyle(ctx.href);
      if (ctx.settings) {
        ctx.settings.top.courseStyles = Object.assign({}, ctx.settings.top.courseStyles,
          { [ctx.href]: Object.assign({}, st, { icon: iconSel.value, name: ctx.name }) });
      }
      applyPreview();
      queueSave({ icon: iconSel.value, name: ctx.name });
    });
    iconText.addEventListener('input', () => {
      const v = iconText.value.trim();
      iconSel.value = (v && g.LA_ICON_FLAT.indexOf(v) >= 0) ? v : (v ? '__custom__' : '');
      const st = currentStyle(ctx.href);
      if (ctx.settings) {
        const e = Object.assign({}, st);
        if (v) e.icon = v; else delete e.icon;
        e.name = ctx.name;
        const map = Object.assign({}, ctx.settings.top.courseStyles);
        if (e.icon || e.color) map[ctx.href] = e; else delete map[ctx.href];
        ctx.settings.top.courseStyles = map;
      }
      applyPreview();
      queueSave({ icon: v || null, name: ctx.name });
    });

    // 非表示
    hide.addEventListener('change', () => {
      // 誤操作に備えてトースト（元に戻す）も出す
      g.LA_TOP.setCourseHidden(ctx.href, hide.checked, { name: ctx.name });
    });

    // 設定解除
    clear.addEventListener('click', () => {
      g.LA.patchCourseStyle(ctx.href, null).then(() => {
        g.LA.getSettings().then((s2) => {
          ctx.settings = s2;
          syncControls();
        });
      });
      if (g.LA_TOAST) g.LA_TOAST.show({ text: 'このコースの個別設定を解除しました', ms: 4000 });
    });

    done.addEventListener('click', close);

    // 背景クリックで閉じる
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) close();
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });

    return host;
  }

  function close() {
    if (!refs) return;
    clearTimeout(saveTimer);
    const d = refs.dlg;
    try { d.close(); } catch (e) { /* ignore */ }
    const h = host;
    setTimeout(() => { if (h && h.parentNode) h.parentNode.removeChild(h); }, 120);
    host = null;
    refs = null;
    ctx = null;
  }

  /** li 要素を指定して設定ダイアログを開く */
  function open(li) {
    if (!g.LA || !g.LA_TOP || !li) return;
    const href = g.LA_TOP.courseHrefOf(li);
    if (!href) return;
    if (host) close();

    g.LA.getSettings().then((settings) => {
      ctx = {
        li,
        href,
        name: g.LA_TOP.courseNameOf(li),
        settings,
        globalColor: settings.top.courseTextColor,
        globalIcon: settings.top.courseIcon
      };
      if (!build()) return;
      document.documentElement.appendChild(host);
      fillIcons();
      refs.sub.textContent = ctx.name;
      refs.previewName.textContent = ctx.name;
      syncControls();
      try { refs.dlg.showModal(); } catch (e) { /* ignore */ }
    });
  }

  g.LA_COURSE_SETTINGS = { open, close };
})(window);
