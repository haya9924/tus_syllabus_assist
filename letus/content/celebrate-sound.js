/* LETUS Assist - 演出用の合成音（Web Audio / 外部ファイル不要）
 *
 * パチンコらしさのポイント:
 *   - ホールの強い残響（合成 IR の Convolver で簡易リバーブ）
 *   - チャッカーの金属音（非整数倍音を重ねた短いリング）
 *   - リール変動の「カラカラ」＝速いクリック連打
 *   - リーチの「キュイン」＝高域の速いスイープ＋深いビブラート＋残響
 *   - 大当たりの「ドン」＋ファンファーレ＋出玉の「チャリンチャリン」
 */
(function (g) {
  'use strict';

  let ctx = null;
  let master = null;      // 全体音量
  let dry = null;         // 原音
  let wet = null;         // 残響
  let conv = null;
  let enabled = true;
  let blocked = false;
  let volume = 0.5;       // 演出の激しさで 0.35 / 0.5 / 0.62
  let reelTimer = 0;

  /* ------------------------------------------------------------ 基盤 */

  function makeIR(c, seconds, decay) {
    const len = Math.max(1, Math.floor(c.sampleRate * seconds));
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // 立ち上がりを少し遅らせ、指数減衰＋わずかなざらつき
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * Math.min(1, t * 40);
      }
    }
    return buf;
  }

  function ac() {
    if (ctx) return ctx;
    const C = g.AudioContext || g.webkitAudioContext;
    if (!C) { blocked = true; return null; }
    try {
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = volume;

      // ホールの残響（0.9 秒・やや長め）
      conv = ctx.createConvolver();
      conv.buffer = makeIR(ctx, 0.9, 2.6);
      wet = ctx.createGain();
      wet.gain.value = 0.34;
      dry = ctx.createGain();
      dry.gain.value = 0.85;

      master.connect(dry);
      dry.connect(ctx.destination);
      master.connect(conv);
      conv.connect(wet);
      wet.connect(ctx.destination);
    } catch (e) {
      blocked = true;
      return null;
    }
    return ctx;
  }

  function unlock() {
    const c = ac();
    if (!c) return false;
    if (c.state === 'suspended') {
      const p = c.resume();
      if (p && p.catch) p.catch(() => {});
    }
    blocked = c.state === 'suspended';
    return c.state === 'running';
  }

  function ready() {
    const c = ac();
    return (enabled && c && c.state === 'running') ? c : null;
  }

  /* ------------------------------------------------------- 部品 */

  /** 単純な音（周波数スイープ付き） */
  function tone(o) {
    const c = ready();
    if (!c) return;
    const t0 = o.at !== undefined ? o.at : c.currentTime;
    const dur = o.dur || 0.2;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 && o.f1 !== o.f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
    }
    const peak = o.gain !== undefined ? o.gain : 0.25;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** ビブラート付きの音（キュイン用） */
  function vibTone(o) {
    const c = ready();
    if (!c) return;
    const t0 = o.at !== undefined ? o.at : c.currentTime;
    const dur = o.dur || 0.3;
    const osc = c.createOscillator();
    const gain = c.createGain();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();

    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 && o.f1 !== o.f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + dur);
    }
    lfo.frequency.value = o.vibRate || 34;
    lfoGain.gain.value = o.vibDepth || 190;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const peak = o.gain !== undefined ? o.gain : 0.16;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.setValueAtTime(peak, t0 + dur * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(master);
    lfo.start(t0);
    osc.start(t0);
    lfo.stop(t0 + dur + 0.02);
    osc.stop(t0 + dur + 0.02);
  }

  /** ノイズ（フィルタ付き） */
  function noise(o) {
    const c = ready();
    if (!c) return;
    const t0 = o.at !== undefined ? o.at : c.currentTime;
    const dur = o.dur || 0.3;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, o.decay || 2);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = o.filter || 'highpass';
    f.frequency.value = o.freq || 2000;
    if (o.q) f.Q.value = o.q;
    const gain = c.createGain();
    gain.gain.value = o.gain !== undefined ? o.gain : 0.12;
    src.connect(f); f.connect(gain); gain.connect(master);
    src.start(t0);
  }

  /** 金属を叩いた音（非整数倍音を重ねた短いリング） */
  function metal(o) {
    const c = ready();
    if (!c) return;
    const t0 = o.at !== undefined ? o.at : c.currentTime;
    const base = o.freq || 2400;
    const ratios = [1, 1.42, 1.93, 2.71, 3.62];
    const dur = o.dur || 0.14;
    ratios.forEach((r, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = base * r;
      const peak = (o.gain !== undefined ? o.gain : 0.12) / (i + 1.3);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (1 - i * 0.12));
      osc.connect(gain); gain.connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    });
    noise({ at: t0, dur: 0.035, gain: (o.gain !== undefined ? o.gain : 0.12) * 0.8, filter: 'bandpass', freq: base * 1.6, q: 1.2, decay: 3 });
  }

  /* ------------------------------------------------------- パチンコ音 */

  /** チャッカー入賞: 金属的な「チャッ」 */
  function chakka() {
    const c = ready();
    if (!c) return;
    const now = c.currentTime;
    metal({ freq: 2350, dur: 0.16, gain: 0.16, at: now });
    tone({ type: 'square', f0: 1500, f1: 700, dur: 0.05, gain: 0.07, at: now });
  }

  /** 保留ランプ点灯: 「ピポッ」（2音） */
  function pipo(i) {
    const c = ready();
    if (!c) return;
    const now = c.currentTime;
    const k = (i | 0) % 4;
    const f = 1046.5 * Math.pow(1.06, k);
    tone({ type: 'square', f0: f, dur: 0.05, gain: 0.12, at: now });
    tone({ type: 'square', f0: f * 1.5, dur: 0.06, gain: 0.1, at: now + 0.055 });
  }

  /** リールの歯音（クリック 1 回） */
  function click(at, gain) {
    const c = ready();
    if (!c) return;
    noise({ at, dur: 0.02, gain: gain || 0.05, filter: 'bandpass', freq: 2100, q: 1.6, decay: 4 });
    tone({ type: 'square', f0: 2700, f1: 1900, dur: 0.018, gain: (gain || 0.05) * 0.7, at });
  }

  /** リール変動の「カラカラ」開始（止めるまで鳴り続ける） */
  function reelStart(speed) {
    const c = ready();
    if (!c) return;
    reelStop();
    const interval = Math.max(24, 46 - (speed ? speed / 120 : 0));
    reelTimer = setInterval(() => {
      const cc = ready();
      if (!cc) return;
      click(cc.currentTime + 0.001, 0.045);
    }, interval);
  }

  function reelStop() {
    if (reelTimer) { clearInterval(reelTimer); reelTimer = 0; }
  }

  /** 変動が止まる瞬間の「カチッ」 */
  function reelStopOne() {
    const c = ready();
    if (!c) return;
    const now = c.currentTime;
    click(now, 0.09);
    tone({ type: 'triangle', f0: 520, f1: 300, dur: 0.07, gain: 0.11, at: now });
  }

  /** リーチの「キュイン」: 高域スイープ＋深いビブラート＋残響 */
  function kyuin(times) {
    const c = ready();
    if (!c) return;
    let t = c.currentTime;
    const n = Math.max(1, Math.min(3, times || 1));
    for (let i = 0; i < n; i++) {
      // 上昇 → 下降（キュイン）
      vibTone({ type: 'square', f0: 980, f1: 3600, dur: 0.17, at: t, vibRate: 40, vibDepth: 240, gain: 0.13 });
      vibTone({ type: 'square', f0: 3600, f1: 1150, dur: 0.24, at: t + 0.17, vibRate: 30, vibDepth: 300, gain: 0.12 });
      t += 0.46;
    }
  }

  /** 大当たりの「ドン」: 低音の衝撃＋残響 */
  function don() {
    const c = ready();
    if (!c) return;
    const now = c.currentTime;
    tone({ type: 'sine', f0: 165, f1: 36, dur: 0.6, gain: 0.5, at: now });
    tone({ type: 'triangle', f0: 100, f1: 28, dur: 0.45, gain: 0.3, at: now });
    noise({ at: now, dur: 0.5, gain: 0.2, filter: 'lowpass', freq: 420, q: 0.7, decay: 2.2 });
  }

  /** 出玉の「チャリンチャリン」 */
  function payout(count) {
    const c = ready();
    if (!c) return;
    const n = Math.max(4, Math.min(14, count || 8));
    let t = c.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const f = [3100, 4200, 5300, 6100][i % 4] * (1 + Math.random() * 0.05);
      metal({ freq: f, dur: 0.09, gain: 0.075, at: t });
      t += 0.045 + Math.random() * 0.05;
    }
  }

  /** 大当たりファンファーレ（電子音の速い上行＋チャージ＋クラッシュ） */
  function jackpot() {
    const c = ready();
    if (!c) return;
    const now = c.currentTime;

    // チャージ（上昇スイープ）
    tone({ type: 'sawtooth', f0: 300, f1: 2200, dur: 0.32, gain: 0.12, at: now });

    // 速い上行フレーズ（ピコピコ）
    const seq = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093, 2637];
    seq.forEach((f, i) => {
      tone({ type: 'square', f0: f, dur: 0.11, gain: 0.12, at: now + 0.3 + 0.055 * i });
      tone({ type: 'square', f0: f * 2, dur: 0.09, gain: 0.05, at: now + 0.3 + 0.055 * i });
    });

    // 締めの和音＋クラッシュ
    [1046.5, 1318.5, 1568, 2093].forEach((f) => {
      tone({ type: 'triangle', f0: f, dur: 1.0, gain: 0.1, at: now + 0.78 });
    });
    noise({ at: now + 0.76, dur: 1.1, gain: 0.14, filter: 'highpass', freq: 2600, decay: 1.8 });
    // 出玉
    payout(10);
    // 余韻の「フィーバー」ループ
    let t = now + 1.5;
    for (let i = 0; i < 6; i++) {
      tone({ type: 'square', f0: i % 2 ? 1318.5 : 1046.5, dur: 0.1, gain: 0.07, at: t });
      t += 0.14;
    }
  }

  /** 確変などの警告音 */
  function alarm() {
    const c = ready();
    if (!c) return;
    const now = c.currentTime;
    for (let i = 0; i < 3; i++) {
      vibTone({ type: 'sawtooth', f0: 1500, f1: 2600, dur: 0.16, at: now + i * 0.22, vibRate: 22, vibDepth: 150, gain: 0.1 });
    }
  }

  /* ------------------------------------------------------- 旧 API 互換 */

  function tick(index) {
    const c = ready();
    if (!c) return;
    const step = Math.min(24, index | 0);
    tone({ type: 'square', f0: 760 + step * 30, dur: 0.035, gain: 0.05 });
  }

  function levelup() {
    const c = ready();
    if (!c) return;
    const now = c.currentTime;
    vibTone({ type: 'sawtooth', f0: 420, f1: 1800, dur: 0.45, at: now, vibRate: 18, vibDepth: 60, gain: 0.13 });
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
      tone({ type: 'square', f0: f, dur: 0.4, gain: 0.13, at: now + 0.12 + 0.07 * i });
    });
    noise({ at: now + 0.12, dur: 0.5, gain: 0.07, filter: 'highpass', freq: 3000, decay: 2 });
  }

  function fanfare() { jackpot(); }

  g.LA_SOUND = {
    setEnabled(v) { enabled = !!v; if (!enabled) reelStop(); },
    isEnabled() { return enabled; },
    isBlocked() { return blocked; },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (master) master.gain.value = volume;
    },
    getVolume() { return volume; },
    unlock,
    // テスト用（実際に音が出ているかの測定に使う）
    _context() { return ctx; },
    _master() { return master; },
    // 新パチンコ音
    chakka, pipo, reelStart, reelStop, reelStopOne, kyuin, don, payout, jackpot, alarm,
    // 互換
    reel() { chakka(); },
    tick, levelup, fanfare
  };
})(window);
