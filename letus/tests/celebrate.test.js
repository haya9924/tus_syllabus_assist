/* LETUS Assist - 「SUPER COMPLETE!!」演出の E2E テスト
 * 実 Chromium に拡張機能を読み込み、提出フォーム → 提出 → 演出 までを実測する。
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

function jpDate(d) {
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年 ${p(d.getMonth() + 1)}月 ${p(d.getDate())}日(${w}曜日) ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dueParts(d) {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
}

/* ---- フィクスチャ ---- */
function shell(inner, opts) {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>${opts.title}</title></head>
<body class="limitedwidth format-site course path-mod path-mod-assign chrome dir-ltr lang-ja jsenabled">
<nav><ol class="breadcrumb">
  <li class="breadcrumb-item"><a href="https://letus.ed.tus.ac.jp/course/view.php?id=208219" title="プログラミングとアルゴリズム１ (994321G)">プログラミングとアルゴリズム１ (994321G)</a></li>
  <li class="breadcrumb-item"><a href="#" data-section-name-for="1">第3回</a></li>
  <li class="breadcrumb-item"><a aria-current="page" href="#" title="課題">第3回課題提出</a></li>
</ol></nav>
<div id="page-content"><div id="region-main-box"><div id="region-main">
  <h2>第3回課題提出</h2>
  <div class="activity-header">
    <div data-region="activity-information" data-activityname="第3回課題提出">
      <div class="activity-dates">
        <div><strong>開始:</strong> ${opts.start}</div>
        <div><strong>期限:</strong> ${opts.due}</div>
      </div>
    </div>
  </div>
  ${inner}
</div></div></div>
</body></html>`;
}

function editHtml(opts) {
  return shell(`
  <div class="submissionstatustable"><h3>提出ステータス</h3>
    <table class="generaltable"><tbody>
      <tr><th scope="row">提出ステータス</th><td class="cell">未提出</td></tr>
    </tbody></table>
  </div>
  <form id="mod_assign_submission_form" method="post" enctype="multipart/form-data"
        action="https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${opts.id}">
    <input type="hidden" name="sesskey" value="test">
    <div class="fileuploadsubmission">prog03_4326036.pdf</div>
    <input type="submit" id="id_submitbutton" name="submitbutton" class="btn btn-primary" value="この状態で提出する">
    <input type="submit" id="id_savebutton" name="savebutton" class="btn btn-secondary" value="下書きとして保存する">
    <input type="button" name="cancel" class="btn btn-secondary" value="キャンセル">
  </form>`, Object.assign({ title: '編集: 第3回課題提出' }, opts));
}

function viewHtml(opts) {
  const submitted = opts.submitted;
  return shell(
    submitted
      ? `<div class="submissionstatustable"><h3>提出ステータス</h3>
    <table class="generaltable"><tbody>
      <tr><th scope="row">提出ステータス</th><td class="submissionstatussubmitted">評定のために提出済み</td></tr>
      <tr><th scope="row">最終更新日時</th><td>${opts.due}</td></tr>
    </tbody></table></div>
  <div class="fileuploadsubmission">prog03_4326036.pdf</div>`
      : `<div class="submissionstatustable"><h3>提出ステータス</h3>
    <table class="generaltable"><tbody>
      <tr><th scope="row">提出ステータス</th><td class="cell">未提出</td></tr>
    </tbody></table></div>
  <a href="?id=${opts.id}&action=editsubmission">提出を追加する</a>`,
    Object.assign({ title: '第3回課題提出' }, opts));
}

const ARGS = { executablePath: EXE, headless: true, viewport: { width: 1280, height: 900 },
  args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] };

async function launch(profile) {
  const ctx = await chromium.launchPersistentContext(profile, ARGS);
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  // インストール直後は設定ページが自動で開くので閉じておく
  await new Promise((r) => setTimeout(r, 1400));
  for (const p of ctx.pages()) {
    if (p.url().indexOf('chrome-extension://') === 0) await p.close().catch(() => {});
  }
  return { ctx, sw, extId: new URL(sw.url()).host };
}

async function serve(ctx, state) {
  await ctx.route('https://letus.ed.tus.ac.jp/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const q = u.searchParams;
    if (u.pathname.indexOf('/mod/assign/view.php') === 0) {
      const action = q.get('action') || 'view';
      if (req.method() === 'POST') {
        // 実サイトは 302 リダイレクトだが、テストでは確実に自前で処理したいので
        // クライアント側リダイレクトを返す（フォーム送信 → 遷移の流れは同じ）
        const to = `https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${q.get('id')}&action=view`;
        await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<script>location.replace(${JSON.stringify(to)})</script>` });
        return;
      }
      const opts = Object.assign({ id: q.get('id') || '2268803' }, state);
      const html = action === 'editsubmission' ? editHtml(opts) : viewHtml(opts);
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      return;
    }
    const m = u.pathname.match(/Home _ LETUS 2026_files\/(.+)$/);
    if (m && fs.existsSync(path.join(ASSETS, m[1]))) {
      await route.fulfill({ status: 200, contentType: MIME[path.extname(m[1])] || 'text/css', body: fs.readFileSync(path.join(ASSETS, m[1])) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'text/plain', body: '' });
  });
}

const getGame = (sw) => sw.evaluate(() => new Promise((r) => chrome.storage.local.get(['letusAssist', 'letusAssistRuntime'], (x) => r({
  game: (x.letusAssist && x.letusAssist.game) || null,
  runtime: x.letusAssistRuntime || {}
}))));

const setStore = (sw, patch) => sw.evaluate((p) => new Promise((r) => {
  chrome.storage.local.get(['letusAssist'], (x) => {
    const cur = x.letusAssist || {};
    for (const k of Object.keys(p)) cur[k] = (p[k] && typeof p[k] === 'object' && !Array.isArray(p[k])) ? Object.assign({}, cur[k], p[k]) : p[k];
    chrome.storage.local.set({ letusAssist: cur }, () => r(true));
  });
}), patch);

const clearStore = (sw) => sw.evaluate(() => new Promise((r) => chrome.storage.local.clear(r)));

/* ---- Shadow DOM 内の状態を読む ---- */

// パチンコ演出の結果パネルが出るまで待つ
const waitResult = async (pg) => {
  await pg.waitForSelector('#la-celebrate-host', { timeout: 20000 });
  await pg.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot && h.shadowRoot.querySelector('.result') &&
      !h.shadowRoot.querySelector('.result').classList.contains('hidden');
  }, { timeout: 25000 });
};

const READ = `(() => {
  const host = document.getElementById('la-celebrate-host');
  if (!host || !host.shadowRoot) return null;
  const sr = host.shadowRoot;
  const q = (s) => sr.querySelector(s);
  return {
    title: q('.title') ? q('.title').textContent : null,
    titleAttr: q('.title') ? q('.title').getAttribute('data-text') : null,
    tier: q('.tier') ? q('.tier').textContent : null,
    task: q('.task') ? q('.task').textContent : null,
    course: q('.course') ? q('.course').textContent : null,
    focus: q('.focus') ? q('.focus').textContent : null,
    xp: q('.xp') ? q('.xp').textContent : null,
    breakdown: q('.breakdown') ? q('.breakdown').textContent : null,
    lv: q('.lv') ? q('.lv').textContent : null,
    levelName: q('.name') ? q('.name').textContent : null,
    barWidth: q('.bar i') ? q('.bar i').style.width : null,
    levelup: q('.levelup') && !q('.levelup').classList.contains('hidden') ? q('.levelup').textContent : null,
    close: q('.close') ? q('.close').textContent : null,
    hasCanvas: !!q('canvas.fx'),
    canvasPixels: (() => { const c = q('canvas.fx'); if (!c) return -1; const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i] > 8) n++; return n; })(),
    initials: (() => { const s = getComputedStyle(sr.host); return { tierColor: q('.wrap') ? getComputedStyle(q('.wrap')).getPropertyValue('--tier').trim() : null }; })(),
    on: q('.wrap') ? q('.wrap').classList.contains('on') : false,
    soundHint: q('.sound-hint') ? !q('.sound-hint').classList.contains('hidden') : null
  };
})()`;

(async () => {
  const due = new Date(Date.now() + 5 * 86400000);
  due.setHours(18, 0, 0, 0);
  const start = new Date(Date.now() - 3600000);
  const state = { due: jpDate(due), start: jpDate(start), submitted: false };
  const ID = '2268803';

  const { ctx, sw } = await launch(path.join(os.tmpdir(), 'la-cel'));
  const errs = [];
  await serve(ctx, state);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { if (!/js_pending|help_popups|yui|requirejs|define/i.test(e.message)) errs.push(e.message); });

  log('=== 1. 提出フォーム → 提出 → 演出 ===');
  await clearStore(sw);
  await page.goto(`https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${ID}&action=editsubmission`, { waitUntil: 'load' });
  await page.waitForSelector('#id_submitbutton');
  await page.waitForTimeout(700);

  // 下書き保存では出ないことを先に確認
  log('  (下書き保存を試す)');
  await page.click('#id_savebutton');
  await page.waitForTimeout(900);
  await page.goto(`https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${ID}&action=editsubmission`, { waitUntil: 'load' });
  await page.waitForSelector('#id_submitbutton');
  await page.waitForTimeout(500);
  check('下書き保存では演出が出ない', await page.evaluate((s) => !document.getElementById('la-celebrate-host'), READ));

  // バリデーションエラーでフォームに戻された想定（同じ URL に戻る）
  log('  (差し戻しを試す)');
  await page.route('**/mod/assign/view.php*', async (route) => {
    const req = route.request();
    const q = new URL(req.url()).searchParams;
    if (req.method() === 'POST') {
      // エラーで編集ページを再表示（action=editsubmission に戻る）
      const opts = Object.assign({ id: q.get('id') }, state, { submitted: false });
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: editHtml(opts) });
      return;
    }
    await route.fallback();
  });
  await page.click('#id_submitbutton');
  await page.waitForTimeout(1200);
  check('差し戻されたときは演出が出ない',
    await page.evaluate(() => !document.getElementById('la-celebrate-host')),
    await page.evaluate(() => location.href));
  await page.unroute('**/mod/assign/view.php*');

  // 本提出
  state.submitted = true;
  await page.click('#id_submitbutton');
  await page.waitForURL(/action=view/, { timeout: 8000 });
  await waitResult(page);
  await page.waitForTimeout(700);
  let s = await page.evaluate(READ);
  log('  ' + JSON.stringify({ on: s.on, title: s.title, tier: s.tier, xp: s.xp, lv: s.lv, bar: s.barWidth }));
  check('演出が表示された', !!s && s.on === true);
  check('タイトルが「NICE COMPLETE!!」（連続1日）', s.title === 'NICE COMPLETE!!', s.title);
  check('chromatic aberration 用 data-text が一致', s.titleAttr === s.title, s.titleAttr);
  check('ティアバッジ NICE ×1', s.tier === 'NICE ×1', s.tier);
  check('課題名を表示', s.task === '第3回課題提出', s.task);
  check('コース名を表示', /プログラミングとアルゴリズム１/.test(s.course || ''), s.course);
  check('集中時間を表示', /集中した時間/.test(s.focus || ''), s.focus);
  check('とじるボタンがある', s.close === 'とじる', s.close);
  check('紙吹雪キャンバスが描画されている', s.hasCanvas && s.canvasPixels > 0, { has: s.hasCanvas, px: s.canvasPixels });
  check('レベルバーが設定されている', /%$/.test(s.barWidth || ''), s.barWidth);

  // XP カウントアップ完了を待つ
  await page.waitForFunction((sel) => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot.querySelector('.xp').textContent === sel;
  }, '+' + (150 + 100 + 100).toLocaleString('en-US'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  s = await page.evaluate(READ);
  check('XP が 350 で確定', s.xp === '+350', s.xp);
  check('内訳に 提出/期限内/締切72時間以上前 が出る', /提出/.test(s.breakdown) && /期限内/.test(s.breakdown) && /72時間以上前/.test(s.breakdown), s.breakdown);
  check('レベル表示', /^Lv\.1$/.test(s.lv || ''), s.lv);
  check('称号', s.levelName === 'レポート見習い', s.levelName);

  log('\n=== 2. 保存内容 ===');
  let st = await getGame(sw);
  log('  ' + JSON.stringify(st.game));
  check('XP=350', st.game.xp === 350, st.game.xp);
  check('連続1日', st.game.streakDays === 1, st.game.streakDays);
  check('提出回数 1', st.game.totalSubmits === 1);
  check('履歴1件・課題名入り', st.game.history.length === 1 && st.game.history[0].name === '第3回課題提出', st.game.history[0]);
  check('履歴に XP と倍率', st.game.history[0].xp === 350 && st.game.history[0].mult === 1);
  check('seenStatus が submitted', st.runtime.seenStatus[ID] === 'submitted', st.runtime.seenStatus);
  check('pending が消費されている', await page.evaluate(() => !sessionStorage.getItem('laPendingSubmit')));

  log('\n=== 3. とじる / 再発火しない ===');
  await page.evaluate(() => { const h = document.getElementById('la-celebrate-host'); h.shadowRoot.querySelector('.close').click(); });
  await page.waitForTimeout(600);
  check('とじるで消える', await page.evaluate(() => !document.getElementById('la-celebrate-host')));
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1500);
  check('リロードで再発火しない', await page.evaluate(() => !document.getElementById('la-celebrate-host')));

  log('\n=== 4. 連続日数でティアが上がる（前日提出の状態から）===');
  // game.js は Asia/Tokyo 基準で日付を数えるため、テスト側も JST で「昨日」を求める
  const jstKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const yKey = jstKey(new Date(Date.now() - 86400000));
  await setStore(sw, { game: { xp: 700, level: 2, streakDays: 1, bestStreak: 1, lastSubmitDate: yKey, totalSubmits: 2, totalFocusMinutes: 0, history: [] } });
  state.submitted = false;
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => { if (!/js_pending|help_popups|yui|requirejs|define/i.test(e.message)) errs.push('P2 ' + e.message); });
  await p2.goto(`https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${ID}&action=editsubmission`, { waitUntil: 'load' });
  await p2.waitForSelector('#id_submitbutton');
  await p2.waitForTimeout(600);
  state.submitted = true;
  await p2.click('#id_submitbutton');
  await waitResult(p2);
  await p2.waitForTimeout(500);
  const s2 = await p2.evaluate(READ);
  log('  ' + JSON.stringify({ title: s2.title, tier: s2.tier }));
  check('連続2日 → GREAT COMPLETE!! ×2', s2.title === 'GREAT COMPLETE!!' && s2.tier === 'GREAT ×2', { t: s2.title, tier: s2.tier });
  await p2.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot.querySelector('.xp').textContent === '+700';
  }, { timeout: 15000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  const s2b = await p2.evaluate(READ);
  check('×2 の XP は 700', s2b.xp === '+700', s2b.xp);
  check('内訳に 連続2日 ×2', /連続2日/.test(s2b.breakdown) && /×2/.test(s2b.breakdown), s2b.breakdown);
  check('Lv.2 → Lv.3 で LEVEL UP', s2b.levelup === 'LEVEL UP!  Lv.3', s2b.levelup);
  await p2.close();

  log('\n=== 5. フォールバック（未提出→提出済みの変化を検知）===');
  // 5-a) 記録が無い状態でいきなり提出済みを見ても発火しない
  await clearStore(sw);
  state.submitted = true;
  const p3 = await ctx.newPage();
  p3.on('pageerror', (e) => { if (!/js_pending|help_popups|yui|requirejs|define/i.test(e.message)) errs.push('P3 ' + e.message); });
  await p3.goto(`https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${ID}&action=view`, { waitUntil: 'load' });
  await p3.waitForTimeout(1000);
  check('初観測（提出済み）では発火しない',
    await p3.evaluate(() => !document.getElementById('la-celebrate-host')),
    await getGame(sw).then((x) => x.runtime.seenStatus));
  // 5-b) 未提出を観測させてから提出済みに変化させる
  state.submitted = false;
  await p3.reload({ waitUntil: 'load' });
  await p3.waitForTimeout(800);
  check('未提出を記録した', (await getGame(sw)).runtime.seenStatus[ID] === 'notsubmitted',
    (await getGame(sw)).runtime.seenStatus);
  state.submitted = true;
  await p3.reload({ waitUntil: 'load' });
  await waitResult(p3);
  check('未提出→提出済みの変化で演出が出る（フォールバック）', true);
  await p3.close();

  log('\n=== 6. prefers-reduced-motion ===');
  await ctx.close();
  const rm = await launch(path.join(os.tmpdir(), 'la-cel-rm'));
  await rm.ctx.route('https://letus.ed.tus.ac.jp/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const q = u.searchParams;
    if (u.pathname.indexOf('/mod/assign/view.php') === 0) {
      if (req.method() === 'POST') {
        const to = `https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${q.get('id')}&action=view`;
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<script>location.replace(${JSON.stringify(to)})</script>` });
      }
      const opts = Object.assign({ id: q.get('id') || ID }, state);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: (q.get('action') === 'editsubmission' ? editHtml(opts) : viewHtml(opts)) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const rmp = await rm.ctx.newPage();
  await rmp.emulateMedia({ reducedMotion: 'reduce' });
  await rmp.goto(`https://letus.ed.tus.ac.jp/mod/assign/view.php?id=${ID}&action=editsubmission`, { waitUntil: 'load' });
  await rmp.waitForSelector('#id_submitbutton');
  await rmp.waitForTimeout(500);
  state.submitted = true;
  await rmp.click('#id_submitbutton');
  await waitResult(rmp);
  await rmp.waitForTimeout(400);
  const s3 = await rmp.evaluate(READ);
  check('reduced-motion でも演出は出る', !!s3, s3);
  check('reduced-motion では紙吹雪を描かない', !!s3 && (s3.hasCanvas === false || s3.canvasPixels === 0),
    s3 && { has: s3.hasCanvas, px: s3.canvasPixels });
  await rm.ctx.close();

  log('\nエラー: ' + (errs.length ? errs.join(' | ') : '(なし)'));
  check('ページエラーなし', errs.length === 0, errs.slice(0, 3));

  log('\n' + (fails ? 'FAILED: ' + fails : 'ALL PASS (celebrate)'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
