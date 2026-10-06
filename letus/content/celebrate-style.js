/* LETUS Assist - 演出オーバーレイの CSS とトロフィー SVG（Shadow DOM 内で使用） */
(function (g) {
  'use strict';

  const CSS = `
:host {
  all: initial;
}
* { box-sizing: border-box; margin: 0; padding: 0; }

.wrap {
  position: fixed;
  inset: 0;
  pointer-events: auto;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 下部の「とじる」と重ならないよう余白を確保する */
  padding: 1vh 0 11vh;
  overflow: hidden;
  font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, -apple-system, "Segoe UI", sans-serif;
  opacity: 0;
  transition: opacity .28s ease;
  --tier: #e879f9;
  --tier-soft: #e879f955;
}
.wrap.on { opacity: 1; }

.bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 80% at 50% 42%, #171733 0%, #0b0b16 45%, #04040a 100%);
  opacity: 0;
  transition: opacity .3s ease;
}
.wrap.on .bg { opacity: 1; }
.bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 50% at 50% 45%, var(--tier-soft) 0%, transparent 70%);
  opacity: .55;
  animation: la-pulse 3.2s ease-in-out infinite;
}
@keyframes la-pulse { 0%,100% { opacity: .38 } 50% { opacity: .72 } }

canvas.fx { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

/* ---- 大当たりの背景（七色・回転する放射状） ---- */
.rainbow {
  position: absolute;
  inset: -35%;
  pointer-events: none;
  /* 出現・回転は JS で制御する（CSS アニメが環境により止まるため） */
  opacity: 0;
  /* 中心は暗く抜いて、枠と結果テキストを読みやすく保つ */
  -webkit-mask-image: radial-gradient(closest-side, transparent 10%, #000 58%);
  mask-image: radial-gradient(closest-side, transparent 10%, #000 58%);
}
.rainbow .rb {
  position: absolute;
  inset: 0;
  display: block;
  border-radius: 50%;
  background: repeating-conic-gradient(from 0deg,
    #ff2d2d 0deg,   #ff9f1c 26deg, #ffe066 52deg, #4ade80 78deg,
    #22d3ee 104deg, #60a5fa 130deg, #c084fc 156deg, #ff2bd6 182deg,
    #ff2d2d 208deg);
  filter: blur(26px) saturate(1.35);
  will-change: transform;
}
.rainbow .rb2 { opacity: 0; }

/* 段階ごとの目標値（JS がこの値まで立ち上げる。CSS はフォールバック） */
.wrap.rainbow-on .rainbow { opacity: var(--rb-op, .38); }
.wrap.rb-normal .rainbow { --rb-op: .38; }
.wrap.rb-max .rainbow { --rb-op: .62; }
.wrap.rb-max .rainbow .rb2 { opacity: .5; }

/* 中央を落ち着かせるベール（虹は周囲で輝いたまま） */
.veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(58% 54% at 50% 48%,
    rgba(4, 4, 10, .72) 0%, rgba(4, 4, 10, .48) 55%, rgba(4, 4, 10, 0) 82%);
}
.wrap.rainbow-on .veil { opacity: 1; }

.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .4em;
  padding: 0 4vw;
  text-align: center;
  max-height: 100%;
  overflow: visible;
}

/* ---- タイトル（ネオン＋クロマティックアベレーション） ---- */
.title {
  position: relative;
  font-size: clamp(26px, min(8.2vw, 10vh), 104px);
  font-weight: 900;
  letter-spacing: .02em;
  line-height: 1.02;
  margin-top: .05em;
  color: #fff;
  -webkit-text-stroke: 1.5px rgba(255,255,255,.65);
  text-shadow:
    0 0 6px #fff,
    0 0 18px #6be3ff,
    0 0 34px #22d3ee,
    0 0 58px #e879f9,
    0 0 90px #a855f7;
  animation: la-title-in .5s cubic-bezier(.15,1.6,.4,1) both, la-jitter .28s steps(2) infinite;
}
.title::before, .title::after {
  content: attr(data-text);
  position: absolute;
  left: 0; top: 0;
  width: 100%;
  mix-blend-mode: screen;
  pointer-events: none;
}
.title::before { color: #00fff2; -webkit-text-stroke: 0; transform: translate(-3px, 0); animation: la-ab1 .5s steps(3) infinite; }
.title::after  { color: #ff2bd6; -webkit-text-stroke: 0; transform: translate(3px, 0);  animation: la-ab2 .5s steps(3) infinite; }

@keyframes la-ab1 { 0%{transform:translate(-3px,0)} 33%{transform:translate(-5px,1px)} 66%{transform:translate(-2px,-1px)} 100%{transform:translate(-3px,0)} }
@keyframes la-ab2 { 0%{transform:translate(3px,0)}  33%{transform:translate(5px,-1px)} 66%{transform:translate(2px,1px)}  100%{transform:translate(3px,0)} }
@keyframes la-jitter { 0%{margin-left:0} 50%{margin-left:.6px} 100%{margin-left:-.5px} }
@keyframes la-title-in { 0%{opacity:0; transform:scale(.6) skewX(14deg)} 60%{opacity:1; transform:scale(1.06) skewX(-3deg)} 100%{transform:scale(1) skewX(0)} }

/* ---- とじる ---- */
.actions {
  position: absolute;
  right: max(18px, 3vw);
  bottom: max(18px, 3vh);
  display: flex;
  align-items: center;
  gap: .6em;
  opacity: 0;
  transform: translateY(14px);
  transition: opacity .3s ease, transform .3s cubic-bezier(.2,1.4,.4,1);
}
.wrap.on .actions { opacity: 1; transform: translateY(0); }

.close {
  position: static;
  border: 0;
  cursor: pointer;
  font-family: inherit;
  font-size: clamp(13px, 2vw, 16px);
  font-weight: 800;
  letter-spacing: .08em;
  color: #fff;
  padding: .65em 2.2em;
  border-radius: 999px;
  background: linear-gradient(135deg, #6d28d9, #a855f7 45%, #ec4899);
  box-shadow: 0 6px 22px #a855f788, inset 0 1px 0 #ffffff66;
  transition: filter .15s;
}
.close:hover { filter: brightness(1.12); }

.skip {
  border: 1px solid #ffffff44;
  background: #ffffff14;
  color: #e2e8f0;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: .5em 1.2em;
  border-radius: 999px;
  transition: background .15s;
}
.skip:hover { background: #ffffff28; }
.close:focus-visible { outline: 3px solid #fff8; outline-offset: 3px; }

.sound-hint {
  position: absolute;
  bottom: max(84px, 12vh);
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #9aa4c7;
  background: #ffffff10;
  border: 1px solid #ffffff22;
  padding: .35em .8em;
  border-radius: 999px;
  cursor: pointer;
}

@keyframes la-pop { 0%{opacity:0; transform:scale(.7)} 100%{opacity:1; transform:scale(1)} }

@media (prefers-reduced-motion: reduce) {
  .title, .title::before, .title::after, .xp-wrap, .levelup, .bg::after {
    animation: none !important;
  }
  /* 虹は回転させず、控えめな静的表示にする（JS 側でも低い値に固定） */
  .wrap.rb-max .rainbow { --rb-op: .2; }
  .wrap.rb-max .rainbow .rb2 { opacity: 0; }
  .bar i { transition-duration: .2s; }
}
`;

  g.LA_CELEBRATE_CSS = CSS;
})(window);
