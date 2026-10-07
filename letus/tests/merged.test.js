/* TUS Assist（統合版）のスモークテスト
 *  - 統合拡張が読み込める
 *  - LETUS ページで CLASS の content script が動かない（exclude_matches）
 *  - 統合ポップアップに CLASS と LETUS の両方が出る
 *  - CLASS ダッシュボードに LETUS 設定への導線がある
 *  - To Do はオプション権限で、未許可なら案内が出る
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

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-merged'), {
    executablePath: EXE, headless: true, viewport: { width: 1440, height: 900 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox', '--disable-gpu']
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await new Promise((r) => setTimeout(r, 1500));
  for (const p of ctx.pages()) await p.close().catch(() => {});
  const errs = [];

  log('=== 1. 読み込み ===');
  const mf = await sw.evaluate(() => chrome.runtime.getManifest());
  log('  名前: ' + mf.name + ' v' + mf.version);
  check('統合された名前', /TUS Assist/.test(mf.name), mf.name);
  check('content_scripts が3系統（CLASS / LETUS / ダークモード）',
    mf.content_scripts.length === 3,
    mf.content_scripts.map((c) => (c.js || []).join(',').split('/').pop()));
  const themeEntry = mf.content_scripts.find((c) => (c.js || []).some((j) => /shared\/theme\.js$/.test(j)));
  check('ダークモードの content script がある（document_start）',
    !!themeEntry && themeEntry.run_at === 'document_start' &&
    themeEntry.css.some((c) => /dark-host\.css$/.test(c)) &&
    themeEntry.matches.some((m) => /\*\.tus\.ac\.jp/.test(m)),
    themeEntry);
  check('CLASS 側に LETUS の除外がある',
    (mf.content_scripts[0].exclude_matches || []).some((u) => /letus\.ed\.tus\.ac\.jp/.test(u)),
    mf.content_scripts[0].exclude_matches);
  check('identity はオプション権限', (mf.optional_permissions || []).includes('identity') && !(mf.permissions || []).includes('identity'), mf.permissions);
  check('To Do 用ホストはオプション', (mf.optional_host_permissions || []).length === 3, mf.optional_host_permissions);
  check('notifications は使わない', !(mf.permissions || []).includes('notifications'), mf.permissions);
  check('SW は module', mf.background.type === 'module', mf.background);
  check('oauth2 がある', !!(mf.oauth2 && mf.oauth2.client_id));

  log('\n=== 2. LETUS ページ（CLASS が動かないこと）===');
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
  p.on('pageerror', (e) => { if (!/js_pending|help_popups|yui|requirejs|define/i.test(e.message)) errs.push(e.message); });
  await p.goto('https://letus.ed.tus.ac.jp/', { waitUntil: 'load' });
  await p.waitForSelector('.la-slot', { timeout: 15000 });
  await p.waitForTimeout(900);
  const cls = await p.evaluate(() => ({
    sidebar: !!document.querySelector('.tce-sp-panel, #tce-sp-collapse'),
    toast: !!document.querySelector('.tce-toast'),
    sortbar: !!document.querySelector('.tce-sortbar'),
    letus: !!document.querySelector('.la-slot')
  }));
  check('LETUS の機能は動いている（.la-slot）', cls.letus === true);
  check('CLASS のサイドバーが注入されない', cls.sidebar === false, cls);
  check('CLASS の一覧UIが注入されない', cls.toast === false && cls.sortbar === false, cls);

  log('\n=== 3. 課題ページ（To Do は未許可で案内）===');
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => { if (!/js_pending|help_popups|yui|requirejs|define/i.test(e.message)) errs.push('P2 ' + e.message); });
  await p2.goto('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=2256263', { waitUntil: 'load' });
  await p2.waitForSelector('#la-todo-panel', { timeout: 15000 });
  await p2.waitForTimeout(400);
  const st = await sw.evaluate(() => new Promise((r) => chrome.permissions.contains({ permissions: ['identity'] }, (ok) => r(!!ok))));
  check('identity は未許可', st === false, st);
  await p2.evaluate(() => document.querySelector('.la-todo-main').click());
  await p2.waitForTimeout(2500);
  const status = await p2.evaluate(() => document.querySelector('.la-todo-status').textContent);
  log('  status = ' + status);
  check('未許可の案内が出る（または自動許可される）', /許可|認証|manifest/.test(status), status);

  log('\n=== 4. 統合ポップアップ ===');
  const p3 = await ctx.newPage();
  p3.on('pageerror', (e) => errs.push('P3 ' + e.message));
  await p3.goto('chrome-extension://' + extId + '/popup/popup.html');
  await p3.waitForSelector('#tce-open-dashboard', { timeout: 8000 });
  await p3.waitForTimeout(700);
  const pop = await p3.evaluate(() => ({
    title: document.querySelector('h1').textContent,
    classRows: !!document.getElementById('tce-count') && !!document.getElementById('tce-credits'),
    letusBody: !!document.getElementById('body').children.length,
    letusText: document.getElementById('body').textContent,
    btnDash: !!document.getElementById('tce-open-dashboard'),
    btnLetus: !!document.getElementById('options')
  }));
  log('  ' + JSON.stringify({ title: pop.title, letus: pop.letusText.slice(0, 60) }));
  check('タイトルが TUS Assist', pop.title === 'TUS Assist', pop.title);
  check('CLASS の件数欄がある', pop.classRows === true);
  check('LETUS の実績/状態が描画される', pop.letusBody === true, pop.letusText);
  check('ダッシュボードと LETUS 設定のボタン', pop.btnDash && pop.btnLetus);

  log('\n=== 5. CLASS ダッシュボード ===');
  const p4 = await ctx.newPage();
  p4.on('pageerror', (e) => errs.push('P4 ' + e.message));
  await p4.goto('chrome-extension://' + extId + '/dashboard/dashboard.html');
  await p4.waitForSelector('.tab-btn', { timeout: 8000 });
  await p4.waitForTimeout(400);
  const dash = await p4.evaluate(() => {
    const tabs = [...document.querySelectorAll('.tab-btn')].map((b) => b.dataset.tab);
    return { tabs, hasLetusLink: !!document.getElementById('tce-open-letus') };
  });
  check('ダッシュボードのタブが生きている', JSON.stringify(dash.tabs) === '["compare","timetable","grade","settings"]', dash.tabs);
  check('LETUS 設定への導線がある', dash.hasLetusLink === true);

  log('\nエラー: ' + (errs.length ? errs.join(' | ') : '(なし)'));
  check('ページエラーなし', errs.length === 0, errs.slice(0, 3));
  console.log('\n' + (fails ? 'FAILED: ' + fails : 'ALL PASS (merged)'));
  await ctx.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
