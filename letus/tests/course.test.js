/* LETUS Assist - コースごとの ⚙ 設定と操作列の改善 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = process.env.LETUS_EXT || path.resolve(__dirname, '..', '..');
const REF = process.env.LETUS_REF || path.resolve(__dirname, '..', '..', '..', 'letus_assist_ref');
const EXE = process.env.CHROME_PATH || path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const ASSETS = path.join(REF, 'LETUS2026');
const MIME = { '.php': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

let fails = 0;
const check = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { fails++; console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const log = (s) => console.log(s);

const DND = (d, t, i, bottom) => {
  const srcs = [...document.querySelectorAll(d)].filter((e) => { const li = e.closest('li, .la-slot'); return !li || li.style.display !== 'none'; });
  const dt = new DataTransfer(); const src = srcs[i];
  const items = [...document.querySelectorAll(t)].filter((e) => e.style.display !== 'none');
  const tg = bottom ? items[items.length - 1] : items[1];
  const r = tg.getBoundingClientRect(); const y = bottom ? r.bottom + 5 : r.top + r.height - 2;
  src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: 0 }));
  tg.parentElement.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
  src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
};

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-course'), {
    executablePath: EXE, headless: true, viewport: { width: 1600, height: 1100 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox', '--disable-gpu']
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await new Promise((r) => setTimeout(r, 1400));
  for (const p of ctx.pages()) await p.close().catch(() => {});

  const getTop = () => sw.evaluate(() => new Promise((r) => chrome.storage.local.get('letusAssist', (x) => r((x.letusAssist && x.letusAssist.top) || null))));
  const setStore = (patch) => sw.evaluate((p) => new Promise((r) => chrome.storage.local.get('letusAssist', (x) => {
    const c = x.letusAssist || {}; c._v = 5;
    for (const k of Object.keys(p)) c[k] = (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) ? Object.assign({}, c[k], p[k]) : p[k];
    chrome.storage.local.set({ letusAssist: c }, () => r(true));
  })), patch);
  const clear = () => sw.evaluate(() => new Promise((r) => chrome.storage.local.clear(r)));

  await ctx.route('https://letus.ed.tus.ac.jp/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/' && route.request().resourceType() === 'document') {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(REF + '/LETUS2026.html', 'utf8') });
      return;
    }
    const m = decodeURIComponent(u.pathname).match(/Home _ LETUS 2026_files\/(.+)$/);
    if (m && fs.existsSync(path.join(ASSETS, m[1]))) {
      await route.fulfill({ status: 200, contentType: MIME[path.extname(m[1])] || 'text/css', body: fs.readFileSync(path.join(ASSETS, m[1])) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'text/plain', body: '' });
  });

  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => { if (!/js_pending|help_popups|yui|requirejs|define/i.test(e.message)) errs.push(e.message); });

  const barInfo = () => p.evaluate(() => {
    const li = document.querySelector('section.block_course_list ul.unlist > li.la-item');
    const bar = li.querySelector('.la-itembar');
    return {
      display: getComputedStyle(bar).display,
      bgVisible: bar.getBoundingClientRect().width > 0,
      buttons: [...bar.querySelectorAll('button')].map((b) => b.textContent),
      hasEye: !!bar.querySelector('.la-eye'),
      hasCog: !!bar.querySelector('.la-cog'),
      hasGrip: !!bar.querySelector('.la-grip'),
      editMode: document.body.classList.contains('la-edit')
    };
  });
  const toggleEdit = () => p.evaluate(() => {
    const btn = [...document.querySelectorAll('.la-slot[data-la-slot="mycourses"] .la-slotbar button')]
      .find((b) => /並べ替え/.test(b.textContent));
    btn.click();
  });
  const firstCourse = () => p.evaluate(() => {
    const li = document.querySelector('section.block_course_list ul.unlist > li.la-item');
    const a = li.querySelector('a[href]');
    return { href: a.getAttribute('href'), name: (a.getAttribute('title') || a.textContent).trim(), color: getComputedStyle(a).color };
  });

  // Shadow DOM 内を操作するヘルパ
  const dlg = {
    exists: () => p.evaluate(() => !!document.getElementById('la-course-dialog-host')),
    open: () => p.evaluate(() => {
      const h = document.getElementById('la-course-dialog-host');
      if (!h || !h.shadowRoot) return null;
      const d = h.shadowRoot.querySelector('dialog');
      const sr = h.shadowRoot;
      const color = sr.querySelector('input[type="color"]');
      const sel = sr.querySelector('select');
      const txt = sr.querySelector('input[type="text"]');
      const hide = sr.querySelector('input[type="checkbox"]');
      const prev = sr.querySelector('.prev');
      return {
        open: d && d.open,
        title: sr.querySelector('.head .t').textContent,
        sub: sr.querySelector('.head .s').textContent,
        color: color.value, iconSel: sel.value, iconText: txt.value, hide: hide.checked,
        previewColor: prev.style.color,
        previewName: sr.querySelector('.prev .pname').textContent,
        clearLabel: sr.querySelector('.foot .danger').textContent
      };
    }),
    setColor: (v) => p.evaluate((val) => {
      const sr = document.getElementById('la-course-dialog-host').shadowRoot;
      const c = sr.querySelector('input[type="color"]');
      c.value = val; c.dispatchEvent(new Event('input', { bubbles: true }));
    }, v),
    resetColor: () => p.evaluate(() => document.getElementById('la-course-dialog-host').shadowRoot.querySelector('.linkbtn').click()),
    setIconText: (v) => p.evaluate((val) => {
      const sr = document.getElementById('la-course-dialog-host').shadowRoot;
      const t = sr.querySelector('input[type="text"]');
      t.value = val; t.dispatchEvent(new Event('input', { bubbles: true }));
    }, v),
    setHide: (on) => p.evaluate((v) => {
      const sr = document.getElementById('la-course-dialog-host').shadowRoot;
      const c = sr.querySelector('input[type="checkbox"]');
      c.checked = v; c.dispatchEvent(new Event('change', { bubbles: true }));
    }, on),
    clearSettings: () => p.evaluate(() => document.getElementById('la-course-dialog-host').shadowRoot.querySelector('.foot .danger').click()),
    close: () => p.evaluate(() => document.getElementById('la-course-dialog-host').shadowRoot.querySelector('dialog').querySelector('.primary').click())
  };
  const toast = () => p.evaluate(() => {
    const h = document.getElementById('la-toast-host');
    if (!h || !h.shadowRoot) return null;
    const sr = h.shadowRoot;
    const box = sr.querySelector('.box');
    return { text: sr.querySelector('.text').textContent, on: box.classList.contains('on'), action: sr.querySelector('.action').textContent };
  });
  const toastClick = () => p.evaluate(() => document.getElementById('la-toast-host').shadowRoot.querySelector('.action').click());

  log('=== 1. 操作列は編集モード時のみ ===');
  await clear();
  await p.goto('https://letus.ed.tus.ac.jp/', { waitUntil: 'load' });
  await p.waitForSelector('.la-slot'); await p.waitForTimeout(1300);
  let b = await barInfo();
  log('  通常: ' + JSON.stringify({ display: b.display, buttons: b.buttons, hasEye: b.hasEye }));
  check('通常は操作列が非表示', b.display === 'none' && !b.bgVisible, b);
  check('●（非表示）ボタンは存在しない', b.hasEye === false);
  await p.hover('section.block_course_list ul.unlist > li.la-item');
  await p.waitForTimeout(300);
  b = await barInfo();
  check('ホバーしても出ない', b.display === 'none' && !b.bgVisible, b);

  await toggleEdit(); await p.waitForTimeout(400);
  b = await barInfo();
  log('  編集モード: ' + JSON.stringify({ display: b.display, buttons: b.buttons }));
  check('編集モードで操作列が出る', b.display !== 'none' && b.bgVisible, b);
  check('ボタンは ⠿▲▼⚙ の4つ', b.hasGrip && b.hasCog && JSON.stringify(b.buttons) === '["▲","▼","⚙"]', b.buttons);
  check('body.la-edit', b.editMode === true);
  // 文字と重なっていないか
  const overlap = await p.evaluate(() => {
    const li = document.querySelector('section.block_course_list ul.unlist > li.la-item');
    const bar = li.querySelector('.la-itembar').getBoundingClientRect();
    const a = li.querySelector('a[href]').getBoundingClientRect();
    return { barRight: Math.round(bar.right), aLeft: Math.round(a.left) };
  });
  check('操作列が文字に重ならない', overlap.barRight <= overlap.aLeft + 1, overlap);
  await p.screenshot({ path: path.join(REF, 'analysis', 'screenshots', 'editmode.png') });

  log('\n=== 2. ⚙ ダイアログ ===');
  const c0 = await firstCourse();
  await p.evaluate(() => document.querySelector('section.block_course_list ul.unlist > li.la-item .la-cog').click());
  await p.waitForSelector('#la-course-dialog-host', { state: 'attached' });
  await p.waitForTimeout(400);
  let d = await dlg.open();
  log('  ' + JSON.stringify({ title: d && d.title, sub: d && d.sub, color: d && d.color, iconText: d && d.iconText, hide: d && d.hide }));
  check('ダイアログが開く', !!(d && d.open));
  check('コース名が見出しに出る', d.sub === c0.name, { got: d.sub, want: c0.name });
  check('文字色の現在値が全体設定', /^#[0-9a-f]{6}$/i.test(d.color), d.color);
  check('非表示チェックは初期 OFF', d.hide === false);
  check('プレビューにコース名', d.previewName === c0.name);
  await p.screenshot({ path: path.join(REF, 'analysis', 'screenshots', 'course-dialog.png') });

  log('\n=== 3. 個別色 ===');
  await dlg.setColor('#e11d48');
  await p.waitForTimeout(800);
  const c1 = await firstCourse();
  check('リンク色が変わる', c1.color === 'rgb(225, 29, 72)', { got: c1.color });
  const hrefC = c1.href;
  let st = await getTop();
  check('storage に保存', st.courseStyles[hrefC] && st.courseStyles[hrefC].color === '#e11d48', st.courseStyles[hrefC]);
  const hoverC = await p.evaluate((h) => {
    const li = [...document.querySelectorAll('li.la-item')].find((x) => (x.querySelector('a[href]') || {}).getAttribute && x.querySelector('a[href]').getAttribute('href') === h);
    return li ? li.style.getPropertyValue('--la-hover') : null;
  }, hrefC);
  check('ホバー色が自動で暗くなる', hoverC === '#b9183b', hoverC);

  log('\n=== 4. 個別アイコン ===');
  await dlg.setIconText('fa-flask');
  await p.waitForTimeout(800);
  const icon = await p.evaluate((h) => {
    const li = [...document.querySelectorAll('li.la-item')].find((x) => x.querySelector('a[href]').getAttribute('href') === h);
    const i = li.querySelector('a[href] i.icon');
    return i ? i.className : null;
  }, hrefC);
  check('アイコンが変わる', /fa-flask/.test(icon || ''), icon);
  st = await getTop();
  check('アイコンも保存', st.courseStyles[hrefC].icon === 'fa-flask', st.courseStyles[hrefC]);
  check('色とアイコンが両立', st.courseStyles[hrefC].color === '#e11d48');

  log('\n=== 5. 非表示（ダイアログ内のみ）===');
  await dlg.setHide(true);
  await p.waitForTimeout(800);
  const hid = await p.evaluate((h) => {
    const li = [...document.querySelectorAll('li.la-item')].find((x) => x.querySelector('a[href]').getAttribute('href') === h);
    const panel = document.querySelector('.la-hidden-list');
    return { display: getComputedStyle(li).display, panelHidden: panel.hidden,
      summary: panel.querySelector('.la-hidden-summary').textContent,
      rows: [...panel.querySelectorAll('.la-hidden-row')].map((r) => r.querySelector('.la-hidden-name').textContent),
      restoreBtn: !!panel.querySelector('.la-restore'), allBtn: !!panel.querySelector('.la-unhide-all') };
  }, hrefC);
  log('  ' + JSON.stringify(hid));
  check('一覧から消える', hid.display === 'none', hid);
  check('パネルに件数と名前が出る', !hid.panelHidden && /非表示のコース（1）/.test(hid.summary) && hid.rows.length === 1, hid);
  check('パネルに「表示に戻す」がある', hid.restoreBtn && hid.allBtn);
  const t = await toast();
  check('トーストに「元に戻す」が出る', !!(t && t.text.includes(c0.name) && t.action === '元に戻す'), t);
  check('トーストの文面', /非表示にしました/.test(t.text), t.text);
  await p.screenshot({ path: path.join(REF, 'analysis', 'screenshots', 'hidden-panel.png') });

  log('\n=== 6. トーストの「元に戻す」 ===');
  await toastClick();
  await p.waitForTimeout(800);
  const back = await p.evaluate((h) => {
    const li = [...document.querySelectorAll('li.la-item')].find((x) => x.querySelector('a[href]').getAttribute('href') === h);
    return { display: getComputedStyle(li).display, hidden: !!document.querySelector('.la-hidden-list:not([hidden])') };
  }, hrefC);
  check('元に戻すで復帰する', back.display !== 'none', back);
  check('件数 0 でパネルが隠れる', await p.evaluate(() => document.querySelector('.la-hidden-list').hidden) === true);

  log('\n=== 7. 全体設定に戻す / 設定解除 ===');
  await dlg.resetColor();
  await p.waitForTimeout(800);
  const c2 = await firstCourse();
  check('文字色が全体設定に戻る', c2.color === 'rgb(15, 118, 110)', c2.color);
  st = await getTop();
  check('アイコンは残っている', st.courseStyles[hrefC] && st.courseStyles[hrefC].icon === 'fa-flask', st.courseStyles[hrefC]);
  await dlg.clearSettings();
  await p.waitForTimeout(900);
  st = await getTop();
  check('「設定を解除」で項目が消える', !st.courseStyles[hrefC], st.courseStyles);
  const iconAfter = await p.evaluate((h) => {
    const li = [...document.querySelectorAll('li.la-item')].find((x) => x.querySelector('a[href]').getAttribute('href') === h);
    return li.querySelector('a[href] i.icon').className;
  }, hrefC);
  check('アイコンも全体設定に戻る', /fa-graduation-cap/.test(iconAfter), iconAfter);
  await dlg.close(); await p.waitForTimeout(400);
  check('閉じるでダイアログが消える', !(await dlg.exists()));

  log('\n=== 8. 永続化（リロード）===');
  await dlg2Color();
  async function dlg2Color() {
    await p.evaluate(() => document.querySelector('section.block_course_list ul.unlist > li.la-item .la-cog').click());
    await p.waitForSelector('#la-course-dialog-host', { state: 'attached' });
    await p.waitForTimeout(350);
    await dlg.setColor('#2563eb');
    await p.waitForTimeout(800);
    await dlg.close();
    await p.waitForTimeout(300);
  }
  await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.la-slot'); await p.waitForTimeout(1300);
  const rel = await firstCourse();
  check('リロード後も個別色が維持', rel.color === 'rgb(37, 99, 235)', rel.color);
  b = await barInfo();
  check('リロード後も編集モードは維持（既定ONのため）', b.editMode === true, b.editMode);
  await toggleEdit(); await p.waitForTimeout(400);
  b = await barInfo();
  check('OFF にすると操作列が消える', b.display === 'none' && b.bgVisible === false, b);

  log('\n=== 9. 回帰（▲▼ / DnD / 反転）===');
  const inv = await p.evaluate(() => {
    const cs = document.querySelector('.la-slot[data-la-slot="mycourses"]');
    return { inMain: !!cs.closest('#region-main'), nsInSide: !!document.querySelector('#block-region-side-pre .la-slot[data-la-slot="sitenews"]') };
  });
  check('反転レイアウトは無傷', inv.inMain && inv.nsInSide, inv);
  const hrefs = () => p.evaluate(() => [...document.querySelectorAll('section.block_course_list ul.unlist > li a')].map((a) => a.getAttribute('href')));
  const h0 = await hrefs();
  await p.evaluate(`(${DND})('li.la-item .la-grip','section.block_course_list ul.unlist > li',0,true)`);
  await p.waitForTimeout(400);
  const h1 = await hrefs();
  check('DnD は編集モードで動作', h1[h1.length - 1] === h0[0], { a: h0.slice(0, 2), b: h1.slice(-2) });
  await p.evaluate(() => document.querySelectorAll('section.block_course_list ul.unlist > li')[1].querySelector('.la-itembar .la-mini[title="上へ"]').click());
  await p.waitForTimeout(400);
  const h2 = await hrefs();
  check('▲ も動作', h2[0] === h1[1] && h2[1] === h1[0], { a: h1.slice(0, 2), b: h2.slice(0, 2) });

  log('\nエラー: ' + (errs.length ? errs.join(' | ') : '(なし)'));
  check('ページエラーなし', errs.length === 0, errs.slice(0, 3));
  console.log('\n' + (fails ? 'FAILED: ' + fails : 'ALL PASS (course)'));
  await ctx.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
