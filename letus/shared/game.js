/* LETUS Assist - 実績（XP / レベル / 連続提出日数）の計算と保存
 * content script と設定ページの両方から読み込むグローバルスクリプト。
 */
(function (g) {
  'use strict';

  const RUNTIME_KEY = 'letusAssistRuntime';
  const MAX_SEEN = 400;

  /* ------------------------------------------------------------- 調整値 */

  const XP = {
    base: 150,          // 提出そのもの
    onTime: 100,        // 期限内に提出
    early72: 100,       // 期限の 72 時間以上前
    early24: 50         // 期限の 24 時間以上前（early72 とは排他）
  };

  // 連続提出日数 → 倍率・ティア
  const TIERS = [
    { min: 7, mult: 5, label: 'LEGEND', color: '#fde047' },
    { min: 5, mult: 4, label: 'ULTRA', color: '#fb923c' },
    { min: 3, mult: 3, label: 'SUPER', color: '#e879f9' },
    { min: 2, mult: 2, label: 'GREAT', color: '#22d3ee' },
    { min: 1, mult: 1, label: 'NICE', color: '#4ade80' }
  ];

  // レベルに必要な累積 XP
  function xpForLevel(level) {
    const n = Math.max(1, level) - 1;
    return Math.round(300 * n + 60 * n * n);
  }

  function levelFromXp(xp) {
    let lv = 1;
    while (lv < 200 && xp >= xpForLevel(lv + 1)) lv++;
    return lv;
  }

  /** レベルバー用: {level, title, into, need, ratio} */
  function levelInfo(xp) {
    const level = levelFromXp(xp);
    const start = xpForLevel(level);
    const next = xpForLevel(level + 1);
    const need = next - start;
    const into = Math.min(need, Math.max(0, xp - start));
    return {
      level,
      title: levelTitle(level),
      start, next, need, into,
      ratio: need > 0 ? into / need : 0
    };
  }

  const TITLES = [
    { min: 30, title: '卒業の覇者' },
    { min: 20, title: '課題マスター' },
    { min: 15, title: '単位の錬金術師' },
    { min: 10, title: '締切の達人' },
    { min: 5, title: '提出の習慣者' },
    { min: 1, title: 'レポート見習い' }
  ];

  function levelTitle(level) {
    for (const t of TITLES) if (level >= t.min) return t.title;
    return TITLES[TITLES.length - 1].title;
  }

  function tierFor(streakDays) {
    for (const t of TIERS) if (streakDays >= t.min) return t;
    return TIERS[TIERS.length - 1];
  }

  /* ------------------------------------------------------------- 日付 */

  function dateKeyTz(date, timeZone) {
    const D = g.LA_DATE;
    if (D && D.dateToZonedParts) {
      const p = D.dateToZonedParts(date, timeZone || 'Asia/Tokyo');
      return p.year + '-' + String(p.month).padStart(2, '0') + '-' + String(p.day).padStart(2, '0');
    }
    return date.toISOString().slice(0, 10);
  }

  function addDaysKey(key, delta, timeZone) {
    const [y, m, d] = key.split('-').map(Number);
    const D = g.LA_DATE;
    let ms;
    if (D && D.zonedToDate) ms = D.zonedToDate({ year: y, month: m, day: d, hour: 12, minute: 0 }, timeZone).getTime();
    else ms = Date.UTC(y, m - 1, d, 12);
    return dateKeyTz(new Date(ms + delta * 86400000), timeZone);
  }

  /* ------------------------------------------------- XP の算出 */

  /**
   * 1 回の提出の XP を計算する。
   * @param {{dueParts?:object|null, submittedAt:number, streakDays:number, timeZone?:string}} info
   */
  function computeSubmission(info) {
    const tz = info.timeZone || 'Asia/Tokyo';
    const at = new Date(info.submittedAt);
    let dueMs = null;
    if (info.dueParts && g.LA_DATE && g.LA_DATE.zonedToDate) {
      dueMs = g.LA_DATE.zonedToDate(info.dueParts, tz).getTime();
    }

    const parts = [{ key: 'base', label: '提出', xp: XP.base }];
    let raw = XP.base;

    if (dueMs === null) {
      parts.push({ key: 'nodue', label: '期限なし', xp: 0 });
    } else {
      const leftMs = dueMs - at.getTime();
      const leftH = leftMs / 3600000;
      if (leftMs >= 0) {
        parts.push({ key: 'ontime', label: '期限内', xp: XP.onTime });
        raw += XP.onTime;
        if (leftH >= 72) {
          parts.push({ key: 'early', label: '締切72時間以上前', xp: XP.early72 });
          raw += XP.early72;
        } else if (leftH >= 24) {
          parts.push({ key: 'early', label: '締切24時間以上前', xp: XP.early24 });
          raw += XP.early24;
        }
      } else {
        parts.push({ key: 'late', label: '期限超過', xp: 0 });
      }
    }

    const tier = tierFor(info.streakDays);
    const xp = Math.round(raw * tier.mult);
    return { xp, raw, mult: tier.mult, tier, parts, dueMs };
  }

  /** 提出を記録してゲーム状態を進める。game は settings.game（新しい値で返す） */
  function applySubmission(game, submission) {
    const tz = submission.timeZone || 'Asia/Tokyo';
    const today = dateKeyTz(new Date(submission.submittedAt), tz);

    let streak = game.streakDays || 0;
    if (game.lastSubmitDate === today) {
      streak = Math.max(1, streak);           // 同じ日の 2 回目は据え置き
    } else if (game.lastSubmitDate === addDaysKey(today, -1, tz)) {
      streak = streak + 1;
    } else {
      streak = 1;
    }

    const calc = computeSubmission(Object.assign({}, submission, { streakDays: streak }));
    const xpBefore = game.xp || 0;
    const xpAfter = xpBefore + calc.xp;
    const levelBefore = levelFromXp(xpBefore);
    const levelAfter = levelFromXp(xpAfter);

    const next = Object.assign({}, game, {
      xp: xpAfter,
      level: levelAfter,
      streakDays: streak,
      bestStreak: Math.max(game.bestStreak || 0, streak),
      lastSubmitDate: today,
      totalSubmits: (game.totalSubmits || 0) + 1,
      totalFocusMinutes: (game.totalFocusMinutes || 0) + Math.max(0, Math.round(submission.focusMinutes || 0))
    });

    const entry = {
      ts: submission.submittedAt,
      id: submission.id || '',
      name: submission.name || '',
      course: submission.course || '',
      xp: calc.xp,
      mult: calc.mult,
      tier: calc.tier.label,
      streak,
      levelBefore,
      levelAfter,
      focusMinutes: Math.max(0, Math.round(submission.focusMinutes || 0))
    };
    next.history = [entry].concat(game.history || []).slice(0, 50);

    return {
      game: next,
      entry,
      calc,
      xpBefore, xpAfter,
      levelBefore, levelAfter,
      leveledUp: levelAfter > levelBefore
    };
  }

  /* ------------------------------------------------------------- 保存 */

  const STORAGE_KEY = 'letusAssist';

  function loadGame() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY, RUNTIME_KEY], (res) => {
        const s = res && res[STORAGE_KEY];
        resolve({
          game: (s && s.game) || null,
          runtime: (res && res[RUNTIME_KEY]) || {}
        });
      });
    });
  }

  /** settings.game を置き換える（他セクションは保持） */
  function saveGame(game) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (res) => {
        const cur = (res && res[STORAGE_KEY]) || {};
        cur.game = game;
        chrome.storage.local.set({ [STORAGE_KEY]: cur }, () => resolve(game));
      });
    });
  }

  function getRuntime() {
    return new Promise((resolve) => {
      chrome.storage.local.get(RUNTIME_KEY, (res) => {
        const r = (res && res[RUNTIME_KEY]) || {};
        resolve({
          lastOpenAt: (r.lastOpenAt && typeof r.lastOpenAt === 'object') ? r.lastOpenAt : {},
          seenStatus: (r.seenStatus && typeof r.seenStatus === 'object') ? r.seenStatus : {}
        });
      });
    });
  }

  /** runtime 全体を置き換える（内容を制御して肥大化を防ぐ） */
  function setRuntime(rt) {
    const next = {
      lastOpenAt: pruneMap(rt.lastOpenAt, MAX_SEEN),
      seenStatus: pruneMap(rt.seenStatus, MAX_SEEN)
    };
    return new Promise((resolve) => {
      chrome.storage.local.set({ [RUNTIME_KEY]: next }, () => resolve(next));
    });
  }

  function pruneMap(map, max) {
    if (!map || typeof map !== 'object') return {};
    const keys = Object.keys(map);
    if (keys.length <= max) return map;
    const out = {};
    for (const k of keys.slice(keys.length - max)) out[k] = map[k];
    return out;
  }

  function resetGame() {
    return saveGame({
      xp: 0, level: 1, streakDays: 0, bestStreak: 0, lastSubmitDate: '',
      totalSubmits: 0, totalFocusMinutes: 0, history: []
    });
  }

  /* ------------------------------------------------------------- 公開 */

  g.LA_GAME = {
    RUNTIME_KEY,
    XP, TIERS, TITLES,
    xpForLevel, levelFromXp, levelInfo, levelTitle, tierFor,
    dateKeyTz, addDaysKey,
    computeSubmission, applySubmission,
    loadGame, saveGame, getRuntime, setRuntime, resetGame
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
