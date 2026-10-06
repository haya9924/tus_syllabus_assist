/* LETUS Assist - 提出完了の演出のテスト表示 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const GAME = window.LA_GAME;
  const DATE = window.LA_DATE;

  function status(text, kind) {
    const el = $('status');
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  /** 期限との関係 → LETUS の期限（parts）を作る */
  function dueFor(mode) {
    const tz = 'Asia/Tokyo';
    const now = new Date();
    const at = (ms) => {
      const d = new Date(now.getTime() + ms);
      const p = DATE.dateToZonedParts(d, tz);
      return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute };
    };
    if (mode === 'none') return null;
    if (mode === 'early') return at(5 * 86400000);
    if (mode === 'soon') return at(36 * 3600000);
    if (mode === 'tight') return at(2 * 3600000);
    return at(-6 * 3600000);   // late
  }

  /** プレビュー用の res を組み立てる（GAME.applySubmission と同じ形） */
  function buildResult() {
    const streak = Number($('streak').value) || 1;
    const level = Math.max(1, Number($('level').value) || 1);
    const leveledUp = $('levelup').value === 'yes';
    const focus = Math.max(0, Number($('focus').value) || 0);
    const name = $('name').value || '(無題)';
    const course = $('course').value || '';
    const submittedAt = Date.now();

    const dueParts = dueFor($('due').value);
    const calc = GAME.computeSubmission({
      dueParts,
      submittedAt,
      streakDays: streak,
      timeZone: 'Asia/Tokyo'
    });

    const levelBefore = level;
    const levelAfter = leveledUp ? level + 1 : level;
    // レベルバーの伸び方を作るためのダミー XP
    const xpBefore = GAME.xpForLevel(levelBefore);
    const xpAfter = xpBefore + calc.xp;

    return {
      entry: {
        ts: submittedAt, id: 'preview', name, course,
        xp: calc.xp, mult: calc.mult, tier: calc.tier.label, streak,
        levelBefore, levelAfter, focusMinutes: focus
      },
      calc: { xp: calc.xp, raw: calc.raw, mult: calc.mult, tier: calc.tier, parts: calc.parts },
      xpBefore, xpAfter, levelBefore, levelAfter, leveledUp
    };
  }

  function settingsFor() {
    return {
      celebrate: {
        enabled: true,
        sound: $('sound').value === 'on',
        autoCloseSec: Number($('autoClose').value) || 0,
        confetti: Number($('confetti').value) || 0,
        strobe: $('strobe').value,
        intensity: $('intensity').value,
        rainbow: $('rainbow').value
      },
      todo: { timeZone: 'Asia/Tokyo' }
    };
  }

  function play() {
    if (!window.LA_CELEBRATE) { status('演出モジュールを読み込めませんでした。', 'bad'); return; }
    const res = buildResult();
    $('play').disabled = true;
    setTimeout(() => { $('play').disabled = false; }, 400);
    status('再生しました（実績は変化しません）。', 'ok');
    window.LA_CELEBRATE.show(res, settingsFor());
  }

  async function loadSettings() {
    const s = await window.LA.getSettings();
    const c = s.celebrate || {};
    if (c.sound !== undefined) $('sound').value = c.sound ? 'on' : 'off';
    if (c.confetti !== undefined) $('confetti').value = c.confetti;
    if (c.autoCloseSec !== undefined) $('autoClose').value = c.autoCloseSec;
    if (c.strobe !== undefined) $('strobe').value = c.strobe;
    if (c.intensity !== undefined) $('intensity').value = c.intensity;
    if (c.rainbow !== undefined) $('rainbow').value = c.rainbow;
    status('保存済みの設定を読み込みました。', 'ok');
  }

  $('play').addEventListener('click', play);
  $('loadSettings').addEventListener('click', loadSettings);
  $('openOptions').addEventListener('click', () => {
    if (chrome && chrome.runtime && chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open('../options/options.html');
  });

  loadSettings();
})();
