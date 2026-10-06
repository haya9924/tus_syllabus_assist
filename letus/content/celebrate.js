/* LETUS Assist - 提出完了時の「SUPER COMPLETE!!」演出
 *
 * 提出の検知:
 *   1) 提出フォームの submit を capture で捕捉し、sessionStorage に印を残す
 *      （同一タブの遷移をまたいで保持される）
 *   2) 遷移後の課題ページで印を消費して演出を再生
 *   3) 印が取れなかった場合に備え、提出ステータスの変化（未提出→提出済み）でも検知
 */
(function (g) {
  'use strict';

  const D = document;
  if (!g.LA || !g.LA_GAME || !g.LA_CELEBRATE_CSS) return;

  const GAME = g.LA_GAME;
  const PENDING_KEY = 'laPendingSubmit';
  const HOST_ID = 'la-celebrate-host';
  const PENDING_TTL = 120000;   // 2 分以内の提出だけ演出する

  /** 設定の欠損を埋める（プレビューページからも使うため） */
  function celebrateOpts(settings) {
    const c = (settings && settings.celebrate) || {};
    return {
      enabled: c.enabled !== false,
      sound: c.sound !== false,
      autoCloseSec: c.autoCloseSec === undefined ? 25 : Number(c.autoCloseSec),
      confetti: c.confetti === undefined ? 380 : Number(c.confetti),
      strobe: c.strobe || 'normal',
      intensity: c.intensity || 'normal',
      rainbow: c.rainbow || 'normal'
    };
  }

  /**
   * 演出の激しさ（off / normal / max）。
   * max は標準の約 2 倍の派手さ。
   */
  function intensityProfile(level) {
    const P = {
      off: {
        reelSpeed: 0, extraReach: -99, stopGap: 0, confettiMult: 0,
        volume: 0.35, extraFx: false, rollMs: 200, revealDelay: 250
      },
      normal: {
        reelSpeed: 1350, extraReach: 0, stopGap: 550, confettiMult: 1,
        volume: 0.5, extraFx: false, rollMs: 1800, revealDelay: 0
      },
      max: {
        reelSpeed: 2700, extraReach: 1, stopGap: 380, confettiMult: 2,
        volume: 0.62, extraFx: true, rollMs: 1100, revealDelay: 0
      }
    };
    return P[level] || P.normal;
  }

  // ---- 提出の捕捉（課題ページのみ） ----
  let EX = null;

  /* ------------------------------------------------ 提出の捕捉（1回だけ） */

  function submitIsFinal(e) {
    const form = e.target;
    if (!form || form.tagName !== 'FORM') return false;
    const s = e.submitter;
    if (s && (s.id === 'id_savebutton' || s.name === 'savebutton')) return false;  // 下書き保存
    if (s && (s.id === 'id_submitbutton' || s.name === 'submitbutton')) return true;
    // submitter が取れない場合（Enter など）: 提出ボタンを持つフォームなら提出とみなす
    if (!s && form.querySelector('#id_submitbutton, input[name="submitbutton"]')) return true;
    return false;
  }

  function markPending() {
    if (!EX) return;
    const due = EX.dueText();
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify({
        id: EX.id(),
        ts: Date.now(),
        name: EX.activityName(),
        course: EX.courseName(),
        dueParts: due ? due.parts : null,
        url: location.href
      }));
    } catch (e) { /* ストレージ不可でも演出側のフォールバックで拾える */ }
  }

  function hookSubmit() {
    if (g.__laSubmitHooked) return;
    g.__laSubmitHooked = true;
    D.addEventListener('submit', (e) => {
      if (submitIsFinal(e)) markPending();
    }, true);
  }

  function readPending(idNow) {
    let raw = null;
    try { raw = sessionStorage.getItem(PENDING_KEY); } catch (e) { return null; }
    if (!raw) return null;
    let p = null;
    try { p = JSON.parse(raw); } catch (e) { p = null; }
    if (!p || !p.ts) { clearPending(); return null; }
    if (Date.now() - p.ts > PENDING_TTL) { clearPending(); return null; }
    if (idNow && p.id && String(p.id) !== String(idNow)) return null;
    return p;
  }

  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------- 演出の構築 */

  const REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function build(result, opts) {
    const host = D.createElement('div');
    host.id = HOST_ID;
    // ホスト自身は透明な全画面レイヤー（中の .wrap が実際の描画を担う）
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', result.title + ' 提出完了');
    const root = host.attachShadow({ mode: 'open' });

    const style = D.createElement('style');
    style.textContent = [
      g.LA_CELEBRATE_CSS,
      g.LA_LIGHTS.CSS,
      g.LA_REELS.CSS,
      g.LA_T3D.CSS,
      g.LA_FRAME.CSS
    ].join('\n');

    const wrap = D.createElement('div');
    wrap.className = 'wrap strobe-' + (opts.strobe || 'normal');
    wrap.style.setProperty('--tier', result.tier.color);
    wrap.style.setProperty('--tier-soft', result.tier.color + '55');
    if (result.tier.mult >= 4) host.classList.add('holo');

    const bg = D.createElement('div'); bg.className = 'bg';

    // 大当たりの七色背景（回転する放射状）＋中央を落ち着かせるベール
    const rainbow = D.createElement('div'); rainbow.className = 'rainbow';
    const rb1 = D.createElement('i'); rb1.className = 'rb rb1';
    const rb2 = D.createElement('i'); rb2.className = 'rb rb2';
    rainbow.append(rb1, rb2);
    const veil = D.createElement('div'); veil.className = 'veil';

    const canvas = D.createElement('canvas'); canvas.className = 'fx';

    // --- パチンコ枠（保留ランプ・リール・テロップ・電飾・3Dテキスト）---
    const f = g.LA_FRAME.build();

    // --- 結果パネル ---
    const resultEl = D.createElement('div');
    resultEl.className = 'result';

    const title = D.createElement('h1');
    title.className = 'title';
    title.textContent = result.title;
    title.setAttribute('data-text', result.title);

    const badges = D.createElement('div'); badges.className = 'badges';
    const tier = D.createElement('span'); tier.className = 'tier';
    tier.textContent = result.tier.label + ' ×' + result.tier.mult;
    badges.appendChild(tier);

    const task = D.createElement('div'); task.className = 'task';
    task.textContent = result.name || '(無題)';
    const course = D.createElement('div'); course.className = 'course';
    course.textContent = result.course || '';
    const focus = D.createElement('div'); focus.className = 'focus';
    focus.textContent = '\u23F1 ' + Math.max(0, opts.focusMinutes | 0) + '分 集中した時間';

    const xpWrap = D.createElement('div'); xpWrap.className = 'xp-wrap';
    const xp = D.createElement('span'); xp.className = 'xp'; xp.textContent = '+0';
    const xpUnit = D.createElement('span'); xpUnit.className = 'xp-unit'; xpUnit.textContent = 'XP';
    xpWrap.append(xp, xpUnit);

    const breakdown = D.createElement('div'); breakdown.className = 'breakdown';
    breakdown.innerHTML = result.breakdownHtml;

    const level = D.createElement('div'); level.className = 'level';
    const lv = D.createElement('span'); lv.className = 'lv'; lv.textContent = 'Lv.' + result.levelBefore;
    const bar = D.createElement('div'); bar.className = 'bar';
    const fill = D.createElement('i');
    bar.appendChild(fill);
    const name = D.createElement('span'); name.className = 'name'; name.textContent = result.levelTitle;
    level.append(lv, bar, name);

    const levelup = D.createElement('div');
    levelup.className = 'levelup hidden';
    levelup.textContent = 'LEVEL UP!  Lv.' + result.levelAfter;

    resultEl.append(title, badges, task, course, focus, xpWrap, breakdown, level, levelup);
    resultEl.classList.add('hidden');

    f.stage.appendChild(resultEl);

    const close = D.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.textContent = 'とじる';

    const skip = D.createElement('button');
    skip.type = 'button';
    skip.className = 'skip';
    skip.textContent = 'スキップ \u00BB';
    skip.title = '演出を飛ばして結果を表示';

    const hint = D.createElement('div');
    hint.className = 'sound-hint hidden';
    hint.textContent = '\uD83D\uDD0A クリックで音を有効にする';

    const actions = D.createElement('div');
    actions.className = 'actions';
    actions.append(skip, close);
    wrap.append(bg, rainbow, veil, canvas, f.stage, hint, actions);
    root.append(style, wrap);

    return {
      host, root, wrap, canvas, rainbow, veil,
      frame: f, lights: f.lights, reels: f.reels, telop: f.telop, holds: f.holdEls, t3d: f.t3d,
      resultEl, title, tier, task, course, xp, xpWrap, breakdown, lv, fill, name, levelup,
      close, skip, hint
    };
  }

  /* ---------------------------------------------------------- 再生 */

  let playing = false;

  /** res（GAME.applySubmission と同じ形）を受け取って演出だけを再生する */
  function show(res, settings) {
    if (playing) close();
    playing = true;

    const opts = celebrateOpts(settings);
    if (REDUCE) opts.strobe = 'off';   // 視差・点滅を避ける設定のときはストロボも切る

    const tier = res.calc.tier;
    const mult = tier.mult;
    const breakdownHtml =
      res.calc.parts.filter((p) => p.xp > 0)
        .map((p) => p.label + ' <b>+' + p.xp + '</b>').join(' \uFF0F ') +
      (mult > 1 ? ' \uFF0F 連続' + res.entry.streak + '日 <b>×' + mult + '</b>' : '');

    const ui = build({
      title: tier.label + ' COMPLETE!!',
      tier,
      name: res.entry.name,
      course: res.entry.course,
      breakdownHtml,
      levelBefore: res.levelBefore,
      levelAfter: res.levelAfter,
      levelTitle: GAME.levelTitle(res.levelAfter)
    }, { focusMinutes: res.entry.focusMinutes, strobe: opts.strobe });

    D.documentElement.appendChild(ui.host);

    /* ------------------------------------------------ 音の準備 */
    g.LA_SOUND.setEnabled(!!opts.sound);
    const soundOk = (function () {
      // 最初の一音で解錠を試みる（鳴らなければヒントを出す）
      g.LA_SOUND.unlock();
      return g.LA_SOUND.isEnabled();
    })();
    if (opts.sound && g.LA_SOUND.isBlocked && g.LA_SOUND.isBlocked()) {
      ui.hint.classList.remove('hidden');
      ui.hint.addEventListener('click', (e) => {
        e.stopPropagation();
        g.LA_SOUND.unlock();
        fit();
        g.LA_SOUND.chakka();
        ui.hint.classList.add('hidden');
      });
    }
    const unlockOnce = () => { g.LA_SOUND.unlock(); D.removeEventListener('pointerdown', unlockOnce, true); };
    D.addEventListener('pointerdown', unlockOnce, true);

    /* ------------------------------------------------ 紙吹雪 */
    const fx = REDUCE ? null : g.LA_CONFETTI.create(ui.canvas, { amount: opts.confetti * intensityProfile(opts.intensity).confettiMult });
    if (fx) {
      const onResize = () => fx.resize();
      window.addEventListener('resize', onResize);
      ui.host.__laCleanup = () => { window.removeEventListener('resize', onResize); fx.stop(); };
    }

    /* ------------------------------------------------ フェーズ制御 */
    const timers = [];
    let won = false;
    let closed = false;
    const at = (ms, fn) => {
      timers.push(setTimeout(() => { if (!closed) fn(); }, REDUCE ? Math.min(ms, 60) : ms));
    };
    const clearTimers = () => { for (const t of timers) clearTimeout(t); timers.length = 0; };

    function telop(text, cls) {
      ui.telop.classList.remove('on', 'big', 'reach', 'win');
      void ui.telop.offsetWidth;
      if (text !== null) ui.telop.textContent = text;
      if (cls) String(cls).split(/\s+/).forEach((c) => { if (c) ui.telop.classList.add(c); });
      ui.telop.classList.add('on');
    }
    function hold(n, cls) {
      for (let i = 0; i < ui.holds.length; i++) {
        if (i < n) { ui.holds[i].classList.add('on'); if (cls) ui.holds[i].classList.add(cls); }
        else ui.holds[i].classList.remove('on', 'done');
      }
    }
    function level(p, flashTimes) {
      ui.lights.setPhase(p);
      if (flashTimes) g.LA_LIGHTS.strobe(ui.frame.frame, opts.strobe, flashTimes);
    }

    const P = intensityProfile(opts.intensity);
    const finalPhase = mult >= 5 ? 'rainbow' : (mult >= 3 ? 'gold' : 'red');
    const reachCount = mult >= 5 ? 3 : (mult >= 3 ? 2 : 1);

    // 演出の激しさに応じた紙吹雪の数
    const effConfetti = () => Math.round(opts.confetti * P.confettiMult);
    g.LA_SOUND.setVolume(P.volume);

    // レベルバー（最初は旧レベルで停止）
    ui.fill.style.width = Math.round(GAME.levelInfo(res.xpBefore).ratio * 100) + '%';
    ui.lv.textContent = 'Lv.' + res.levelBefore;

    /* ---- 大当たりの七色背景（JS 駆動） ---- */
    let rbRaf = 0;
    function startRainbow(level) {
      if (!level || level === 'off') return;
      const max = level === 'max';
      const spinSec = REDUCE ? 0 : (max ? 3.2 : 9);      // 1 周の秒数
      const spinSec2 = max ? 4.6 : 0;
      const target = REDUCE ? 0.2 : (max ? 0.62 : 0.38);
      const t0 = performance.now();
      const rb1 = ui.rainbow.querySelector('.rb1');
      const rb2 = ui.rainbow.querySelector('.rb2');
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 700);
        const sec = (now - t0) / 1000;
        ui.rainbow.style.opacity = String((target * p).toFixed(3));
        ui.veil.style.opacity = String(p.toFixed(3));
        if (spinSec > 0) {
          rb1.style.transform = 'rotate(' + ((sec / spinSec) * 360 % 360).toFixed(2) + 'deg)';
          if (max) {
            rb2.style.transform = 'rotate(' + (-((sec / spinSec2) * 360) % 360).toFixed(2) + 'deg)';
            ui.rainbow.style.filter = 'hue-rotate(' + ((sec * 150) % 360).toFixed(1) + 'deg)';
          }
        }
        rbRaf = requestAnimationFrame(step);
      };
      rbRaf = requestAnimationFrame(step);
    }

    /* ---- 3D「課題提出」を左からローリング ---- */
    function roll3D() {
      if (REDUCE) { ui.t3d.snap(); return; }
      ui.t3d.play(P.rollMs);
    }

    /* ---- 結果表示（3Dが収まってから呼ばれる）---- */
    function revealResult() {
      ui.resultEl.classList.remove('hidden');
      ui.resultEl.classList.remove('show');
      void ui.resultEl.offsetWidth;
      ui.resultEl.classList.add('show');
      ui.telop.classList.remove('on', 'big', 'win', 'reach');
      // XP カウントアップ（ゆっくり）
      const dur = REDUCE ? 1 : 1400;
      const t0 = performance.now();
      let tickAt = 0;
      const runXp = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        ui.xp.textContent = '+' + fmt(Math.round(res.calc.xp * eased));
        if (now - tickAt > 80) { tickAt = now; g.LA_SOUND.tick(Math.round(res.calc.xp * eased / 40)); }
        if (p < 1) requestAnimationFrame(runXp);
      };
      requestAnimationFrame(runXp);
      // レベルバー伸長
      setTimeout(() => {
        if (closed) return;
        ui.fill.style.width = Math.round(GAME.levelInfo(res.xpAfter).ratio * 100) + '%';
        ui.lv.textContent = 'Lv.' + res.levelAfter;
        if (res.leveledUp) {
          ui.levelup.classList.remove('hidden');
          g.LA_SOUND.levelup();
          if (fx && effConfetti() > 0) {
            fx.burst(window.innerWidth * 0.5, window.innerHeight * 0.55, 90, -Math.PI / 2, Math.PI, 19);
            fx.addRain(1400, 1.2);
          }
        }
      }, REDUCE ? 60 : 1400);
    }

    /* ---- 大当たり ---- */
    function win() {
      if (won) return;
      won = true;
      clearTimers();
      hold(4, 'done');
      telop('\u5927\u5F53\u305F\u308A\uFF01', 'big win');
      level(finalPhase, P.extraFx ? 3 : 2);
      g.LA_SOUND.reelStop();          // カラカラ停止
      g.LA_SOUND.reelStopOne();
      g.LA_SOUND.don();
      g.LA_SOUND.jackpot();           // ファンファーレ＋出玉チャリン
      ui.reels.markWin();
      ui.t3d.glow(true);
      // 大当たりの背景を七色に（off 以外）
      if (opts.rainbow && opts.rainbow !== 'off') {
        ui.wrap.classList.add('rainbow-on', 'rb-' + opts.rainbow);
        startRainbow(opts.rainbow);
      }
      roll3D();                       // 3D は大当たりと同時に左からローリング開始
      if (fx && effConfetti() > 0) {
        fx.start({ rainMs: 2600 * P.confettiMult * 0.6 });
        const n = Math.round(70 * P.confettiMult);
        fx.burst(window.innerWidth * 0.06, window.innerHeight * 0.98, n, -Math.PI / 3, 0.7, 17);
        fx.burst(window.innerWidth * 0.94, window.innerHeight * 0.98, n, -Math.PI * 2 / 3, 0.7, 17);
        if (P.extraFx) {
          fx.burst(window.innerWidth * 0.5, window.innerHeight * 0.9, 80, -Math.PI / 2, Math.PI * 0.8, 20);
        }
      }
      // 3D が収まってから結果パネルを出す
      const wait = REDUCE ? 60 : (P.rollMs + 120 + P.revealDelay);
      setTimeout(() => { if (!closed) revealResult(); }, wait);
    }

    /* ---- スキップ ---- */
    function skip() {
      if (won) return;
      clearTimers();
      if (ui.reels && ui.reels.snapToTargets) ui.reels.snapToTargets();
      ui.t3d.stop();
      win();
    }
    /* ---- 入場 ---- */
    requestAnimationFrame(() => ui.wrap.classList.add('on'));
    g.LA_SOUND.chakka();
    hold(1);
    level('red', 1);
    telop('');
    ui.resultEl.classList.add('hidden');

    // フォーカス
    at(150, () => { try { ui.close.focus({ preventScroll: true }); } catch (e) { /* ignore */ } });

    function finish(u) {
      if (u.host.__done) return;
      u.host.__done = true;
      closed = true;
      clearTimers();
      u.wrap.classList.remove('on');
      if (u.host.__laCleanup) u.host.__laCleanup();
      if (u.reels && u.reels.destroy) u.reels.destroy();
      if (g.LA_SOUND.reelStop) g.LA_SOUND.reelStop();
      if (rbRaf) { cancelAnimationFrame(rbRaf); rbRaf = 0; }
      setTimeout(() => {
        if (u.host.parentNode) u.host.parentNode.removeChild(u.host);
        playing = false;
      }, 320);
    }

    ui.close.addEventListener('click', () => finish(ui));
    ui.skip.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); skip(); });
    ui.host.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(ui); });
    ui.wrap.addEventListener('click', (e) => {
      if (e.target === ui.wrap || e.target === ui.canvas) finish(ui);
    });
    ui.host.__laFinish = () => finish(ui);

    if (REDUCE) {
      // アニメーションを最小限にして即結果へ
      at(60, () => { if (ui.reels && ui.reels.snapToTargets) ui.reels.snapToTargets(); });
      at(120, () => { hold(4, 'done'); level(finalPhase); win(); });
      const secs0 = opts.autoCloseSec;
      if (secs0 > 0) setTimeout(() => finish(ui), secs0 * 1000);
      return ui;
    }

    /* ---- 演出 off: 最小限（すぐ大当たり）---- */
    if (P.reelSpeed === 0) {
      at(250, () => { hold(2); g.LA_SOUND.pipo(2); });
      at(450, () => { hold(3); g.LA_SOUND.pipo(3); });
      at(650, () => { hold(4, 'done'); g.LA_SOUND.pipo(4); });
      at(350, () => { telop('\u8AB2\u984C\u63D0\u51FA', ''); ui.reels.snapToTargets(); });
      at(1500, () => win());
      const secsOff = opts.autoCloseSec;
      if (secsOff > 0) setTimeout(() => finish(ui), secsOff * 1000);
      return ui;
    }

    /* ---- Phase 1: 保留・変動 ---- */
    at(500, () => { hold(2); g.LA_SOUND.pipo(2); });
    at(900, () => { hold(3); g.LA_SOUND.pipo(3); });
    at(1300, () => { hold(4); g.LA_SOUND.pipo(4); });
    at(800, () => {
      telop('\u8AB2\u984C\u63D0\u51FA', '');
      if (P.reelSpeed > 0) {
        ui.reels.start(P.reelSpeed);
        g.LA_SOUND.reelStart(P.reelSpeed);   // 「カラカラ」開始
      } else {
        // 演出 off: 回さずに即揃える
        ui.reels.snapToTargets();
      }
    });

    /* ---- Phase 2: リーチ ---- */
    const reaches = Math.max(0, reachCount + P.extraReach);
    let t = 2400;
    for (let i = 0; i < reaches; i++) {
      at(t, () => {
        telop('\u30EA\u30FC\u30C1\uFF01', 'reach');
        level('gold', 1);
        g.LA_SOUND.kyuin(2);            // 「キュインキュイン」
        ui.reels.reachSlow();
      });
      t += 900;
    }
    // 提・出・済 を順に停止（間隔は激しさで変わる）
    at(t + P.stopGap, () => { if (P.reelSpeed > 0) { g.LA_SOUND.reelStopOne(); ui.reels.stopOne(0); } });
    at(t + P.stopGap * 2, () => { if (P.reelSpeed > 0) { g.LA_SOUND.reelStopOne(); ui.reels.stopOne(1); } });
    at(t + P.stopGap * 3, () => { if (P.reelSpeed > 0) { g.LA_SOUND.reelStopOne(); ui.reels.stopOne(2); } });
    // 最終リーチ（溜めを長く）
    at(t + P.stopGap * 3 + 800, () => {
      telop(mult >= 5 ? '\u78BA\u5909\uFF01' : '\u30EA\u30FC\u30C1\uFF01', 'reach big');
      level(finalPhase, 2);
      g.LA_SOUND.kyuin(3);            // 最終リーチは長め
      if (mult >= 5) g.LA_SOUND.alarm();   // 確変の警告音
    });
    // み を停止 → 大当たり
    at(t + P.stopGap * 3 + 2400, () => {
      if (P.reelSpeed > 0) {
        ui.reels.stopOne(3).then(() => win());
        setTimeout(() => { if (!won && ui.reels.isWin()) win(); }, 1200);
      } else {
        win();
      }
    });

    // 自動で閉じる
    const secs = opts.autoCloseSec;
    if (secs > 0) setTimeout(() => finish(ui), secs * 1000);

    return ui;
  }

  /** 通常の提出時: ゲーム状態を進めて保存してから演出する */
  function play(info, settings) {
    if (!settings || !celebrateOpts(settings).enabled) return Promise.resolve(null);
    const res = GAME.applySubmission(settings.game, {
      id: info.id,
      name: info.name,
      course: info.course,
      dueParts: info.dueParts,
      submittedAt: info.ts,
      focusMinutes: info.focusMinutes,
      timeZone: (settings.todo && settings.todo.timeZone) || 'Asia/Tokyo'
    });
    return GAME.saveGame(res.game).then(() => show(res, settings));
  }

  /** 再生中の演出を閉じる */
  function close() {
    const host = D.getElementById(HOST_ID);
    if (host && host.__laFinish) host.__laFinish();
  }

  /* ---------------------------------------------------------- 起動 */

  function minutesSince(ts) {
    if (!ts) return 0;
    return Math.max(0, Math.round((Date.now() - ts) / 60000));
  }

  /* ---------------------------------------------------------- 起動 */

  // プレビュー（設定ページの「演出をテスト表示」）からも使えるよう API を公開
  g.LA_CELEBRATE = { show, play, close, isPlaying: () => playing };

  // ここから下は LETUS の課題ページでの自動発火のみ
  EX = g.LA_ASSIGN;
  if (!EX || !EX.isAssignPage()) return;
  if (D.getElementById(HOST_ID)) return;
  hookSubmit();

  g.LA.getSettings().then((settings) => {
    const idNow = EX.id();
    return GAME.getRuntime().then((runtime) => {
      const status = EX.status();

      // 集中時間の起点を記録
      if (idNow && status === 'notsubmitted' && !runtime.lastOpenAt[idNow]) {
        runtime.lastOpenAt[idNow] = Date.now();
        GAME.setRuntime(runtime);
      }

      const pending = readPending(idNow);
      let fire = null;

      if (pending && status === 'notsubmitted') {
        // ファイル未添付などで提出フォームに差し戻された。印は残しておく
        // （再提出時に上書きされるので TTL で自然に消える）
        fire = null;
      } else if (pending) {
        clearPending();
        runtime.seenStatus[idNow] = 'submitted';
        fire = {
          id: pending.id || idNow,
          ts: pending.ts || Date.now(),
          name: pending.name || EX.activityName(),
          course: pending.course || EX.courseName(),
          dueParts: pending.dueParts || (EX.dueText() ? EX.dueText().parts : null),
          focusMinutes: minutesSince(runtime.lastOpenAt[idNow])
        };
      } else if (idNow && status === 'submitted' && runtime.seenStatus[idNow] === 'notsubmitted') {
        // フォールバック: ステータスが 未提出 → 提出済み に変わった
        fire = {
          id: idNow,
          ts: Date.now(),
          name: EX.activityName(),
          course: EX.courseName(),
          dueParts: EX.dueText() ? EX.dueText().parts : null,
          focusMinutes: minutesSince(runtime.lastOpenAt[idNow])
        };
      }

      if (idNow && status) runtime.seenStatus[idNow] = status;
      GAME.setRuntime(runtime);

      if (fire && settings.celebrate && settings.celebrate.enabled !== false) return play(fire, settings);
      return null;
    });
  }).catch((e) => { console.warn('[LETUS Assist] 演出の初期化に失敗:', e && e.message); });
})(window);
