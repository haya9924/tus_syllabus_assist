/* TUS Assist - ダークモードエンジン（shared/theme.js）の単体テスト
 * 依存パッケージ不要。純関数と chrome.storage のラッパーだけを検証する。
 * TZ に依存しない書き方にしてある（時刻はすべてローカル Date で組み立てる）。
 */
let fails = 0;
const check = (n, c, x) => {
  if (c) console.log('  PASS  ' + n);
  else { fails++; console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); }
};

require('./theme.js');
const T = globalThis.TUS_THEME;
const MIN = 60000;
const HOUR = 3600000;

(async () => {
  console.log('=== parseTime ===');
  check('19:00 -> 68400', T.parseTime('19:00', -1) === 19 * 3600);
  check('9:05 -> 32700', T.parseTime('9:05', -1) === 9 * 3600 + 5 * 60);
  check('24:00 は不正', T.parseTime('24:00', -1) === -1, T.parseTime('24:00', -1));
  check('19:60 は不正', T.parseTime('19:60', -1) === -1);
  check('空文字は不正', T.parseTime('', -1) === -1);
  check('null は不正', T.parseTime(null, -1) === -1);

  console.log('=== inTimeWindow ===');
  const at = (h, m, s) => new Date(2026, 9, 7, h, m, s || 0);
  const w = (start, end) => (n) => T.inTimeWindow(n, start, end);
  check('19:00-06:00 の 20:00 は暗い', w('19:00', '06:00')(at(20, 0)) === true);
  check('19:00-06:00 の 06:00 は明るい', w('19:00', '06:00')(at(6, 0)) === false);
  check('19:00-06:00 の 05:59:59 は暗い', w('19:00', '06:00')(at(5, 59, 59)) === true);
  check('19:00-06:00 の 19:00:00 は暗い', w('19:00', '06:00')(at(19, 0, 0)) === true);
  check('19:00-06:00 の 12:00 は明るい', w('19:00', '06:00')(at(12, 0)) === false);
  check('日跨ぎしない 09:00-17:00 の 08:00 は明るい', w('09:00', '17:00')(at(8, 0)) === false);
  check('同時刻は常に明るい', w('19:00', '19:00')(at(19, 30)) === false);

  console.log('=== sunTimes（東京） ===');
  const d = T.sunTimes(new Date(Date.UTC(2026, 9, 7, 3, 0, 0)), 35.70, 139.74);  // 2026-10-07 12:00 JST
  const expRise = Date.UTC(2026, 9, 6, 20, 41);
  const expSet = Date.UTC(2026, 9, 7, 8, 19);
  check('日の出 2026-10-07 05:41 JST 付近', Math.abs(d.rise.getTime() - expRise) < 15 * MIN,
    d.rise && d.rise.toISOString());
  check('日の入り 2026-10-07 17:19 JST 付近', Math.abs(d.set.getTime() - expSet) < 15 * MIN,
    d.set && d.set.toISOString());
  check('日の出 < 中天 < 日の入り', d.rise < d.noon && d.noon < d.set);
  const sum = T.sunTimes(new Date(Date.UTC(2026, 5, 21, 3, 0, 0)), 35.70, 139.74);
  const win = T.sunTimes(new Date(Date.UTC(2026, 11, 21, 3, 0, 0)), 35.70, 139.74);
  check('夏至の昼長 > 冬至の昼長', (sum.set - sum.rise) > (win.set - win.rise),
    [(sum.set - sum.rise) / HOUR, (win.set - win.rise) / HOUR]);
  check('昼長は 8〜17 時間の範囲', (d.set - d.rise) / HOUR > 8 && (d.set - d.rise) / HOUR < 17,
    (d.set - d.rise) / HOUR);

  console.log('=== isDarkNow ===');
  const cfgTime = { mode: 'auto', schedule: 'time', time: { start: '19:00', end: '06:00' } };
  check('off は常に明るい', T.isDarkNow({ mode: 'off' }, at(23, 0)) === false);
  check('on は常に暗い', T.isDarkNow({ mode: 'on' }, at(12, 0)) === true);
  check('auto/time 20:00 は暗い', T.isDarkNow(cfgTime, at(20, 0)) === true);
  check('auto/time 12:00 は明るい', T.isDarkNow(cfgTime, at(12, 0)) === false);
  const cfgSys = { mode: 'auto', schedule: 'system' };
  check('auto/system + OS=dark → 暗い', T.isDarkNow(cfgSys, at(12, 0), true) === true);
  check('auto/system + OS=light → 明るい', T.isDarkNow(cfgSys, at(12, 0), false) === false);
  const cfgSun = { mode: 'auto', schedule: 'sun' };
  // 太陽のイベントは絶対時刻なので、そこから前後した瞬間で判定を確かめる（TZ 非依存）
  const midDay = new Date((d.rise.getTime() + d.set.getTime()) / 2);
  check('auto/sun は昼（日の出と日の入りの中間）で明るい', T.isDarkNow(cfgSun, midDay) === false, midDay.toISOString());
  check('auto/sun は日出前1時間で暗い', T.isDarkNow(cfgSun, new Date(d.rise.getTime() - HOUR)) === true);
  check('auto/sun は日没後1時間で暗い', T.isDarkNow(cfgSun, new Date(d.set.getTime() + HOUR)) === true);

  console.log('=== nextBoundary / nextTransition ===');
  const noon = at(12, 0);
  check('time 12:00 の次は同じ日の 19:00',
    +T.nextBoundary(cfgTime, noon) === +new Date(2026, 9, 7, 19, 0, 0),
    T.nextBoundary(cfgTime, noon) && T.nextBoundary(cfgTime, noon).toString());
  check('time 19:00 の次は翌 06:00',
    +T.nextBoundary(cfgTime, at(19, 0)) === +new Date(2026, 9, 8, 6, 0, 0),
    T.nextBoundary(cfgTime, at(19, 0)) && T.nextBoundary(cfgTime, at(19, 0)).toString());
  check('time 23:59 の次は翌 06:00',
    +T.nextBoundary(cfgTime, at(23, 59)) === +new Date(2026, 9, 8, 6, 0, 0));
  check('mode=on は切替なし', T.nextBoundary({ mode: 'on' }, noon) === null);
  check('mode=off は切替なし', T.nextBoundary({ mode: 'off' }, noon) === null);
  check('system は切替なし', T.nextBoundary({ mode: 'auto', schedule: 'system' }, noon) === null);
  const afterSet = new Date(d.set.getTime() + HOUR);
  const sunNext = T.nextBoundary(cfgSun, afterSet);
  check('sun 日没後1時間の次は翌朝の日の出（10〜14h 後）',
    sunNext && sunNext > afterSet &&
    (sunNext - afterSet) / HOUR > 10 &&
    (sunNext - afterSet) / HOUR < 14,
    sunNext && sunNext.toISOString());
  const tr = T.nextTransition(cfgTime, noon);
  check('nextTransition は 19:00 に暗くなる', tr && +tr.at === +new Date(2026, 9, 7, 19, 0, 0) && tr.dark === true, tr);

  console.log('=== normalize / merge ===');
  const bad = T.normalize({ mode: 'zzz', schedule: 'zzz', time: { start: '99:00', end: 'aa' }, targets: { class: 'yes' } });
  check('不正値は既定に戻る', JSON.stringify(bad) === JSON.stringify(T.normalize(null)), bad);
  const ok = T.normalize({ mode: 'auto', schedule: 'sun', time: { start: '18:30', end: '05:45' }, targets: { ui: false } });
  check('正規値は保持される', ok.mode === 'auto' && ok.schedule === 'sun' &&
    ok.time.start === '18:30' && ok.time.end === '05:45' && ok.targets.ui === false &&
    ok.targets.class === true && ok.targets.letus === true, ok);
  const m = T.merge({ mode: 'auto' }, { targets: { letus: false } });
  check('merge は片方だけ変える', m.mode === 'auto' && m.targets.letus === false && m.targets.class === true, m);

  console.log('=== wantDark（対象ごとの ON/OFF） ===');
  const on = { mode: 'on', targets: { class: true, letus: false, ui: true } };
  check('on でも対象外は明るい', T.wantDark(on, 'letus', noon) === false);
  check('on の対象は暗い', T.wantDark(on, 'class', noon) === true);
  check('off は対象に関係なく明るい', T.wantDark({ mode: 'off', targets: { class: true } }, 'class', noon) === false);

  console.log('=== detectSurface ===');
  globalThis.location = { href: 'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=1' };
  check('LETUS を判別', T.detectSurface() === 'letus', T.detectSurface());
  globalThis.location = { href: 'https://class.admin.tus.ac.jp/AB/syllabus' };
  check('CLASS を判別', T.detectSurface() === 'class', T.detectSurface());
  globalThis.location = { href: 'https://www.tus.ac.jp/' };
  check('その他の *.tus.ac.jp は CLASS 側', T.detectSurface() === 'class', T.detectSurface());
  globalThis.location = { href: 'chrome-extension://abcdefghijklmnop/popup/popup.html' };
  check('拡張ページを判別', T.detectSurface() === 'ui', T.detectSurface());
  globalThis.location = { href: 'https://example.com/' };
  check('対象外は null', T.detectSurface() === null, T.detectSurface());
  delete globalThis.location;

  console.log('=== ストレージ ===');
  const mem = {};
  globalThis.chrome = { storage: { local: {
    get: (k, cb) => cb(typeof k === 'string' && k in mem ? { [k]: mem[k] } : {}),
    set: (o, cb) => { Object.assign(mem, o); if (cb) cb(); }
  } } };
  const initial = await T.getSettings();
  check('未設定なら既定値', JSON.stringify(initial) === JSON.stringify(T.normalize(null)), initial);
  const saved = await T.setSettings({ mode: 'on', targets: { letus: false } });
  check('保存後の値を返す', saved.mode === 'on' && saved.targets.letus === false, saved);
  check('storage に書いた', mem[T.STORAGE_KEY] && mem[T.STORAGE_KEY].mode === 'on', mem[T.STORAGE_KEY]);
  const again = await T.getSettings();
  check('読め直せる', again.mode === 'on' && again.targets.letus === false, again);
  const patched = await T.setSettings({ time: { start: '21:00' } });
  check('部分更新でも他は維持', patched.mode === 'on' && patched.time.start === '21:00' &&
    patched.time.end === '06:00' && patched.targets.letus === false, patched);
  delete globalThis.chrome;

  console.log(fails ? 'FAILED: ' + fails : 'ALL PASS (theme)');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
