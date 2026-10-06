/* LETUS Assist - 紙吹雪（Canvas 2D パーティクル） */
(function (g) {
  'use strict';

  const COLORS = [
    '#FFD93D', '#FFE066', // 黄
    '#FF6BD6', '#FF8FE0', // ピンク
    '#6BE3FF', '#8FF0FF', // シアン
    '#7CFF7C', '#B6FF9E', // 緑
    '#B28DFF', '#D4BFFF', // 紫
    '#FF9F45', '#FFC078'  // オレンジ
  ];

  const GOLD = ['#FFD700', '#FFC300', '#FFF3B0', '#FFB300'];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function makeParticle(w, h, opts) {
    const gold = !!opts.gold;
    const size = rand(6, 13) * (opts.scale || 1);
    const shape = Math.random() < 0.22 ? 'circle' : (Math.random() < 0.35 ? 'ribbon' : 'rect');
    return {
      x: opts.x !== undefined ? opts.x : rand(0, w),
      y: opts.y !== undefined ? opts.y : rand(-h * 0.25, -10),
      vx: opts.vx !== undefined ? opts.vx : rand(-1.4, 1.4),
      vy: opts.vy !== undefined ? opts.vy : rand(1.2, 3.6),
      w: size,
      h: shape === 'ribbon' ? size * rand(1.8, 3.2) : size * rand(0.55, 1.0),
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.16, 0.16),
      color: gold ? pick(GOLD) : pick(COLORS),
      shape,
      sway: rand(0, Math.PI * 2),
      swayAmp: rand(0.4, 1.6),
      swayFreq: rand(0.012, 0.035),
      flip: rand(0, Math.PI * 2),
      flipFreq: rand(0.03, 0.09),
      life: opts.life || Infinity,
      born: performance.now()
    };
  }

  const BASE_AMOUNT = 380;

  function create(canvas, options) {
    const ctx = canvas.getContext('2d');
    let parts = [];
    let running = false;
    let raf = 0;
    let last = 0;
    let emitUntil = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    // 紙吹雪の量（設定 celebrate.confetti に連動）
    let amount = (options && Number(options.amount)) || BASE_AMOUNT;
    if (!(amount >= 0)) amount = BASE_AMOUNT;
    const scale = amount / BASE_AMOUNT;

    function resize() {
      dpr = Math.min(g.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || g.innerWidth;
      height = canvas.clientHeight || g.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function step(now) {
      if (!running) return;
      const dt = Math.min(34, now - last) || 16;
      last = now;
      const k = dt / 16.6667;

      ctx.clearRect(0, 0, width, height);

      // 連続発生（雨）
      if (now < emitUntil) {
        const add = Math.max(0, Math.round(3 * scale));
        for (let i = 0; i < add; i++) parts.push(makeParticle(width, height, { scale: 0.85 }));
      }

      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 0.11 * k;
        p.vx *= Math.pow(0.988, k);
        p.vy *= Math.pow(0.994, k);
        p.sway += p.swayFreq * k;
        p.flip += p.flipFreq * k;
        p.x += (p.vx + Math.sin(p.sway) * p.swayAmp) * k;
        p.y += p.vy * k;
        p.rot += p.vrot * k;

        if (p.y > height + 40) {
          if (now < emitUntil + 1500) {
            // 画面下に落ちたら上から再投入（余韻）
            const np = makeParticle(width, height, { scale: 0.85 });
            np.y = -20;
            parts[i] = np;
            continue;
          }
          parts.splice(i, 1);
          continue;
        }

        const sx = Math.cos(p.flip);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(sx < 0 ? -1 : 1, 1);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, p.w * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;

      raf = g.requestAnimationFrame(step);
    }

    function start(opts) {
      const o = opts || {};
      resize();
      if (!running) {
        running = true;
        last = performance.now();
        raf = g.requestAnimationFrame(step);
      }
      if (o.rain !== false) {
        emitUntil = performance.now() + (o.rainMs || 2600);
      } else {
        emitUntil = 0;
      }
    }

    /** 指定位置から扇形に発射（紙テープ砲） */
    function burst(x, y, n, angle, spread, power, opts) {
      if (!running) start({ rain: false });
      const count = Math.max(0, Math.round(n * scale));
      for (let i = 0; i < count; i++) {
        const a = angle + rand(-spread / 2, spread / 2);
        const sp = rand(power * 0.55, power * 1.2);
        const p = makeParticle(width, height, {
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          scale: (opts && opts.scale) || 1,
          gold: !!(opts && opts.gold)
        });
        parts.push(p);
      }
    }

    function addRain(ms, k) {
      emitUntil = performance.now() + (ms || 1500);
      const n = Math.max(0, Math.round(60 * (k || 1) * scale));
      for (let i = 0; i < n; i++) parts.push(makeParticle(width, height, { scale: k || 1 }));
      return n;
    }

    function setAmount(n) {
      amount = Number(n);
      if (!(amount >= 0)) amount = BASE_AMOUNT;
    }
    function getAmount() { return amount; }

    function stop() {
      running = false;
      if (raf) g.cancelAnimationFrame(raf);
      raf = 0;
      parts = [];
      ctx.clearRect(0, 0, width, height);
    }

    function count() { return parts.length; }

    return { start, stop, burst, addRain, resize, count, setAmount, getAmount };
  }

  g.LA_CONFETTI = { create, COLORS };
})(window);
