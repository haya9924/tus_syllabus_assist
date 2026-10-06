/* LETUS Assist - パチンコ演出: 枠・保留ランプ・テロップ・結果パネル */
(function (g) {
  'use strict';

  const CSS = `
.stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: .5em;
  padding: 0 2vw;
  width: min(860px, 94vw);
  text-align: center;
}

/* ---- パチンコ枠 ---- */
.frame {
  position: relative;
  width: 100%;
  padding: 2.6vmin 3.4vmin 2.2vmin;
  border-radius: 18px;
  background:
    linear-gradient(180deg, #2a1030 0%, #150a1c 55%, #0a0610 100%);
  box-shadow:
    0 0 0 3px #d4a12a,
    0 0 0 7px #3a2410,
    inset 0 0 40px rgba(0,0,0,.85),
    0 24px 60px rgba(0,0,0,.6);
}
.frame::before {
  content: '';
  position: absolute;
  inset: 1.1vmin;
  border-radius: 12px;
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(255,210,63,.18) 0%, transparent 60%),
    radial-gradient(120% 90% at 50% 100%, rgba(120,80,255,.16) 0%, transparent 60%);
  pointer-events: none;
}

/* ---- 保留ランプ ---- */
.holds {
  display: flex;
  gap: .7vmin;
  justify-content: center;
  margin-bottom: 1.2vmin;
}
.holds .hold {
  width: 2.1vmin;
  height: .9vmin;
  min-width: 12px;
  min-height: 6px;
  border-radius: 3px;
  background: #2b2338;
  box-shadow: inset 0 0 4px #000;
  transition: background .12s, box-shadow .12s;
}
.holds .hold.on {
  background: #ff4040;
  box-shadow: 0 0 10px #ff4040, 0 0 22px #ff8a00;
}
.holds .hold.done { background: #ffd23f; box-shadow: 0 0 12px #ffd23f, 0 0 26px #ff9f1c; }

/* ---- テロップ ---- */
.telop {
  min-height: 1.9em;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 1vmin 0 .4vmin;
  font-weight: 900;
  font-size: clamp(15px, min(3.2vw, 3.4vh), 30px);
  letter-spacing: .18em;
  color: #ffe98a;
  text-shadow: 0 0 10px #ff9f1c, 0 0 26px #ff6a00, 0 2px 0 #7a3d00;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity .18s, transform .18s;
}
.telop.on { opacity: 1; transform: translateY(0); }
.telop.big {
  font-size: clamp(22px, min(5.4vw, 6vh), 54px);
  color: #fff;
  text-shadow: 0 0 10px #fff, 0 0 26px #ff2bd6, 0 0 54px #22d3ee, 0 3px 0 #5a0040;
  animation: la-telop-pop .45s cubic-bezier(.2,1.7,.4,1) both;
}
.telop.reach { color: #fff; text-shadow: 0 0 12px #fff, 0 0 30px #ff2d2d, 0 0 60px #ff8a00; }
.telop.win   { color: #fff; text-shadow: 0 0 12px #fff, 0 0 34px #ffd23f, 0 0 70px #ff6bd6; }
@keyframes la-telop-pop {
  0% { opacity: 0; transform: scale(.5) rotate(-4deg) }
  60% { opacity: 1; transform: scale(1.16) rotate(2deg) }
  100% { transform: scale(1) rotate(0) }
}

/* ---- 結果パネル ---- */
.result { width: 100%; display: flex; flex-direction: column; align-items: center; gap: .15em; }
/* 子孫（.levelup など）を消す */
.result .hidden { display: none !important; }
/* 結果パネル自体は「場所を確保したまま隠す」。
   display:none にすると表示時にレイアウトが飛ぶため visibility を使う。
   （.result に hidden を付けても子孫セレクタ .result .hidden は効かないのが以前のバグ） */
.result.hidden {
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
}
.result.show { animation: la-result-in .5s cubic-bezier(.2,1.5,.4,1) both; }
@keyframes la-result-in {
  0%   { opacity: 0; transform: translateY(14px) scale(.94); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.result .badges { display: flex; gap: .5em; flex-wrap: wrap; justify-content: center; margin-top: .3em; }
.result .tier {
  font-size: clamp(12px, min(2.4vw, 2.6vh), 20px);
  font-weight: 800;
  letter-spacing: .06em;
  color: #fff;
  padding: .3em .9em;
  border-radius: 999px;
  background: linear-gradient(135deg, #7c3aed, #a855f7 45%, #d946ef);
  box-shadow: 0 0 14px #a855f7aa, inset 0 0 12px #ffffff44;
}
.result .task { font-size: clamp(12px, min(2.6vw, 2.8vh), 22px); font-weight: 700; color: #e8eaff; max-width: 24em; }
.result .course { font-size: clamp(11px, 2vw, 16px); color: #9aa4c7; }
.result .focus { font-size: clamp(11px, 2vw, 16px); color: #b9c2e0; }

.xp-wrap { margin-top: .15em; display: flex; align-items: baseline; gap: .1em; }
.xp {
  font-size: clamp(26px, min(7.6vw, 8.6vh), 82px);
  font-weight: 900;
  letter-spacing: -.02em;
  line-height: 1;
  background: linear-gradient(180deg, #fff6c9 0%, #ffd23f 38%, #ff9f1c 72%, #e26a00 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 12px #ffb30088) drop-shadow(0 3px 0 #7a3d00);
}
.xp-unit {
  font-size: clamp(14px, min(4vw, 5vh), 42px);
  font-weight: 900;
  background: linear-gradient(180deg, #fff6c9, #ffb300);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.breakdown { font-size: clamp(11px, 1.9vw, 15px); color: #8f9ac2; }
.breakdown b { color: #ffd23f; }

.level {
  width: min(560px, 86vw);
  margin-top: .4em;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: .7em;
  color: #cdd4ee;
  font-size: clamp(11px, 1.9vw, 15px);
}
.level .lv { font-weight: 900; color: #fff; font-size: 1.15em; }
.level .name { color: #c8b6ff; font-weight: 700; white-space: nowrap; }
.bar {
  height: 12px; border-radius: 999px; background: #1d1f3a;
  box-shadow: inset 0 0 8px #0008; overflow: hidden;
}
.bar i {
  display: block; height: 100%; width: 0; border-radius: 999px;
  background: linear-gradient(90deg, #22d3ee, #a855f7 55%, #f472b6);
  box-shadow: 0 0 12px #a855f7aa;
  transition: width 1.1s cubic-bezier(.25,1.3,.35,1);
}
.levelup {
  margin-top: .3em;
  font-weight: 900;
  font-size: clamp(14px, min(3.2vw, 3.6vh), 30px);
  letter-spacing: .1em;
  color: #fff;
  text-shadow: 0 0 10px #ffd23f, 0 0 26px #ff9f1c, 0 0 44px #ff6a00;
  animation: la-levelup .8s cubic-bezier(.2,1.8,.4,1) both;
}
@keyframes la-levelup { 0%{opacity:0; transform:scale(.5)} 60%{opacity:1; transform:scale(1.18)} 100%{transform:scale(1)} }
`;

  const HOLDS = 4;

  /**
   * パチンコ枠を組み立てる
   * @returns {{root, frame, lights, holds, reels, telop, t3dSlot, result, refs}}
   */
  function build() {
    const stage = document.createElement('div');
    stage.className = 'stage';

    const frame = document.createElement('div');
    frame.className = 'frame';

    // 電飾
    const lights = g.LA_LIGHTS.create();
    frame.appendChild(lights.el);

    const body = document.createDocumentFragment();

    // 保留ランプ
    const holds = document.createElement('div');
    holds.className = 'holds';
    for (let i = 0; i < HOLDS; i++) {
      const h = document.createElement('i');
      h.className = 'hold';
      holds.appendChild(h);
    }
    body.appendChild(holds);

    // テロップ
    const telop = document.createElement('div');
    telop.className = 'telop';
    body.appendChild(telop);

    // リール
    const reelsEl = document.createElement('div');
    reelsEl.className = 'reels';
    body.appendChild(reelsEl);
    const reels = g.LA_REELS.create(reelsEl);

    // 3D テキスト枠
    const t3d = g.LA_T3D.create('課題提出');
    body.appendChild(t3d.el);

    frame.appendChild(body);

    // ストロボ用レイヤ
    const flash = document.createElement('div');
    flash.className = 'flash';
    frame.appendChild(flash);

    stage.appendChild(frame);

    return {
      stage, frame, lights, holds, reels, telop,
      t3d, flash,
      holdEls: Array.from(holds.children)
    };
  }

  g.LA_FRAME = { CSS, build, HOLDS };
})(window);
