/* LETUS Assist - パチンコ演出: 3D テキスト（固定「課題提出」）
 *  CSS 3D の積層で押し出し、回転しながら手前に飛び出して定位置に収まる。
 *  （CSS アニメーションは preserve-3d と噛み合わない環境があるため JS で駆動する）
 */
(function (g) {
  'use strict';

  const LAYERS = 20;

  const CSS = `
.t3d-slot {
  perspective: 900px;
  perspective-origin: 50% 45%;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.5em;
  font-size: clamp(40px, min(13vw, 13.5vh), 170px);
}
.t3d {
  position: relative;
  transform-style: preserve-3d;
  font-weight: 900;
  font-size: inherit;
  letter-spacing: .04em;
  line-height: 1;
  white-space: nowrap;
  opacity: 0;
  will-change: transform, opacity;
}
.t3d span {
  position: absolute;
  left: 0;
  top: 0;
  white-space: nowrap;
  color: #fff5c2;
  -webkit-text-stroke: 2px #7a3d00;
  text-shadow: 0 0 18px #ffb300, 0 0 42px #ff6a00;
}
.t3d .side {
  color: #ffcf3f;
  -webkit-text-stroke: 1px #8a4a00;
}
.t3d .face {
  position: relative;
  color: #fffdf2;
  -webkit-text-stroke: 2px #b06a00;
  text-shadow:
    0 0 6px #fff,
    0 0 20px #ffd23f,
    0 0 44px #ff9f1c,
    0 0 80px #ff6a00;
}
.t3d .face::after {
  content: attr(data-text);
  position: absolute;
  left: 0; top: 0;
  color: #fff;
  text-shadow: 0 0 26px #fff;
  opacity: .5;
  mix-blend-mode: screen;
}
.t3d.win-glow .face {
  text-shadow:
    0 0 8px #fff,
    0 0 24px #ffd23f,
    0 0 56px #ff6bd6,
    0 0 96px #22d3ee;
}
`;

  /* 入場アニメーション: 画面外左から大きく回転しながら入り、
     中央を少し通り過ぎてから戻って定位置に収まる（Universal Studios 風）。
     x は vw（ビューポート幅）単位。 */
  const KEYS = [
    { at: 0.00, x: -115, ry: -125, rx: 12, z: -120, sc: 1.65, op: 0 },
    { at: 0.35, x: -28, ry: -48, rx: -5, z: 60, sc: 1.38, op: 1 },
    { at: 0.60, x: 7, ry: 15, rx: 4, z: 30, sc: 1.12, op: 1 },
    { at: 0.80, x: -3.5, ry: -6, rx: -2, z: -6, sc: 1.03, op: 1 },
    { at: 1.00, x: 0, ry: 0, rx: 0, z: 0, sc: 1, op: 1 }
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }

  function sample(p) {
    for (let i = 0; i < KEYS.length - 1; i++) {
      const a = KEYS[i];
      const b = KEYS[i + 1];
      if (p >= a.at && p <= b.at) {
        const t = (p - a.at) / (b.at - a.at || 1);
        // 区間ごとに軽くイージング
        const e = t * t * (3 - 2 * t);
        return {
          x: lerp(a.x, b.x, e),
          z: lerp(a.z, b.z, e),
          ry: lerp(a.ry, b.ry, e),
          rx: lerp(a.rx, b.rx, e),
          sc: lerp(a.sc, b.sc, e),
          op: lerp(a.op, b.op, e)
        };
      }
    }
    return KEYS[KEYS.length - 1];
  }

  function create(text) {
    const slot = document.createElement('div');
    slot.className = 't3d-slot';

    const box = document.createElement('div');
    box.className = 't3d';

    for (let i = LAYERS - 1; i >= 1; i--) {
      const s = document.createElement('span');
      s.className = 'side';
      s.textContent = text;
      s.style.transform = 'translateZ(' + (-i * 1.1) + 'px)';
      s.style.color = 'hsl(38 ' + Math.max(30, 95 - i * 3) + '% ' + Math.max(18, 62 - i * 2) + '%)';
      box.appendChild(s);
    }
    const face = document.createElement('span');
    face.className = 'face';
    face.textContent = text;
    face.setAttribute('data-text', text);
    box.appendChild(face);

    slot.appendChild(box);

    let raf = 0;
    let phase = 'idle';   // idle | in | float
    let t0 = 0;
    let durIn = 1800;     // 入場にかける時間（intensity で変わる）

    function apply(x, z, ry, rx, sc, op) {
      box.style.transform =
        'translateX(' + x.toFixed(2) + 'vw) translateZ(' + z.toFixed(2) + 'px) rotateY(' +
        ry.toFixed(2) + 'deg) rotateX(' + rx.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
      box.style.opacity = String(op);
    }

    function loop(now) {
      if (phase === 'in') {
        const p = Math.min(1, (now - t0) / durIn);
        const s = sample(p);
        apply(s.x, s.z, s.ry, s.rx, s.sc, s.op);
        if (p >= 1) { phase = 'float'; t0 = now; }
      } else if (phase === 'float') {
        const t = (now - t0) / 3600;
        const a = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        apply(0, 26 * a, -4 + 8 * a, 0, 1 + 0.03 * a, 1);
      } else {
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    /** 左からローリングして定位置へ。ms で所要時間を指定できる */
    function play(ms) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ms) durIn = Math.max(120, Number(ms) || 1800);
      const k0 = KEYS[0];
      apply(k0.x, k0.z, k0.ry, k0.rx, k0.sc, k0.op);
      phase = 'in';
      t0 = performance.now();
      raf = requestAnimationFrame(loop);
    }

    /** reduced-motion 用: アニメーションせず即定位置 */
    function snap() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      phase = 'idle';
      apply(0, 0, 0, 0, 1, 1);
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      phase = 'idle';
      const k0 = KEYS[0];
      apply(k0.x, k0.z, k0.ry, k0.rx, k0.sc, 0);
    }

    /** 入場にかける時間（結果表示のタイミング計算に使う） */
    function duration() { return durIn; }

    function glow(on) { box.classList.toggle('win-glow', !!on); }

    function state() { return phase; }

    return { el: slot, box, face, play, snap, stop, glow, state, duration, text };
  }

  g.LA_T3D = { CSS, create, LAYERS, KEYS };
})(window);
