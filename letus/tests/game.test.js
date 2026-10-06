/* game.js の単体テスト（chrome はスタブ） */
const fs = require('fs');
const path = require('path');
const EXT = process.env.LETUS_EXT || path.resolve(__dirname, '..', '..');

const mem = {};
globalThis.chrome = {
  storage: { local: {
    get: (k, cb) => { const o = {}; (Array.isArray(k) ? k : [k]).forEach(x => { if (x in mem) o[x] = JSON.parse(JSON.stringify(mem[x])); }); cb(o); },
    set: (o, cb) => { Object.assign(mem, JSON.parse(JSON.stringify(o))); if (cb) cb(); },
    remove: (k, cb) => { delete mem[k]; if (cb) cb(); }
  } }
};
globalThis.window = globalThis;

let fails = 0;
const check = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { fails++; console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };

require(path.join(EXT, 'letus/shared/dateutil.js'));
const G = require(path.join(EXT, 'letus/shared/game.js')) || globalThis.LA_GAME;
const LA = globalThis.LA_GAME;
const TZ = 'Asia/Tokyo';

console.log('=== レベル曲線 ===');
check('xpForLevel(1)=0', LA.xpForLevel(1) === 0, LA.xpForLevel(1));
check('xpForLevel(2)=360', LA.xpForLevel(2) === 360, LA.xpForLevel(2));
check('xpForLevel(3)=840', LA.xpForLevel(3) === 840, LA.xpForLevel(3));
check('xpForLevel(4)=1440', LA.xpForLevel(4) === 1440, LA.xpForLevel(4));
check('levelFromXp(0)=1', LA.levelFromXp(0) === 1);
check('levelFromXp(359)=1', LA.levelFromXp(359) === 1, LA.levelFromXp(359));
check('levelFromXp(360)=2', LA.levelFromXp(360) === 2, LA.levelFromXp(360));
check('levelFromXp(1440)=4', LA.levelFromXp(1440) === 4, LA.levelFromXp(1440));
check('レベル単調増加', (() => { for (let x = 0; x < 50000; x += 137) if (LA.levelFromXp(x + 137) < LA.levelFromXp(x)) return false; return true; })());

console.log('\n=== ティア ===');
check('連続1日 → ×1 NICE', LA.tierFor(1).mult === 1 && LA.tierFor(1).label === 'NICE');
check('連続2日 → ×2 GREAT', LA.tierFor(2).mult === 2 && LA.tierFor(2).label === 'GREAT');
check('連続3日 → ×3 SUPER', LA.tierFor(3).mult === 3 && LA.tierFor(3).label === 'SUPER');
check('連続5日 → ×4 ULTRA', LA.tierFor(5).mult === 4 && LA.tierFor(5).label === 'ULTRA');
check('連続9日 → ×5 LEGEND', LA.tierFor(9).mult === 5 && LA.tierFor(9).label === 'LEGEND');

console.log('\n=== 称号 ===');
check('Lv.1', LA.levelTitle(1) === 'レポート見習い', LA.levelTitle(1));
check('Lv.7', LA.levelTitle(7) === '提出の習慣者');
check('Lv.12', LA.levelTitle(12) === '締切の達人');
check('Lv.16', LA.levelTitle(16) === '単位の錬金術師');
check('Lv.25', LA.levelTitle(25) === '課題マスター');
check('Lv.40', LA.levelTitle(40) === '卒業の覇者');

console.log('\n=== 日付 ===');
// 2026-10-06 12:43 JST
const at = globalThis.LA_DATE.zonedToDate({ year: 2026, month: 10, day: 6, hour: 12, minute: 43 }, TZ);
check('dateKeyTz', LA.dateKeyTz(at, TZ) === '2026-10-06', LA.dateKeyTz(at, TZ));
check('addDaysKey -1', LA.addDaysKey('2026-10-06', -1, TZ) === '2026-10-05');
check('addDaysKey 月またぎ', LA.addDaysKey('2026-10-01', -1, TZ) === '2026-09-30');
check('addDaysKey 年またぎ', LA.addDaysKey('2027-01-01', -1, TZ) === '2026-12-31');
check('日付境界（JST 00:10 は当日扱い）',
  LA.dateKeyTz(globalThis.LA_DATE.zonedToDate({ year: 2026, month: 10, day: 6, hour: 0, minute: 10 }, TZ), TZ) === '2026-10-06');

console.log('\n=== XP 計算（参考: 期限6日5時間前の実測ケース）===');
const due = { year: 2026, month: 10, day: 12, hour: 18, minute: 0 };   // 期限
let c = LA.computeSubmission({ dueParts: due, submittedAt: at.getTime(), streakDays: 1, timeZone: TZ });
console.log('  raw=%d xp=%d parts=%s', c.raw, c.xp, JSON.stringify(c.parts));
check('期限内 100 + 72h前 100 + 基本 150 = 350（×1）', c.raw === 350 && c.xp === 350, c);
check('×3 なら 1050', LA.computeSubmission({ dueParts: due, submittedAt: at.getTime(), streakDays: 3, timeZone: TZ }).xp === 1050);

const dueSoon = { year: 2026, month: 10, day: 6, hour: 22, minute: 0 };
c = LA.computeSubmission({ dueParts: dueSoon, submittedAt: at.getTime(), streakDays: 1, timeZone: TZ });
check('24h未満の余裕 → 早期ボーナスなし (250)', c.raw === 250, c);

const duePast = { year: 2026, month: 10, day: 5, hour: 23, minute: 0 };
c = LA.computeSubmission({ dueParts: duePast, submittedAt: at.getTime(), streakDays: 1, timeZone: TZ });
check('期限超過 → 基本のみ (150)', c.raw === 150 && c.xp === 150, c);

c = LA.computeSubmission({ dueParts: null, submittedAt: at.getTime(), streakDays: 2, timeZone: TZ });
check('期限なし → 150 ×2 = 300', c.xp === 300, c);

console.log('\n=== ストリーク遷移 ===');
const fresh = { xp: 0, level: 1, streakDays: 0, bestStreak: 0, lastSubmitDate: '', totalSubmits: 0, totalFocusMinutes: 0, history: [] };
let g = JSON.parse(JSON.stringify(fresh));
let r = LA.applySubmission(g, { dueParts: due, submittedAt: at.getTime(), timeZone: TZ, id: 'a', name: 'n', course: 'c', focusMinutes: 12 });
check('初回 → 連続1日・×1', r.entry.streak === 1 && r.entry.mult === 1, r.entry);
check('XP 350 / Lv.1→1', r.xpAfter === 350 && r.levelAfter === 1 && !r.leveledUp, { xp: r.xpAfter, lv: r.levelAfter });
check('履歴 1件', r.game.history.length === 1);
check('totalSubmits=1 / focus=12', r.game.totalSubmits === 1 && r.game.totalFocusMinutes === 12, r.game);

// 同日 2 回目
const at2 = globalThis.LA_DATE.zonedToDate({ year: 2026, month: 10, day: 6, hour: 18, minute: 0 }, TZ);
r = LA.applySubmission(r.game, { dueParts: due, submittedAt: at2.getTime(), timeZone: TZ, id: 'b', name: 'n2' });
check('同日2回目 → 連続は据え置き 1日', r.entry.streak === 1, r.entry);
check('XP は加算される (700)', r.game.xp === 700, r.game.xp);
check('Lv.2 に到達してレベルアップ', r.levelAfter === 2 && r.leveledUp === true, { lv: r.levelAfter, up: r.leveledUp });

// 翌日
const nextDay = globalThis.LA_DATE.zonedToDate({ year: 2026, month: 10, day: 7, hour: 9, minute: 0 }, TZ);
r = LA.applySubmission(r.game, { dueParts: due, submittedAt: nextDay.getTime(), timeZone: TZ, id: 'c' });
check('翌日 → 連続2日・×2', r.entry.streak === 2 && r.entry.mult === 2, r.entry);
check('XP 350×2=700 加算 → 1400', r.game.xp === 1400, r.game.xp);

// 2日あける
const later = globalThis.LA_DATE.zonedToDate({ year: 2026, month: 10, day: 9, hour: 9, minute: 0 }, TZ);
r = LA.applySubmission(r.game, { dueParts: due, submittedAt: later.getTime(), timeZone: TZ, id: 'd' });
check('2日空き → リセットして1日', r.entry.streak === 1, r.entry);
check('bestStreak は 2 を保持', r.game.bestStreak === 2, r.game.bestStreak);

// 連続3日で SUPER
g = JSON.parse(JSON.stringify(fresh));
g.streakDays = 2; g.lastSubmitDate = '2026-10-05';
const d3 = globalThis.LA_DATE.zonedToDate({ year: 2026, month: 10, day: 6, hour: 10, minute: 0 }, TZ);
r = LA.applySubmission(g, { dueParts: due, submittedAt: d3.getTime(), timeZone: TZ, id: 'e' });
check('3日連続 → SUPER ×3', r.calc.tier.label === 'SUPER' && r.entry.mult === 3, r.entry);

console.log('\n=== 保存 ===');
(async () => {
  const gg = { xp: 500, level: 3, streakDays: 2, bestStreak: 2, lastSubmitDate: '2026-10-06', totalSubmits: 3, totalFocusMinutes: 30, history: [] };
  await LA.saveGame(gg);
  const loaded = await LA.loadGame();
  check('saveGame/loadGame 往復', loaded.game.xp === 500 && loaded.game.streakDays === 2, loaded.game);
  // 他セクションが消えていないこと
  mem['letusAssist'] = { top: { mode: 'swap' }, game: { xp: 1 } };
  await LA.saveGame({ xp: 999 });
  check('保存しても他セクションを保持', mem['letusAssist'].top.mode === 'swap', mem['letusAssist']);
  // runtime の間引き
  const rt = { lastOpenAt: {}, seenStatus: {} };
  for (let i = 0; i < 500; i++) rt.seenStatus['k' + i] = 'x';
  await LA.setRuntime(rt);
  const saved = mem['letusAssistRuntime'];
  check('runtime は 400 件に間引かれる', Object.keys(saved.seenStatus).length === 400, Object.keys(saved.seenStatus).length);
  check('新しいキーが残る', 'k499' in saved.seenStatus && !('k0' in saved.seenStatus));
  await LA.resetGame();
  check('resetGame', (await LA.loadGame()).game.xp === 0);

  console.log('\n' + (fails ? 'FAILED: ' + fails : 'ALL PASS (game)'));
  process.exit(fails ? 1 : 0);
})();
