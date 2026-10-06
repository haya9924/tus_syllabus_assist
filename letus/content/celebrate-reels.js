/* LETUS Assist - パチンコ演出: 図柄リール
 *  LETUS の提出ステータス「提出済み」を 4 リールで揃える。
 *  変動中は文字が縦に流れ、停止すると LETUS 本体と同じ薄緑（#cfefcf）になる。
 */
(function (g) {
  'use strict';

  const CSS = `
.reels {
  /* 図柄の大きさ（枠に収まる範囲で大きく） */
  font-size: clamp(20px, min(5.4vw, 5.8vh), 42px);
  display: flex;
  gap: .6vmin;
  justify-content: center;
  align-items: center;
  padding: .6vmin;
  background: #0b0b16;
  border-radius: 8px;
  box-shadow: inset 0 0 18px rgba(255,255,255,.08), 0 0 0 2px rgba(255,255,255,.12);
  transition: box-shadow .25s;
}
.reels.win {
  box-shadow: inset 0 0 18px rgba(0,0,0,.15), 0 0 0 2px #7bc47b, 0 0 26px #7bc47b88;
}
.reel {
  position: relative;
  width: 1.55em;
  height: 1.75em;
  overflow: hidden;
  border-radius: 6px;
  background-color: #efefef;          /* LETUS の「未提出」= #efefef */
  color: #000;
  transition: background-color .3s ease;
  font-weight: 900;
  line-height: 1;
}
.reel .strip {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  will-change: transform;
}
.reel .cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 1.75em;
}
/* 停止後は LETUS の「評定のために提出済み」と同じ配色 */
.reel.stopped { background-color: #cfefcf; }
.reel.stopped .cell { color: #000; }
.reels.win .reel { background-color: #cfefcf; }

.reel .shine {
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(255,255,255,.65) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,.14) 100%);
  pointer-events: none;
}
`;

  const POOL = ['提', '出', '済', 'み', '未', '評', '定', '課', '題', '完', '了', '中'];
  const TARGET = ['提', '出', '済', 'み'];

  const CELL_EM = 1.75;

  /** 文字サイズ(px)から 1 セルの高さを求める */
  function cellHeight(reel) {
    const fs = parseFloat(getComputedStyle(reel).fontSize) || 24;
    return fs * CELL_EM;
  }

  function buildStrip(reel, target) {
    const strip = document.createElement('div');
    strip.className = 'strip';
    // 2 周分（[pool, target] × 2）で途切れなく循環させる
    for (let c = 0; c < 2; c++) {
      for (const ch of POOL) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.textContent = ch;
        strip.appendChild(cell);
      }
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = target;
      strip.appendChild(cell);
    }
    reel.appendChild(strip);
    const shine = document.createElement('div');
    shine.className = 'shine';
    reel.appendChild(shine);
    return strip;
  }

  function create(container) {
    container.classList.add('reels');
    container.textContent = '';

    const reels = TARGET.map((target) => {
      const reel = document.createElement('div');
      reel.className = 'reel';
      reel.dataset.target = target;
      const strip = buildStrip(reel, target);
      container.appendChild(reel);
      return { el: reel, strip, target, pos: 0, phase: 'idle', done: false };
    });

    let raf = 0;
    let running = false;
    let speed = 0;              // px/s
    let last = 0;
    const LEN = (POOL.length + 1);   // 1 周のセル数

    function apply() {
      for (const r of reels) {
        r.strip.style.transform = 'translateY(' + (-(r.pos % (LEN * cellHeight(r.el)))) + 'px)';
      }
    }

    function tick(now) {
      if (!running) return;
      const dt = Math.min(50, now - last) || 16;
      last = now;
      const h = cellHeight(reels[0].el);
      const cycle = LEN * h;

      for (const r of reels) {
        if (r.phase === 'spinning' || r.phase === 'reach') {
          const sp = r.phase === 'reach' ? speed * 0.18 : speed;
          r.pos += (sp * dt) / 1000;
          if (r.pos > cycle * 8) r.pos -= cycle * 8;   // 桁あふれ防止
        } else if (r.phase === 'stopping') {
          const t = Math.min(1, (now - r.stopAt) / r.stopDur);
          const eased = 1 - Math.pow(1 - t, 4);
          r.pos = r.stopFrom + (r.stopTo - r.stopFrom) * eased;
          if (t >= 1) {
            r.phase = 'done';
            r.pos = r.stopTo;
            r.el.classList.add('stopped');
            if (r.resolve) { r.resolve(); r.resolve = null; }
          }
        }
      }
      apply();
      raf = requestAnimationFrame(tick);
      if (reels.every((r) => r.phase === 'done')) running = false;
    }

    function start(speedPx) {
      container.classList.remove('win');
      for (const r of reels) {
        r.phase = 'spinning';
        r.done = false;
        r.el.classList.remove('stopped');
      }
      speed = speedPx || 1250;
      if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    }

    /** リーチ（減速して速度を落とす） */
    function reachSlow() {
      for (const r of reels) if (r.phase === 'spinning') r.phase = 'reach';
    }

    /** 1 リールを停止させる。index 番目のリール */
    function stopOne(index) {
      const r = reels[index];
      if (!r || r.phase === 'done' || r.phase === 'stopping') return Promise.resolve();
      const h = cellHeight(r.el);
      const cycle = LEN * h;
      const targetOffset = POOL.length * h;   // target セルの y
      const cur = r.pos % cycle;
      // 「もう 1〜2 回転して target で止まる」位置を求める
      let delta = (targetOffset - cur + cycle) % cycle;
      if (delta < cycle * 0.55) delta += cycle;
      const from = r.pos;
      const to = r.pos + delta;
      r.phase = 'stopping';
      r.stopFrom = from;
      r.stopTo = to;
      r.stopAt = performance.now();
      r.stopDur = 420;
      return new Promise((resolve) => { r.resolve = resolve; });
    }

    function stopAll() {
      return Promise.all(reels.map((_, i) => stopOne(i)));
    }

    /** reduced-motion 用: 回転させずに一気に揃える */
    function snapToTargets() {
      for (const r of reels) {
        const h = cellHeight(r.el);
        r.pos = POOL.length * h;
        r.phase = 'done';
        r.el.classList.add('stopped');
        apply();
      }
      container.classList.add('win');
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function isWin() { return reels.every((r) => r.phase === 'done'); }
    function markWin() { container.classList.add('win'); }
    function targets() { return reels.map((r) => r.target); }

    function destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    return { el: container, reels, start, reachSlow, stopOne, stopAll, isWin, markWin, targets, destroy, snapToTargets };
  }

  g.LA_REELS = { CSS, create, POOL, TARGET };
})(window);
