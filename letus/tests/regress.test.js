/* LETUS Assist - 既存機能の回帰テスト
 * トップページ（反転・冪等性・並べ替え・非表示・外観）と課題ページ（To Do ボタン）
 */
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
  const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-reg'), {
    executablePath: EXE, headless: true, viewport: { width: 1600, height: 1100 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox', '--disable-gpu']
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await new Promise((r) => setTimeout(r, 1400));
  for (const p of ctx.pages()) await p.close().catch(() => {});

  const getTop = () => sw.evaluate(() => new Promise((r) => chrome.storage.local.get('letusAssist', (x) => r((x.letusAssist && x.letusAssist.top) || null))));
  const setTop = (o) => sw.evaluate((o) => new Promise((r) => chrome.storage.local.get('letusAssist', (x) => {
    const c = x.letusAssist || {}; c._v = 4;
    for (const k of Object.keys(o)) c[k] = (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) ? Object.assign({}, c[k], o[k]) : o[k];
    chrome.storage.local.set({ letusAssist: c }, () => r(true));
  })), o);
  const clear = () => sw.evaluate(() => new Promise((r) => chrome.storage.local.clear(r)));

  await ctx.route('https://letus.ed.tus.ac.jp/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.indexOf('/mod/assign/') === 0 && route.request().resourceType() === 'document') {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(REF + '/微分積分２.html', 'utf8') });
      return;
    }
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

  const inv = () => p.evaluate(() => {
    const cs = document.querySelector('.la-slot[data-la-slot="mycourses"]');
    const ns = document.querySelector('.la-slot[data-la-slot="sitenews"]');
    const search = document.getElementById('searchinput') || document.querySelector('input[name="q"]');
    return {
      mcInMain: !!(cs && cs.closest('#region-main')), mcInSide: !!(cs && cs.closest('#block-region-side-pre')),
      nsInSide: !!(ns && ns.closest('#block-region-side-pre')), nsInMain: !!(ns && ns.closest('#region-main')),
      mcAbove: (cs && search) ? cs.getBoundingClientRect().top < search.getBoundingClientRect().top : null,
      anchors: document.querySelectorAll('[data-la-anchor]').length, body: document.body.className
    };
  });
  const okInv = (s) => s.mcInMain && !s.mcInSide && s.nsInSide && !s.nsInMain && s.mcAbove && s.anchors === 2;
  const hrefs = () => p.evaluate(() => [...document.querySelectorAll('section.block_course_list ul.unlist > li a')].map((a) => a.getAttribute('href')));

  log('=== 1. トップページ: 反転 ===');
  await clear();
  await p.goto('https://letus.ed.tus.ac.jp/', { waitUntil: 'load' });
  await p.waitForSelector('.la-slot'); await p.waitForTimeout(1300);
  let s = await inv();
  check('マイコース=メイン / ニュース=サイドバー / 検索欄より上', okInv(s), s);
  check('body.la-swap', /la-swap/.test(s.body), s.body);

  log('\n=== 2. 冪等性（DOM 連打）===');
  await p.evaluate(() => { window.__iv = setInterval(() => { const e = document.createElement('div'); e.className = 'probe'; const m = document.querySelector('[role="main"]'); if (m) m.appendChild(e); }, 25); });
  await p.waitForTimeout(1800);
  await p.evaluate(() => { clearInterval(window.__iv); document.querySelectorAll('.probe').forEach((e) => e.remove()); });
  await p.waitForTimeout(700);
  check('DOM 連打後も配置が崩れない', okInv(await inv()));

  log('\n=== 3. コース並べ替え ===');
  const h0 = await hrefs();
  await p.evaluate(`(${DND})('li.la-item .la-grip','section.block_course_list ul.unlist > li',0,true)`);
  await p.waitForTimeout(400);
  const h1 = await hrefs();
  check('先頭→末尾', h1[h1.length - 1] === h0[0], { a: h0.slice(0, 2), b: h1.slice(-2) });
  check('保存される', (await getTop()).courseOrder.slice(-1)[0] === h0[0]);
  await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.la-slot'); await p.waitForTimeout(1300);
  check('リロード後も順序復元', JSON.stringify(await hrefs()) === JSON.stringify(h1));
  check('リロード後も配置が正しい', okInv(await inv()));

  log('\n=== 4. コース非表示 ===');
  const beforeHrefs = await hrefs();
  await setTop({ top: { hiddenCourses: [beforeHrefs[1], beforeHrefs[4], beforeHrefs[9]] } });
  await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.la-slot'); await p.waitForTimeout(1300);
  const hid = await p.evaluate(() => ({
    set: document.querySelectorAll('li.la-item.la-hidden').length,
    vis: [...document.querySelectorAll('section.block_course_list ul.unlist > li')].filter((li) => li.style.display !== 'none').length,
    panel: !!document.querySelector('.la-hidden-list') && !document.querySelector('.la-hidden-list').hidden,
    summary: (document.querySelector('.la-hidden-summary') || {}).textContent,
    rows: [...document.querySelectorAll('.la-hidden-row .la-hidden-name')].map((e) => e.textContent),
    restore: !!document.querySelector('.la-restore'),
    undoBtn: !!document.querySelector('.la-unhide-all')
  }));
  log('  ' + JSON.stringify({ set: hid.set, vis: hid.vis, summary: hid.summary, rows: hid.rows.length }));
  check('3件非表示 / 53件表示', hid.set === 3 && hid.vis === 53, hid);
  check('非表示パネルに件数と名前が出る', hid.panel && /非表示のコース（3）/.test(hid.summary) && hid.rows.length === 3, hid);
  check('パネルに「表示に戻す」がある', hid.restore && hid.undoBtn);
  check('非表示でも配置は正しい', okInv(await inv()));
  // パネルから1件戻す
  await p.evaluate(() => document.querySelector('.la-restore').click());
  await p.waitForTimeout(700);
  check('パネルから1件戻せる', (await p.evaluate(() => document.querySelectorAll('li.la-item.la-hidden').length)) === 2);
  check('戻すとトーストが出る', await p.evaluate(() => {
    const h = document.getElementById('la-toast-host');
    return !!(h && h.shadowRoot && /表示に戻しました/.test(h.shadowRoot.querySelector('.text').textContent));
  }));
  await p.evaluate(() => document.querySelector('.la-unhide-all').click());
  await p.waitForTimeout(700);
  check('すべて表示で戻る', (await p.evaluate(() => document.querySelectorAll('li.la-item.la-hidden').length)) === 0);
  check('件数0でパネルが隠れる', await p.evaluate(() => document.querySelector('.la-hidden-list').hidden) === true);

  log('\n=== 5. 外観 ===');
  await clear(); await p.reload({ waitUntil: 'load' }); await p.waitForSelector('.la-slot'); await p.waitForTimeout(1300);
  const st = await p.evaluate(() => {
    const b = document.querySelector('section.block_course_list');
    const h = b.querySelector('h3.card-title'), a = b.querySelector('ul.unlist > li a');
    const ul = b.querySelector('ul.unlist');
    return { hSize: getComputedStyle(h).fontSize, hColor: getComputedStyle(h).color,
      aSize: getComputedStyle(a).fontSize, aColor: getComputedStyle(a).color,
      liDisplay: getComputedStyle(ul.children[0]).display, cols: getComputedStyle(ul).gridTemplateColumns.split(' ').length,
      r0: ul.querySelectorAll(':scope > li.r0').length, r1: ul.querySelectorAll(':scope > li.r1').length,
      cog: b.querySelectorAll('li.la-item .la-cog').length,
      eye: b.querySelectorAll('li.la-item .la-eye').length };
  });
  check('見出し 26px / 色 #0f766e', st.hSize === '26px' && st.hColor === 'rgb(15, 118, 110)', st);
  check('項目 22px / 色 #0f766e', st.aSize === '22px' && st.aColor === 'rgb(15, 118, 110)', st);
  check('li display は LETUS のまま', st.liDisplay !== 'flex', st.liDisplay);
  check('2段組 / Moodle の r0/r1 保持', st.cols === 2 && st.r0 > 0 && st.r1 > 0, st);
  check('各項目に ⚙ がある（56件）', st.cog === 56, st.cog);
  check('ワンクリックの ●（👁）は廃止された', st.eye === 0, st.eye);

  log('\n=== 6. 課題ページ: To Do ボタン（抽出リファクタの回帰）===');
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => { if (!/js_pending|help_popups|yui|requirejs/i.test(e.message)) errs.push('P2 ' + e.message); });
  await p2.goto('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=2256263', { waitUntil: 'load' });
  await p2.waitForSelector('#la-todo-panel'); await p2.waitForTimeout(500);
  const r3 = await p2.evaluate(() => {
    const pn = document.getElementById('la-todo-panel');
    return { after: document.querySelector('.submissionstatustable').nextElementSibling === pn,
      info: pn.querySelector('.la-todo-info').textContent,
      btn: pn.querySelector('.la-todo-main').textContent,
      menu: [...pn.querySelectorAll('.la-todo-menu-item')].map((b) => b.textContent) };
  });
  log('  ' + JSON.stringify({ info: r3.info, btn: r3.btn }));
  check('提出ステータス直後に挿入', r3.after);
  check('期限を抽出（2026年 09月 22日）', /2026年 09月 22日/.test(r3.info), r3.info);
  check('コース名を抽出（微分積分２）', /微分積分２/.test(r3.info), r3.info);
  check('課題名を抽出', /課題の提出はこちら/.test(r3.info), r3.info);
  check('タスク名生成', /\[LETUS\] 微分積分２ \(9943314\) 課題の提出はこちら/.test(r3.btn), r3.btn);
  check('メニュー2種', JSON.stringify(r3.menu) === '["Google Tasks","Microsoft To Do"]');
  await p2.evaluate(() => document.querySelector('.la-todo-main').click());
  await p2.waitForFunction(() => /⚠|✅/.test(document.querySelector('.la-todo-status').textContent), { timeout: 10000 });
  // 権限が未許可なら案内、許可済みなら未設定エラー（どちらも「SW と往復できている」証拠）
  check('SW 往復（許可の案内 または 未設定エラーが返る）',
    /許可|manifest\.json|認証/.test(await p2.evaluate(() => document.querySelector('.la-todo-status').textContent)),
    await p2.evaluate(() => document.querySelector('.la-todo-status').textContent));

  log('\n=== 7. 設定ページ ===');
  const p3 = await ctx.newPage();
  p3.on('pageerror', (e) => errs.push('P3 ' + e.message));
  await p3.goto('chrome-extension://' + extId + '/letus/options/options.html');
  await p3.waitForSelector('[data-path="top.mode"]');
  await p3.waitForSelector('#achv .lv');
  const r4 = await p3.evaluate(() => ({
    mode: document.querySelector('[data-path="top.mode"]').value,
    modes: [...document.querySelectorAll('[data-path="top.mode"] option')].map((o) => o.value),
    celebrate: !!document.querySelector('[data-path="celebrate.enabled"]'),
    achv: !!document.querySelector('#achv .lv'),
    hidden: document.getElementById('hiddenStatus').textContent,
    clearStyles: !!document.getElementById('clearCourseStyles'),
    styleList: !!document.querySelector('#styleList'),
    g: document.getElementById('googleStatus').textContent
  }));
  check('既定 swap', r4.mode === 'swap', r4.mode);
  check('モード3種', JSON.stringify(r4.modes) === '["swap","both-main","native"]', r4.modes);
  check('演出設定がある', r4.celebrate === true);
  check('実績欄が描画される', r4.achv === true);
  check('非表示0件の表示', /非表示のコースはありません/.test(r4.hidden), r4.hidden);
  check('個別設定の一括初期化ボタンがある', r4.clearStyles === true);
  check('個別設定の一覧が描画される', r4.styleList === true);
  check('Google 未設定警告', /未設定/.test(r4.g), r4.g);

  log('\nエラー: ' + (errs.length ? errs.join(' | ') : '(なし)'));
  check('ページエラーなし', errs.length === 0, errs.slice(0, 3));

  log('\n' + (fails ? 'FAILED: ' + fails : 'ALL PASS (regress)'));
  await ctx.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
