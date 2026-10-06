/* LETUS Assist - パチンコ演出: 電飾リングとストロボ
 *  赤 → 金 → 虹 と段階的に色が変わる。
 *  ストロボは設定 celebrate.strobe（off/weak/normal/max）に従う。
 */
(function (g) {
  'use strict';

  const CSS = `
.lights {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  --lc: #ff2d2d;
  --lc2: #ff8a00;
}
.lights .strip {
  position: absolute;
  display: flex;
  gap: 1.1vmin;
}
.lights .strip.top    { top: 1.2vmin; left: 50%; transform: translateX(-50%); }
.lights .strip.bottom { bottom: 1.2vmin; left: 50%; transform: translateX(-50%); }
.lights .strip.left   { left: 1.2vmin; top: 50%; transform: translateY(-50%); flex-direction: column; }
.lights .strip.right  { right: 1.2vmin; top: 50%; transform: translateY(-50%); flex-direction: column; }

.lights .lamp {
  width: 1.5vmin;
  height: 1.5vmin;
  min-width: 7px;
  min-height: 7px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff 0%, var(--lc) 45%, #3a0000 100%);
  box-shadow: 0 0 8px var(--lc), 0 0 18px var(--lc2);
  opacity: .35;
  animation: la-lamp 1.4s ease-in-out infinite;
  animation-delay: calc(var(--i) * -0.07s);
}
@keyframes la-lamp {
  0%, 100% { opacity: .3; transform: scale(.85); }
  50%      { opacity: 1;  transform: scale(1.12); }
}

/* 到達色 */
.lights.p-gold { --lc: #ffd23f; --lc2: #ff9f1c; }
.lights.p-rainbow .lamp {
  background: radial-gradient(circle at 35% 30%, #fff 0%, #ff6bd6 40%, #22d3ee 100%);
  box-shadow: 0 0 10px #ff6bd6, 0 0 22px #22d3ee;
  animation-name: la-lamp-rb;
}
.lights.p-rainbow { animation: la-hue 3s linear infinite; }
@keyframes la-lamp-rb {
  0%, 100% { opacity: .45; transform: scale(.9); }
  50%      { opacity: 1;  transform: scale(1.18); }
}
@keyframes la-hue { from { filter: hue-rotate(0deg) } to { filter: hue-rotate(360deg) } }

/* 枠の内側のにじみ */
.lights .glow {
  position: absolute;
  inset: -6px;
  border-radius: inherit;
  box-shadow: inset 0 0 26px var(--lc), inset 0 0 60px var(--lc2), 0 0 30px var(--lc);
  opacity: .55;
  transition: opacity .2s;
  animation: la-glow 1.4s ease-in-out infinite;
}
@keyframes la-glow { 0%,100% { opacity: .4 } 50% { opacity: .8 } }
.lights.p-rainbow .glow { animation: la-glow 1.4s ease-in-out infinite, la-hue 3s linear infinite; }

/* ---- ストロボ ---- */
.flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: #fff;
  mix-blend-mode: screen;
}
.wrap.strobe-weak .frame.flashing .flash {
  animation: la-strobe-weak .34s steps(2, end) 4;
}
.wrap.strobe-normal .frame.flashing .flash {
  animation: la-strobe-normal .12s steps(2, end) 10;
}
.wrap.strobe-normal .frame.flashing .lights .lamp {
  animation: la-lamp-strobe .1s steps(2, end) 14;
}
.wrap.strobe-max .frame.flashing .flash {
  animation: la-strobe-max .07s steps(2, end) 26;
}
.wrap.strobe-max .frame.flashing .lights .lamp {
  animation: la-lamp-strobe .06s steps(2, end) 30;
}
.wrap.strobe-max .frame.flashing .lights.p-rainbow {
  animation: la-hue .5s linear infinite;
}
@keyframes la-strobe-weak   { 0% { opacity: 0 } 50% { opacity: .28 } 100% { opacity: 0 } }
@keyframes la-strobe-normal { 0% { opacity: 0 } 50% { opacity: .72 } 100% { opacity: 0 } }
@keyframes la-strobe-max    { 0% { opacity: 0 } 50% { opacity: .95 } 100% { opacity: 0 } }
@keyframes la-lamp-strobe   { 0% { opacity: 1 } 50% { opacity: .1 } 100% { opacity: 1 } }

.wrap.strobe-off .frame.flashing .flash { animation: none; opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .wrap.strobe-weak .frame.flashing .flash,
  .wrap.strobe-normal .frame.flashing .flash,
  .wrap.strobe-max .frame.flashing .flash,
  .wrap.strobe-normal .frame.flashing .lights .lamp,
  .wrap.strobe-max .frame.flashing .lights .lamp,
  .wrap.strobe-max .frame.flashing .lights.p-rainbow { animation: none !important; }
}
`;

  const PER_SIDE = { top: 14, bottom: 14, left: 8, right: 8 };

  function create() {
    const el = document.createElement('div');
    el.className = 'lights p-red';

    const glow = document.createElement('div');
    glow.className = 'glow';
    el.appendChild(glow);

    for (const side of ['top', 'bottom', 'left', 'right']) {
      const strip = document.createElement('div');
      strip.className = 'strip ' + side;
      const n = PER_SIDE[side];
      for (let i = 0; i < n; i++) {
        const lamp = document.createElement('i');
        lamp.className = 'lamp';
        lamp.style.setProperty('--i', side === 'top' || side === 'bottom' ? i : n - 1 - i);
        strip.appendChild(lamp);
      }
      el.appendChild(strip);
    }

    let phase = 'red';

    function setPhase(p) {
      phase = p;
      el.classList.remove('p-red', 'p-gold', 'p-rainbow');
      el.classList.add('p-' + p);
    }

    function lampCount() { return el.querySelectorAll('.lamp').length; }
    function color() {
      return getComputedStyle(el).getPropertyValue('--lc').trim();
    }

    return { el, setPhase, getPhase: () => phase, lampCount, color };
  }

  /** ストロボを n 回だけ焚く（'off' なら何もしない） */
  function strobe(frameEl, level, times) {
    if (!frameEl || level === 'off' || !level) return;
    frameEl.classList.remove('flashing');
    // reflow でアニメーションをリセット
    void frameEl.offsetWidth;
    frameEl.classList.add('flashing');
    const dur = level === 'weak' ? 340 : (level === 'max' ? 70 : 120);
    const n = Math.max(1, Math.min(6, times || 1));
    const total = dur * (level === 'max' ? 26 : (level === 'weak' ? 4 : 10)) * n;
    setTimeout(() => frameEl.classList.remove('flashing'), total);
  }

  g.LA_LIGHTS = { CSS, create, strobe };
})(window);
