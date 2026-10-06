/* LETUS Assist - 演出のテスト表示（プレビューページ） */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = process.env.LETUS_EXT || path.resolve(__dirname, '..', '..');
const REF = process.env.LETUS_REF || path.resolve(__dirname, '..', '..', '..', 'letus_assist_ref');
const EXE = process.env.CHROME_PATH || path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');

let fails = 0;
const check = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { fails++; console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const log = (s) => console.log(s);

const READ = `(() => {
  const h = document.getElementById('la-celebrate-host');
  if (!h || !h.shadowRoot) return null;
  const sr = h.shadowRoot;
  const q = (s) => sr.querySelector(s);
  return {
    on: q('.wrap') ? q('.wrap').classList.contains('on') : false,
    title: q('.title') ? q('.title').textContent : null,
    tier: q('.tier') ? q('.tier').textContent : null,
    task: q('.task') ? q('.task').textContent : null,
    course: q('.course') ? q('.course').textContent : null,
    focus: q('.focus') ? q('.focus').textContent : null,
    xp: q('.xp') ? q('.xp').textContent : null,
    breakdown: q('.breakdown') ? q('.breakdown').textContent : null,
    lv: q('.lv') ? q('.lv').textContent : null,
    levelName: q('.name') ? q('.name').textContent : null,
    levelup: q('.levelup') && !q('.levelup').classList.contains('hidden') ? q('.levelup').textContent : null,
    hasCanvas: !!q('canvas.fx'),
    holdOn: [...sr.querySelectorAll('.hold')].filter((e) => e.classList.contains('on')).length,
    holdDone: [...sr.querySelectorAll('.hold')].filter((e) => e.classList.contains('done')).length,
    telop: q('.telop') ? q('.telop').textContent : null,
    telopCls: q('.telop') ? q('.telop').className : null,
    reels: [...sr.querySelectorAll('.reel')].map((e) => e.className),
    // リール窓の中心に最も近いセルの文字を読む（transform に依存しない）
    reelChars: [...sr.querySelectorAll('.reel')].map((r) => {
      const win = r.getBoundingClientRect();
      const cy = win.top + win.height / 2;
      let best = null;
      let bestD = Infinity;
      for (const c of r.querySelectorAll('.cell')) {
        const cr = c.getBoundingClientRect();
        const d = Math.abs(cr.top + cr.height / 2 - cy);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best ? best.textContent : null;
    }),
    reelWin: q('.reels') ? q('.reels').classList.contains('win') : null,
    reelBg: (() => { const r = q('.reel'); return r ? getComputedStyle(r).backgroundColor : null; })(),
    lightPhase: q('.lights') ? q('.lights').className : null,
    t3dText: q('.t3d .face') ? q('.t3d .face').getAttribute('data-text') : null,
    t3dOn: q('.t3d') ? parseFloat(getComputedStyle(q('.t3d')).opacity) > 0.5 : null,
    t3dZ: q('.t3d') ? /(?:^|[^\d-])(-?[\d.]+)px/.test(q('.t3d').style.transform || '') : null,
    t3dVisible: (() => { const b = q('.t3d'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width > 40 && r.height > 20; })(),
    hasSkip: !!q('.skip'),
    flashing: q('.frame') ? q('.frame').classList.contains('flashing') : null,
    resultHidden: q('.result') ? q('.result').classList.contains('hidden') : null,
    resultVisibility: q('.result') ? getComputedStyle(q('.result')).visibility : null,
    resultDisplay: q('.result') ? getComputedStyle(q('.result')).display : null,
    t3dTransform: q('.t3d') ? q('.t3d').style.transform : null,
    rainbowOn: q('.wrap') ? q('.wrap').classList.contains('rainbow-on') : null,
    rbCls: q('.wrap') ? q('.wrap').className : null,
    rainbowOpacity: q('.rainbow') ? getComputedStyle(q('.rainbow')).opacity : null,
    rb1Transform: q('.rainbow .rb1') ? q('.rainbow .rb1').style.transform : null,
    rbFilter: q('.rainbow') ? q('.rainbow').style.filter : null,
    rb2Opacity: q('.rainbow .rb2') ? getComputedStyle(q('.rainbow .rb2')).opacity : null,
    veilOpacity: q('.veil') ? getComputedStyle(q('.veil')).opacity : null,
    canvasPixels: (() => { const c = q('canvas.fx'); if (!c) return -1; const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4000) if (d[i] > 8) n++; return n; })()
  };
})()`;

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-prev'), {
    executablePath: EXE, headless: true, viewport: { width: 1280, height: 900 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required']
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  await new Promise((r) => setTimeout(r, 1400));
  for (const p of ctx.pages()) await p.close().catch(() => {});

  const getGame = () => sw.evaluate(() => new Promise((r) => chrome.storage.local.get('letusAssist', (x) => r((x.letusAssist && x.letusAssist.game) || null))));

  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));

  log('=== 1. プレビューページが開ける ===');
  await p.goto('chrome-extension://' + extId + '/letus/preview/preview.html');
  await p.waitForSelector('#play');
  await p.waitForTimeout(400);
  const ui = await p.evaluate(() => ({
    title: document.querySelector('header h1').textContent,
    fields: ['streak', 'level', 'levelup', 'due', 'focus', 'name', 'course', 'sound', 'confetti', 'autoClose'].every((id) => !!document.getElementById(id)),
    hasPlay: !!document.getElementById('play'),
    status: document.getElementById('status').textContent,
    modules: typeof window.LA_CELEBRATE
  }));
  check('ページが開く', /提出完了の演出/.test(ui.title), ui.title);
  check('条件の入力欄が揃っている', ui.fields === true);
  check('演出モジュールが読み込まれている', ui.modules === 'object', ui.modules);
  check('保存済み設定の読み込みメッセージ', /読み込みました/.test(ui.status), ui.status);
  await p.screenshot({ path: path.join(REF, 'analysis', 'screenshots', 'preview-page.png') });

  log('\n=== 2. 既定条件で再生 ===');
  const gameBefore = await getGame();
  const tPlay = Date.now();
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host', { state: 'attached' });
  await p.waitForTimeout(1200);
  const early = await p.evaluate(READ);
  log('  演出中の結果パネル: ' + JSON.stringify({ hidden: early.resultHidden, visibility: early.resultVisibility, display: early.resultDisplay }));
  check('演出中は結果パネルが隠れている（visibility:hidden）',
    early.resultHidden === true && early.resultVisibility === 'hidden', early);
  check('演出中もレイアウトは確保されている（display:none ではない）', early.resultDisplay !== 'none', early.resultDisplay);
  check('演出中は 3D テキストも未表示', early.t3dOn === false, early.t3dOn);
  check('大当たり前は七色の背景が出ない', early.rainbowOn === false && parseFloat(early.rainbowOpacity) === 0, { on: early.rainbowOn, op: early.rainbowOpacity });
  // 結果パネルが出るまで待つ（パチンコのシーケンスは約 10 秒）
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot.querySelector('.result') && !h.shadowRoot.querySelector('.result').classList.contains('hidden');
  }, { timeout: 25000 });
  const elapsed = (Date.now() - tPlay) / 1000;
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot.querySelector('.xp').textContent === '+1,050';
  }, { timeout: 12000 }).catch(() => {});
  await p.waitForTimeout(1400);
  let s = await p.evaluate(READ);
  log('  ' + JSON.stringify({ title: s.title, tier: s.tier, xp: s.xp, lv: s.lv, levelup: s.levelup }));
  check('演出が出る', !!(s && s.on));
  check('連続3日 → SUPER COMPLETE!!', s.title === 'SUPER COMPLETE!!' && s.tier === 'SUPER ×3', { t: s.title, tier: s.tier });
  check('課題名・コース名が反映', s.task === '第3回課題提出' && /994321G/.test(s.course), { task: s.task, course: s.course });
  check('集中時間が反映', s.focus === '\u23F1 42分 集中した時間', s.focus);
  check('XP = (150+100+100)×3 = 1050', s.xp === '+1,050', s.xp);
  check('内訳に 連続3日 ×3', /連続3日/.test(s.breakdown) && /×3/.test(s.breakdown), s.breakdown);
  check('レベルアップ表示（Lv.15→16）', s.levelup === 'LEVEL UP!  Lv.16', s.levelup);
  check('紙吹雪が描画される', s.hasCanvas && s.canvasPixels > 0, { has: s.hasCanvas, px: s.canvasPixels });
  check('保留ランプが4つ点灯（大当たりで done）', s.holdOn === 4 && s.holdDone === 4, { on: s.holdOn, done: s.holdDone });
  check('リール4つが停止している', s.reels.filter((c) => /stopped/.test(c)).length === 4, s.reels);
  check('リールが「提出済み」で揃う', JSON.stringify(s.reelChars) === '["提","出","済","み"]', s.reelChars);
  check('停止後のリールが LETUS の薄緑（#cfefcf）', s.reelBg === 'rgb(207, 239, 207)', s.reelBg);
  check('大当たりフラグ（reels.win）が立つ', s.reelWin === true);
  check('テロップが「大当たり！」', /大当たり/.test(s.telop || ''), s.telop);
  check('3D テキストが「課題提出」で表示されている',
    s.t3dText === '課題提出' && s.t3dOn === true && s.t3dVisible === true,
    { t: s.t3dText, opacityVisible: s.t3dOn, rect: s.t3dVisible });
  check('スキップボタンがある', s.hasSkip === true);
  check('×3 は電飾が金（p-gold）', /p-gold/.test(s.lightPhase || ''), s.lightPhase);
  check('大当たり後に七色の背景が出る', s.rainbowOn === true && parseFloat(s.rainbowOpacity) > 0.2,
    { on: s.rainbowOn, op: s.rainbowOpacity });
  check('中央を暗くするベールが出る', parseFloat(s.veilOpacity) > 0.5, s.veilOpacity);
  const rotOf = (t) => { const m = /rotate\((-?[\d.]+)deg\)/.exec(t || ''); return m ? parseFloat(m[1]) : null; };
  const n1t = Date.now(); const n1 = await p.evaluate(READ);
  await p.waitForTimeout(600);
  const n2 = await p.evaluate(READ); const nEl = Date.now() - n1t;
  const dNorm = ((rotOf(n2.rb1Transform) - rotOf(n1.rb1Transform) + 360) % 360) / (nEl / 1000);
  log('  標準の回転速度: ' + dNorm.toFixed(1) + 'deg/s（' + nEl + 'ms で実測）');
  check('標準も回転している（おおよそ 40deg/s）', dNorm > 20 && dNorm < 70, { degPerSec: dNorm });
  check('標準では2枚目を重ねない', parseFloat(s.rb2Opacity) === 0, s.rb2Opacity);
  log('  演出開始から結果表示まで: ' + elapsed.toFixed(1) + 's');
  check('結果表示まで約 10 秒（8〜14秒）', elapsed >= 8 && elapsed <= 14, elapsed);
  const gameAfter = await getGame();
  check('実績（storage）は変化しない', JSON.stringify(gameBefore) === JSON.stringify(gameAfter), { before: gameBefore, after: gameAfter });
  await p.screenshot({ path: path.join(REF, 'analysis', 'screenshots', 'preview-playing.png') });

  log('\n=== 3. とじる ===');
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.close').click());
  await p.waitForTimeout(600);
  check('とじるで消える', await p.evaluate(() => !document.getElementById('la-celebrate-host')));

  log('\n=== 4. 条件を変えて再生（ULTRA / レベルアップなし / 期限超過）===');
  await p.selectOption('#streak', '5');
  await p.selectOption('#levelup', 'no');
  await p.selectOption('#due', 'late');
  await p.fill('#focus', '0');
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host', { state: 'attached' });
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot.querySelector('.xp').textContent === '+600';
  }, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  s = await p.evaluate(READ);
  log('  ' + JSON.stringify({ title: s.title, tier: s.tier, xp: s.xp, levelup: s.levelup, focus: s.focus }));
  check('連続5日 → ULTRA COMPLETE!!', s.title === 'ULTRA COMPLETE!!' && s.tier === 'ULTRA ×4', { t: s.title, tier: s.tier });
  check('期限超過 → 基本150×4 = 600', s.xp === '+600', s.xp);
  check('LEVEL UP は出ない', s.levelup === null, s.levelup);
  check('集中0分も表示', s.focus === '\u23F1 0分 集中した時間', s.focus);
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.close').click());
  await p.waitForTimeout(500);

  log('\n=== 5. 紙吹雪 0 / 期限なし / LEGEND ===');
  await p.fill('#confetti', '0');
  await p.selectOption('#streak', '9');
  await p.selectOption('#due', 'none');
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host', { state: 'attached' });
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot.querySelector('.xp').textContent === '+750';
  }, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(400);
  s = await p.evaluate(READ);
  check('LEGEND ×5', s.tier === 'LEGEND ×5', s.tier);
  check('期限なし → 150×5 = 750', s.xp === '+750', s.xp);
  check('紙吹雪 0 で描画されない', s.canvasPixels === 0, s.canvasPixels);
  await p.screenshot({ path: path.join(REF, 'analysis', 'screenshots', 'preview-legend.png') });

  log('\n=== 5-2. ストロボ off ===');
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.close').click());
  await p.waitForTimeout(600);
  await p.selectOption('#strobe', 'off');
  await p.fill('#confetti', '200');
  await p.selectOption('#streak', '3');
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host', { state: 'attached' });
  // ストロボは「焚かない」＝ flashing クラスが付かない
  let flashSeen = false;
  for (let i = 0; i < 24; i++) {
    const st = await p.evaluate(READ);
    if (st && st.flashing) { flashSeen = true; break; }
    await p.waitForTimeout(150);
  }
  check('ストロボ off では点滅しない', flashSeen === false);
  await p.screenshot({ path: path.join(REF, 'analysis', 'screenshots', 'pachinko-strobe-off.png') });

  log('\n=== 5-3. スキップ ===');
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.skip').click());
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && !h.shadowRoot.querySelector('.result').classList.contains('hidden');
  }, { timeout: 6000 });
  const sk = await p.evaluate(READ);
  check('スキップで結果が即表示', sk.resultHidden === false || !/hidden/.test(sk.resultCls || ''), sk);
  check('スキップ後もリールは揃っている', JSON.stringify(sk.reelChars) === '["提","出","済","み"]', sk.reelChars);
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.close').click());
  await p.waitForTimeout(500);

  log('\n=== 5-4. 演出の激しさ off ===');
  await p.selectOption('#intensity', 'off');
  await p.selectOption('#strobe', 'off');
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host', { state: 'attached' });
  await p.waitForTimeout(2500);
  const off = await p.evaluate(READ);
  check('off: リールが回らず即揃う', off.reelChars && JSON.stringify(off.reelChars) === '["提","出","済","み"]', off.reelChars);
  check('off: 紙吹雪が描画されない', off.canvasPixels === 0, off.canvasPixels);
  check('off: 大当たりまでが早い（3秒以内に結果）', off.resultHidden === false || off.resultVisibility === 'visible', { h: off.resultHidden, v: off.resultVisibility });
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.close').click());
  await p.waitForTimeout(500);

  log('\n=== 5-5. 演出の激しさ max（3Dが左から入る）===');
  await p.selectOption('#intensity', 'max');
  await p.selectOption('#streak', '5');
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host', { state: 'attached' });
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot.querySelector('.t3d') &&
      /translateX\(-\d/.test(h.shadowRoot.querySelector('.t3d').style.transform || '');
  }, { timeout: 20000 }).then(() => check('3D が画面外の左（translateX 負）から入る', true))
    .catch(() => check('3D が画面外の左（translateX 負）から入る', false));
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && !h.shadowRoot.querySelector('.result').classList.contains('hidden');
  }, { timeout: 25000 });
  const mx = await p.evaluate(READ);
  const tx = mx.t3dTransform || '';
  check('max: 最終的に 3D が中央（translateX(0vw)）に収まる', /translateX\(0(?:\.00)?vw\)/.test(tx), tx);
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.close').click());
  await p.waitForTimeout(500);

  log('\n=== 5-6. 音の一括スモークテスト ===');
  const snd = await p.evaluate(async () => {
    const S = window.LA_SOUND;
    if (!S) return { ok: false, reason: 'no LA_SOUND' };
    S.setEnabled(true);
    S.unlock();
    const errs = [];
    const call = (name, ...a) => { try { S[name](...a); } catch (e) { errs.push(name + ': ' + e.message); } };
    call('pipo', 3);
    call('kyuin', 3);
    call('reelStart', 1350);
    await new Promise((r) => setTimeout(r, 200));
    call('reelStop');
    call('chakka'); call('don'); call('payout'); call('jackpot'); call('alarm');
    call('levelup'); call('tick', 4); call('reelStopOne'); call('fanfare');

    // 実際に波形が出ているかを master ノードで測る（無音なら peak=0）
    let peak = 0;
    try {
      const ac = S._context();
      const master = S._master();
      if (ac && master) {
        const an = ac.createAnalyser();
        an.fftSize = 2048;
        const tap = ac.createGain();
        tap.gain.value = 0;
        master.connect(an);
        an.connect(tap);
        tap.connect(ac.destination);
        const data = new Uint8Array(an.fftSize);
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 40));
          an.getByteTimeDomainData(data);
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        }
      }
    } catch (e) { errs.push('probe: ' + e.message); }
    return { ok: errs.length === 0, errs, peak, state: S.isBlocked() ? 'blocked' : 'ok',
      running: !!(S._context() && S._context().state === 'running'),
      fns: ['chakka','pipo','reelStart','reelStop','reelStopOne','kyuin','don','payout','jackpot','alarm']
        .every((k) => typeof S[k] === 'function') };
  });
  log('  ' + JSON.stringify(snd));
  check('パチンコ音の API が揃っている', snd.fns === true, snd);
  check('すべて例外なく呼べる', snd.ok === true, snd.errs);
  check('AudioContext が動いている', snd.running === true, snd);
  check('実際に音声波形が出ている（無音でない）', snd.peak > 3, { peak: snd.peak });

  log('\n=== 5-7. 当たりの背景 七色 off / max ===');
  // off: 大当たり後も出ない
  await p.selectOption('#rainbow', 'off');
  await p.selectOption('#intensity', 'off');
  await p.selectOption('#strobe', 'off');
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host', { state: 'attached' });
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && !h.shadowRoot.querySelector('.result').classList.contains('hidden');
  }, { timeout: 20000 });
  const rbOff = await p.evaluate(READ);
  check('off: 大当たり後も七色が出ない', rbOff.rainbowOn === false && parseFloat(rbOff.rainbowOpacity) === 0,
    { on: rbOff.rainbowOn, op: rbOff.rainbowOpacity });
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.close').click());
  await p.waitForTimeout(500);

  // max: 高速回転＋重ね
  await p.selectOption('#rainbow', 'max');
  await p.selectOption('#intensity', 'max');
  await p.selectOption('#strobe', 'off');
  await p.selectOption('#streak', '1');
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host', { state: 'attached' });
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && h.shadowRoot.querySelector('.wrap').classList.contains('rainbow-on');
  }, { timeout: 20000 });
  await p.waitForTimeout(1000);
  const angleOf = (t) => { const m = /rotate\((-?[\d.]+)deg\)/.exec(t || ''); return m ? parseFloat(m[1]) : null; };
  const a1t = Date.now(); const a1 = await p.evaluate(READ);
  await p.waitForTimeout(600);
  const a2 = await p.evaluate(READ); const aEl = Date.now() - a1t;
  const dMax = ((angleOf(a2.rb1Transform) - angleOf(a1.rb1Transform) + 360) % 360) / (aEl / 1000);
  const rbMax = a2;
  log('  max: ' + JSON.stringify({ op: rbMax.rainbowOpacity, rb2: rbMax.rb2Opacity, degPerSec: dMax, filter: rbMax.rbFilter }));
  check('max: 七色が出る', rbMax.rainbowOn === true && parseFloat(rbMax.rainbowOpacity) > 0.4, rbMax.rainbowOpacity);
  check('max: 実際に回転している', dMax > 20, { degPerSec: dMax });
  check('max: 高速回転（標準の約2倍 = 60deg/s 以上）', dMax > 60, { degPerSec: dMax });
  check('max: 2枚目を重ねる（不透明度>0）', parseFloat(rbMax.rb2Opacity) > 0.1, rbMax.rb2Opacity);
  check('max: 色相も回転している', /hue-rotate/.test(rbMax.rbFilter || ''), rbMax.rbFilter);
  await p.screenshot({ path: path.join(REF, 'analysis', 'screenshots', 'pachi-6-rainbow.png') });
  await p.evaluate(() => document.getElementById('la-celebrate-host').shadowRoot.querySelector('.close').click());
  await p.waitForTimeout(500);

  log('\n=== 6. 設定ページからの導線 ===');
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errs.push('opts ' + e.message));
  await p2.goto('chrome-extension://' + extId + '/letus/options/options.html');
  await p2.waitForSelector('#testCelebrate');
  check('設定ページに「演出をテスト表示」ボタンがある', true);
  check('設定ページにストロボ強度の選択がある',
    !!(await p2.evaluate(() => document.querySelector('[data-path="celebrate.strobe"]'))));
  check('設定ページに演出の激しさの選択がある',
    !!(await p2.evaluate(() => document.querySelector('[data-path="celebrate.intensity"]'))));
  check('設定ページに七色の背景の選択がある',
    !!(await p2.evaluate(() => document.querySelector('[data-path="celebrate.rainbow"]'))));
  const [opened] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 8000 }),
    p2.click('#testCelebrate')
  ]);
  await opened.waitForLoadState('domcontentloaded');
  check('ボタンでテストページが開く', /letus\/preview\/preview\.html$/.test(opened.url()), opened.url());
  await opened.close();

  log('\nエラー: ' + (errs.length ? errs.join(' | ') : '(なし)'));
  check('ページエラーなし', errs.length === 0, errs.slice(0, 3));
  console.log('\n' + (fails ? 'FAILED: ' + fails : 'ALL PASS (preview)'));
  await ctx.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
