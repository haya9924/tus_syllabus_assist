/* TUS Assist - ダークモードエンジン（CLASS / LETUS / 拡張ページ 共通）
 *
 * - content script として読み込むと、現在地（CLASS / LETUS / 拡張ページ）を自動判定して
 *   <html data-tus-theme="dark"> を付与／除去する。
 * - 拡張ページ（popup / dashboard / options / preview）から <script> で読み込んでも同じ。
 * - 純関数（isDarkNow / nextBoundary / sunTimes / normalize）は Node からも require できる。
 *
 * 保存先: chrome.storage.local["tusTheme"]
 *   {
 *     mode    : 'off' | 'on' | 'auto',       // オフ / 常にダーク / 自動で切り替え
 *     schedule: 'time' | 'sun' | 'system',   // auto のときの切り替え条件
 *     time    : { start: '19:00', end: '06:00' },   // 夜間ウィンドウ（日跨ぎ可）
 *     targets : { class: true, letus: true, ui: true } // 対象ごとの ON/OFF
 *   }
 *
 * 暗転の方式は shared/dark-host.css（反転オーバーレイ）と UI 側のダークCSS。
 * ここでは属性の付け替えと「いつ切り替えるか」だけを担当する。
 */
(function (g) {
  'use strict';

  var STORAGE_KEY = 'tusTheme';

  // 太陽位置の基準（東京・神楽坂付近）。UI は持たず固定座標で計算する。
  var SUN = { lat: 35.70, lng: 139.74 };

  var DEFAULTS = {
    mode: 'off',
    schedule: 'time',
    time: { start: '19:00', end: '06:00' },
    targets: { class: true, letus: true, ui: true }
  };

  var MODES = ['off', 'on', 'auto'];
  var SCHEDULES = ['time', 'sun', 'system'];
  var TARGET_KEYS = ['class', 'letus', 'ui'];

  /* ---------------------------------------------------------- 時刻ユーティリティ */

  /** 'HH:MM' -> 秒。不正なら fallback を返す。 */
  function parseTime(str, fallback) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(str == null ? '' : str).trim());
    if (!m) return fallback;
    var h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return fallback;
    return h * 3600 + mi * 60;
  }

  /** 指定日の指定秒（0-86399）の Date（ローカル時刻基準） */
  function atTime(base, dayOffset, seconds) {
    return new Date(
      base.getFullYear(), base.getMonth(), base.getDate() + dayOffset,
      Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, 0
    );
  }

  /** 夜間ウィンドウ内か（start/end が同値なら常に false。end<start は日跨ぎ） */
  function inTimeWindow(now, start, end) {
    var s = parseTime(start, 19 * 3600);
    var e = parseTime(end, 6 * 3600);
    if (s === e) return false;
    var t = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    if (s < e) return t >= s && t < e;
    return t >= s || t < e;
  }

  function earliestAfter(list, now) {
    var best = null, t0 = now.getTime();
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (!t) continue;
      var ms = t.getTime();
      if (ms > t0 && (best === null || ms < best.getTime())) best = t;
    }
    return best;
  }

  /* ------------------------------------------------------------ 太陽位置（NOAA系） */

  var RAD = Math.PI / 180;
  var DAY_MS = 86400000;
  var J1970 = 2440588;   // 1970-01-01 00:00 UTC
  var J2000 = 2451545;   // 2000-01-01 12:00 UTC
  var J0 = 0.0009;

  function toJulian(date) { return date.valueOf() / DAY_MS - 0.5 + J1970; }
  function fromJulian(j) { return new Date((j + 0.5 - J1970) * DAY_MS); }
  function toDays(date) { return toJulian(date) - J2000; }

  function meanAnomaly(d) { return RAD * (357.5291 + 0.98560028 * d); }

  function eclipticLongitude(M) {
    var C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    var P = RAD * 102.9372;
    return M + C + P + Math.PI;
  }

  function declination(L) { return Math.asin(Math.sin(L) * Math.sin(RAD * 23.4397)); }

  function julianCycle(d, lw) { return Math.round(d - J0 - lw / (2 * Math.PI)); }
  function approxTransit(Ht, lw, n) { return J0 + (Ht + lw) / (2 * Math.PI) + n; }
  function solarTransitJ(ds, M, L) { return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L); }
  function hourAngle(h, phi, dec) {
    return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  }

  /**
   * 指定日付の日の出・日の入り・太陽中天（ローカル時刻で返す）。
   * 極地などで算出できない場合は rise/set が null。
   */
  function sunTimes(date, lat, lng) {
    var la = lat === undefined ? SUN.lat : lat;
    var lo = lng === undefined ? SUN.lng : lng;
    var lw = RAD * -lo;
    var phi = RAD * la;
    var d = toDays(date);
    var n = julianCycle(d, lw);
    var ds = approxTransit(0, lw, n);
    var M = meanAnomaly(ds);
    var L = eclipticLongitude(M);
    var dec = declination(L);
    var Jnoon = solarTransitJ(ds, M, L);
    var w = hourAngle(RAD * -0.833, phi, dec);
    if (isNaN(w)) return { rise: null, set: null, noon: fromJulian(Jnoon) };
    var Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    var Jrise = Jnoon - (Jset - Jnoon);
    return { rise: fromJulian(Jrise), set: fromJulian(Jset), noon: fromJulian(Jnoon) };
  }

  /* -------------------------------------------------------------- 判定（純関数） */

  /** 設定を既定で埋めて、不正な値は落とす。 */
  function normalize(raw) {
    var c = {
      mode: DEFAULTS.mode,
      schedule: DEFAULTS.schedule,
      time: { start: DEFAULTS.time.start, end: DEFAULTS.time.end },
      targets: { class: DEFAULTS.targets.class, letus: DEFAULTS.targets.letus, ui: DEFAULTS.targets.ui }
    };
    if (!raw || typeof raw !== 'object') return c;
    if (MODES.indexOf(raw.mode) >= 0) c.mode = raw.mode;
    if (SCHEDULES.indexOf(raw.schedule) >= 0) c.schedule = raw.schedule;
    if (raw.time && typeof raw.time === 'object') {
      if (parseTime(raw.time.start, null) !== null) c.time.start = raw.time.start;
      if (parseTime(raw.time.end, null) !== null) c.time.end = raw.time.end;
    }
    if (raw.targets && typeof raw.targets === 'object') {
      for (var i = 0; i < TARGET_KEYS.length; i++) {
        var k = TARGET_KEYS[i];
        if (typeof raw.targets[k] === 'boolean') c.targets[k] = raw.targets[k];
      }
    }
    return c;
  }

  /** 現在ページがダークになるべきか。systemDark は schedule='system' 用の真値。 */
  function isDarkNow(cfg, now, systemDark) {
    var c = normalize(cfg);
    if (c.mode === 'off') return false;
    if (c.mode === 'on') return true;
    var t = now || new Date();
    if (c.schedule === 'system') return !!systemDark;
    if (c.schedule === 'sun') {
      var s = sunTimes(t, SUN.lat, SUN.lng);
      if (s.rise && s.set) return t < s.rise || t >= s.set;
      return inTimeWindow(t, c.time.start, c.time.end);  // 極地などは時刻指定にフォールバック
    }
    return inTimeWindow(t, c.time.start, c.time.end);
  }

  /** 次に明暗が切り替わる時刻（切り替え不要なら null） */
  function nextBoundary(cfg, now) {
    var c = normalize(cfg);
    if (c.mode !== 'auto') return null;
    var t = now || new Date();
    if (c.schedule === 'system') return null;
    var cands = [];
    if (c.schedule === 'sun') {
      for (var i = 0; i < 2; i++) {
        var s = sunTimes(new Date(t.getTime() + i * DAY_MS), SUN.lat, SUN.lng);
        if (s.rise) cands.push(s.rise);
        if (s.set) cands.push(s.set);
      }
    } else {
      var secs = [parseTime(c.time.start, 19 * 3600), parseTime(c.time.end, 6 * 3600)];
      for (var j = 0; j < 2; j++) {
        for (var d = 0; d < 2; d++) cands.push(atTime(t, d, secs[j]));
      }
    }
    return earliestAfter(cands, t);
  }

  /** 次の切り替え {at, dark}（dark は切り替わった直後の状態）。切り替えが無ければ null。 */
  function nextTransition(cfg, now) {
    var at = nextBoundary(cfg, now);
    if (!at) return null;
    var probe = new Date(at.getTime() + 1000);
    return { at: at, dark: isDarkNow(cfg, probe, undefined) };
  }

  /** このページ（surface）で実際に暗くするか */
  function wantDark(cfg, surface, now, systemDark) {
    var c = normalize(cfg);
    if (c.mode === 'off') return false;
    if (surface && c.targets[surface] === false) return false;
    return isDarkNow(c, now, systemDark);
  }

  /** 現在地の判定: 'ui' | 'letus' | 'class' | null */
  function detectSurface() {
    var href = (typeof location !== 'undefined' && location && location.href) || '';
    if (href.indexOf('chrome-extension://') === 0) return 'ui';
    if (/^https?:\/\/letus\.ed\.tus\.ac\.jp(\/|$)/i.test(href)) return 'letus';
    if (/^https?:\/\/([a-z0-9-]+\.)*tus\.ac\.jp(\/|$)/i.test(href)) return 'class';
    return null;
  }

  /* ------------------------------------------------------------- ストレージ操作 */

  function hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function getSettings() {
    if (!hasStorage()) return Promise.resolve(normalize(null));
    return new Promise(function (resolve) {
      chrome.storage.local.get(STORAGE_KEY, function (res) {
        resolve(normalize(res && res[STORAGE_KEY]));
      });
    });
  }

  /** patch を現在の設定に重ねて保存し、保存後の設定を返す。 */
  function setSettings(patch) {
    return getSettings().then(function (cur) {
      var next = normalize(merge(cur, patch));
      return new Promise(function (resolve) {
        if (!hasStorage()) return resolve(next);
        var obj = {};
        obj[STORAGE_KEY] = next;
        chrome.storage.local.set(obj, function () { resolve(next); });
      });
    });
  }

  /** 部分的な設定を既定込みで重ねる（normalize 前のマージ用） */
  function merge(cur, patch) {
    var base = normalize(cur);
    if (!patch || typeof patch !== 'object') return base;
    var out = {
      mode: patch.mode !== undefined ? patch.mode : base.mode,
      schedule: patch.schedule !== undefined ? patch.schedule : base.schedule,
      time: {
        start: patch.time && patch.time.start !== undefined ? patch.time.start : base.time.start,
        end: patch.time && patch.time.end !== undefined ? patch.time.end : base.time.end
      },
      targets: { class: base.targets.class, letus: base.targets.letus, ui: base.targets.ui }
    };
    if (patch.targets) {
      for (var i = 0; i < TARGET_KEYS.length; i++) {
        var k = TARGET_KEYS[i];
        if (typeof patch.targets[k] === 'boolean') out.targets[k] = patch.targets[k];
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------- コントローラ */

  function whenRoot(cb) {
    var done = false;
    function run() {
      if (done) return;
      if (!document.documentElement) return;
      done = true;
      cb(document.documentElement);
    }
    run();
    if (done) return;
    if (typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function () {
        if (document.documentElement) { mo.disconnect(); run(); }
      });
      try { mo.observe(document, { childList: true }); } catch (e) { /* ignore */ }
    }
    document.addEventListener('DOMContentLoaded', function () { run(); }, { once: true });
  }

  function start(surface) {
    var cfg = normalize(null);
    var loaded = false;
    var timer = null;
    var mq = (typeof window !== 'undefined' && typeof window.matchMedia === 'function')
      ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function systemDark() { return !!(mq && mq.matches); }

    function paint(root) {
      if (!loaded) return;
      var dark = wantDark(cfg, surface, new Date(), systemDark());
      if (dark) root.setAttribute('data-tus-theme', 'dark');
      else root.removeAttribute('data-tus-theme');
    }

    function arm(root) {
      if (timer) { clearTimeout(timer); timer = null; }
      var nb = nextBoundary(cfg, new Date());
      if (!nb) return;
      var delay = nb.getTime() - Date.now() + 400;
      if (delay < 1000) delay = 1000;
      if (delay > 2147483000) delay = 2147483000;   // setTimeout の上限
      timer = setTimeout(function () { paint(root); arm(root); }, delay);
    }

    function refresh() {
      if (!document.documentElement) return;
      paint(document.documentElement);
      arm(document.documentElement);
    }

    whenRoot(function (root) {
      getSettings().then(function (c) {
        cfg = c;
        loaded = true;
        paint(root);
        arm(root);
      });

      if (hasStorage() && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area && area !== 'local') return;
          if (!changes || !changes[STORAGE_KEY]) return;
          getSettings().then(function (c) { cfg = c; refresh(); });
        });
      }

      if (mq && typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', function () { refresh(); });
      }

      document.addEventListener('visibilitychange', function () { refresh(); });
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', function () { refresh(); });
        // 機械スリープ等でタイマーが飛んだときの安全網
        setInterval(function () { refresh(); }, 60000);
      }
    });
  }

  function init() {
    if (typeof document === 'undefined') return;
    var surface = detectSurface();
    if (!surface) return;
    start(surface);
  }

  /* 初期化は「読み込みされた環境がブラウザのときだけ」（Node のテストでは純関数のみ使う） */
  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.storage) {
    try { init(); } catch (e) { /* ignore */ }
  }

  g.TUS_THEME = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULTS: DEFAULTS,
    SUN: SUN,
    parseTime: parseTime,
    inTimeWindow: inTimeWindow,
    sunTimes: sunTimes,
    normalize: normalize,
    merge: merge,
    isDarkNow: isDarkNow,
    nextBoundary: nextBoundary,
    nextTransition: nextTransition,
    wantDark: wantDark,
    detectSurface: detectSurface,
    getSettings: getSettings,
    setSettings: setSettings,
    init: init
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
