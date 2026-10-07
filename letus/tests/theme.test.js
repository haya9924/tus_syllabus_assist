/* TUS Assist - ダークモードの E2E テスト（Playwright + 実拡張）
 *  - LETUS ページで反転オーバーレイと注入UIの再反転が効く
 *  - mode / 対象（targets）の切り替えがページに反映される
 *  - 拡張ページ（ポップアップ）は反転せずダークCSSで描画される
 *  - ポップアップの操作UIが storage に保存される
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
  const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-theme'), {
    executablePath: EXE, headless: true, viewport: { width: 1440, height: 900 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox', '--disable-gpu']
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await new Promise((r) => setTimeout(r, 1200));
  for (const p of ctx.pages()) await p.close().catch(() => {});
  const errs = [];

  const setTheme = (cfg) => sw.evaluate(
    (c) => new Promise((r) => chrome.storage.local.set({ tusTheme: c }, () => r(1))), cfg);
  const getTheme = () => sw.evaluate(
    () => new Promise((r) => chrome.storage.local.get('tusTheme', (v) => r(v.tusTheme || null))));

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

  log('=== 1. mode=on で LETUS が暗くなる ===');
  await setTheme({ mode: 'on', schedule: 'time', time: { start: '19:00', end: '06:00' },
    targets: { class: true, letus: true, ui: true } });
  await p.goto('https://letus.ed.tus.ac.jp/', { waitUntil: 'load' });
  await p.waitForSelector('.la-slot', { timeout: 15000 });
  await p.waitForFunction(() => document.documentElement.getAttribute('data-tus-theme') === 'dark', null, { timeout: 8000 });
  const d1 = await p.evaluate(() => {
    const after = getComputedStyle(document.documentElement, '::after');
    const bar = document.querySelector('.la-slotbar');
    const todo = document.querySelector('#la-todo-panel');
    return {
      theme: document.documentElement.dataset.tusTheme,
      filter: after.backdropFilter || after.webkitBackdropFilter || '',
      z: after.zIndex,
      pe: after.pointerEvents,
      pos: after.position,
      bar: bar ? getComputedStyle(bar).filter : null,
      todo: todo ? getComputedStyle(todo).filter : null
    };
  });
  check('data-tus-theme="dark"', d1.theme === 'dark', d1.theme);
  check('反転オーバーレイ（backdrop-filter: invert）がある', /invert/.test(d1.filter), d1.filter);
  check('オーバーレイは fixed / z-index=2147482000 / クリック透過',
    d1.pos === 'fixed' && d1.z === '2147482000' && d1.pe === 'none', d1);
  check('注入UI（.la-slotbar）は再反転される', /invert/.test(d1.bar || ''), d1.bar);
  // 反転方式なので「反転前」の背景は明るいまま。オーバーレイで暗く塗り替えられる。
  const base = await p.evaluate(() => {
    const pick = (el) => {
      const c = getComputedStyle(el).backgroundColor;
      return c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' ? c : null;
    };
    return pick(document.body) || pick(document.documentElement) || 'rgb(255, 255, 255)';
  });
  const bm = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(base);
  check('本文の背景は明るい（オーバーレイが反転して暗くなる）',
    bm ? (+bm[1] + +bm[2] + +bm[3]) > 600 : false, base);
  await p.screenshot({ path: path.join(os.tmpdir(), 'tus-dark-letus.png') });

  log('\n=== 2. 対象（targets）で切り替わる ===');
  await setTheme({ mode: 'on', targets: { class: true, letus: false, ui: true } });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.la-slot', { timeout: 15000 });
  await p.waitForFunction(() => !document.documentElement.hasAttribute('data-tus-theme'), null, { timeout: 8000 });
  check('targets.letus=false なら LETUS は明るいままで', true);

  await setTheme({ mode: 'off', targets: { class: true, letus: true, ui: true } });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.la-slot', { timeout: 15000 });
  await p.waitForFunction(() => !document.documentElement.hasAttribute('data-tus-theme'), null, { timeout: 8000 });
  check('mode=off なら暗くしない', true);
  await p.screenshot({ path: path.join(os.tmpdir(), 'tus-light-letus.png') });

  log('\n=== 3. 拡張ページ（ポップアップ） ===');
  const p3 = await ctx.newPage();
  p3.on('pageerror', (e) => errs.push('P3 ' + e.message));
  await setTheme({ mode: 'on', schedule: 'time', time: { start: '19:00', end: '06:00' },
    targets: { class: true, letus: true, ui: true } });
  await p3.goto('chrome-extension://' + extId + '/popup/popup.html');
  await p3.waitForSelector('#tus-mode', { timeout: 8000 });
  await p3.waitForFunction(() => document.documentElement.getAttribute('data-tus-theme') === 'dark', null, { timeout: 8000 });
  const ui1 = await p3.evaluate(() => ({
    theme: document.documentElement.dataset.tusTheme,
    bg: getComputedStyle(document.body).backgroundColor,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    mode: document.getElementById('tus-mode').value,
    sched: document.getElementById('tus-schedule').value,
    start: document.getElementById('tus-start').value,
    end: document.getElementById('tus-end').value,
    targets: ['tus-t-class', 'tus-t-letus', 'tus-t-ui'].map((id) => document.getElementById(id).checked),
    next: document.getElementById('tus-next').textContent
  }));
  check('ポップアップも data-tus-theme="dark"', ui1.theme === 'dark', ui1.theme);
  check('ダークの背景色（#16191d）', ui1.bg === 'rgb(22, 25, 29)', ui1.bg);
  check('color-scheme: dark', /dark/.test(String(ui1.colorScheme)), ui1.colorScheme);
  check('保存値が UI に出る',
    ui1.mode === 'on' && ui1.sched === 'time' && ui1.start === '19:00' && ui1.end === '06:00', ui1);
  check('対象チェックが UI に出る', ui1.targets.join() === 'true,true,true', ui1.targets);
  check('「常に入れる」では切替予定の案内が出ない', /暗くなります/.test(ui1.next), ui1.next);
  await p3.screenshot({ path: path.join(os.tmpdir(), 'tus-dark-popup.png') });

  // 操作: 自動 + 日の出・日の入り に変える → storage に保存され、時間行が隠れる
  await p3.selectOption('#tus-mode', 'auto');
  await p3.waitForFunction(() => document.getElementById('tus-next').textContent.indexOf('自動') === -1, null, { timeout: 4000 });
  const nextAuto = await p3.evaluate(() => document.getElementById('tus-next').textContent);
  const t1 = await getTheme();
  check('モード auto が保存される', t1 && t1.mode === 'auto', t1);
  check('自動切替の予定が表示される', /に(暗くなる|明るくなる)/.test(nextAuto), nextAuto);

  await p3.selectOption('#tus-schedule', 'sun');
  await p3.waitForFunction(() => document.getElementById('tus-time-row').hidden === true, null, { timeout: 4000 });
  const t2 = await getTheme();
  const timeRowHidden = await p3.evaluate(() => document.getElementById('tus-time-row').hidden);
  check('schedule=sun が保存される', t2 && t2.schedule === 'sun', t2);
  check('sun のときは時刻入力を隠す', timeRowHidden === true, timeRowHidden);
  const nextSun = await p3.evaluate(() => document.getElementById('tus-next').textContent);
  check('次の切替時刻が表示される', /に(暗くなる|明るくなる)/.test(nextSun), nextSun);

  await p3.selectOption('#tus-schedule', 'time');
  await p3.evaluate(() => {
    const el = document.getElementById('tus-start');
    el.value = '22:30';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p3.waitForFunction(() => document.getElementById('tus-start').value === '22:30', null, { timeout: 4000 });
  const t3 = await getTheme();
  check('時刻の変更が保存される', t3 && t3.time && t3.time.start === '22:30', t3);

  // 対象を外すとポップアップ自身も明るくなる
  await p3.uncheck('#tus-t-ui');
  await p3.waitForFunction(() => !document.documentElement.hasAttribute('data-tus-theme'), null, { timeout: 4000 });
  check('targets.ui=false でポップアップは明るくなる', true);
  const t4 = await getTheme();
  check('targets.ui=false が保存される', t4 && t4.targets && t4.targets.ui === false, t4);

  log('\n=== 4. ダッシュボード / 設定ページ ===');
  const p4 = await ctx.newPage();
  p4.on('pageerror', (e) => errs.push('P4 ' + e.message));
  await setTheme({ mode: 'on', targets: { class: true, letus: true, ui: true } });
  for (const rel of ['dashboard/dashboard.html', 'letus/options/options.html']) {
    await p4.goto('chrome-extension://' + extId + '/' + rel);
    await p4.waitForFunction(() => document.documentElement.getAttribute('data-tus-theme') === 'dark', null, { timeout: 8000 });
    const info = await p4.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      section: (() => { const s = document.querySelector('section, .course-card, header'); return s ? getComputedStyle(s).backgroundColor : null; })()
    }));
    check(rel + ' が暗くなる（' + info.bg + '）', info.bg !== 'rgb(255, 255, 255)' && !/^rgb\(24[0-9],/.test(info.bg), info);
  }

  log('\nエラー: ' + (errs.length ? errs.join(' | ') : '(なし)'));
  check('ページエラーなし', errs.length === 0, errs.slice(0, 3));
  console.log('\n' + (fails ? 'FAILED: ' + fails : 'ALL PASS (theme-e2e)'));
  await ctx.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
