/* TUS Assist - ダークモード用 CSS（shared/dark-host.css + 注入UI）の検証
 * 実ページのフィクスチャが無い CLASS 側の注入UIも、ここで擬似的な DOM を組んで
 * 「反転オーバーレイ」と「再反転（元の色に戻す）」が期待どおり効くかを確認する。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = process.env.LETUS_EXT || path.resolve(__dirname, '..', '..');
const EXE = process.env.CHROME_PATH || path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');

let fails = 0;
const check = (n, c, x) => { if (c) console.log('  PASS  ' + n); else { fails++; console.log('  FAIL  ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const inv = (v) => /invert/.test(v || '');
const uri = (p) => 'file://' + path.resolve(EXT, p);

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${uri('content/content.css')}">
<link rel="stylesheet" href="${uri('letus/content/top.css')}">
<link rel="stylesheet" href="${uri('letus/content/assign.css')}">
<link rel="stylesheet" href="${uri('shared/dark-host.css')}">
</head><body>
<div class="tce-toast">t</div>
<div class="tce-sortbar"><button class="tce-btn">in sortbar</button><span class="tce-sortbar-note">n</span></div>
<button class="tce-btn" id="plain-btn">plain</button>
<button class="tce-syllabus-action">syll</button>
<button class="tce-dialog-link">dlg</button>
<span class="tce-mini-note">note</span>
<table><tr><th class="tce-score-head">h</th><td class="tce-score-cell">s</td></tr></table>
<div class="tce-picker"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></div>
<div class="la-slotbar"><span class="la-mini">x</span></div>
<div class="la-hidden-list"><div class="la-hidden-row"><span>n</span></div></div>
<div class="la-itembar"><span>y</span></div>
<div id="la-todo-panel"><div class="la-todo-menu">m</div></div>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
<div class="modal-backdrop"></div>
<div id="tce-sidepanel" style="position:fixed;z-index:2147483000">
  <button class="tce-btn sp">sidebar btn</button>
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">
</div>
</body><script>document.documentElement.setAttribute('data-tus-theme','dark')</script></html>`;

(async () => {
  const file = path.join(os.tmpdir(), 'tus-darkcss.html');
  fs.writeFileSync(file, HTML, 'utf8');
  const b = await chromium.launch({ executablePath: EXE, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + file);
  const r = await p.evaluate(() => {
    const g = (sel, pseudo) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el, pseudo) : null;
    };
    const after = getComputedStyle(document.documentElement, '::after');
    return {
      overlayFilter: after.backdropFilter || after.webkitBackdropFilter || '',
      overlayZ: after.zIndex,
      overlayPE: after.pointerEvents,
      overlayPos: after.position,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      toastZ: g('.tce-toast').zIndex,
      toastFilter: g('.tce-toast').filter,
      sortbar: g('.la-slotbar').filter,
      sortbtn: g('.tce-sortbar .tce-btn').filter,
      plainBtn: g('#plain-btn').filter,
      syll: g('.tce-syllabus-action').filter,
      dialog: g('.tce-dialog-link').filter,
      note: g('.tce-mini-note').filter,
      scoreHead: g('.tce-score-head').filter,
      scoreCell: g('.tce-score-cell').filter,
      picker: g('.tce-picker').filter,
      pickerImg: g('.tce-picker img').filter,
      hidden: g('.la-hidden-list').filter,
      itembar: g('.la-itembar').filter,
      todo: g('#la-todo-panel').filter,
      bodyImg: g('body > img').filter,
      backdrop: g('.modal-backdrop').filter,
      sidebarBtn: g('#tce-sidepanel .tce-btn').filter,
      sidebarImg: g('#tce-sidepanel img').filter
    };
  });

  console.log('=== 反転オーバーレイ ===');
  check('backdrop-filter: invert 1 + hue-rotate 180', /invert\(1\)/.test(r.overlayFilter) && /hue-rotate/.test(r.overlayFilter), r.overlayFilter);
  check('fixed / z-index=2147482000 / クリック透過',
    r.overlayPos === 'fixed' && r.overlayZ === '2147482000' && r.overlayPE === 'none', r);
  check('canvas 用に html 背景は白', r.htmlBg === 'rgb(255, 255, 255)', r.htmlBg);
  check('color-scheme は変えない（フォーム部品が反転されないように）',
    r.colorScheme === 'normal' || r.colorScheme === 'light', r.colorScheme);

  console.log('=== オーバーレイより上に置くUI ===');
  const tz = +r.toastZ;
  check('.tce-toast はオーバーレイの上・サイドバーより下', tz > 2147482000 && tz < 2147483000, r.toastZ);
  check('.tce-toast は再反転しない', !inv(r.toastFilter), r.toastFilter);
  check('サイドバー内の要素は再反転しない', !inv(r.sidebarBtn) && !inv(r.sidebarImg), [r.sidebarBtn, r.sidebarImg]);

  console.log('=== 注入UIの再反転 ===');
  const expectOn = [
    ['.la-slotbar', r.sortbar], ['sortbar 外の .tce-btn', r.plainBtn], ['.tce-syllabus-action', r.syll],
    ['.tce-dialog-link', r.dialog], ['.tce-mini-note', r.note], ['th.tce-score-head', r.scoreHead],
    ['td.tce-score-cell', r.scoreCell], ['.tce-picker', r.picker], ['.la-hidden-list', r.hidden],
    ['.la-itembar', r.itembar], ['#la-todo-panel', r.todo]
  ];
  for (const [name, v] of expectOn) check(name + ' を再反転', inv(v), v);

  console.log('=== 入れ子・メディアの打ち消し ===');
  check('.tce-sortbar 内の .tce-btn は打ち消す', r.sortbtn === 'none', r.sortbtn);
  check('.tce-picker 内の img は打ち消す', r.pickerImg === 'none', r.pickerImg);
  check('本文の img は再反転（写真を元の色に）', inv(r.bodyImg), r.bodyImg);
  check('.modal-backdrop を再反転（暗い幕に戻す）', inv(r.backdrop), r.backdrop);

  check('ページエラーなし', errs.length === 0, errs.slice(0, 3));
  fs.unlinkSync(file);
  await b.close();
  console.log('\n' + (fails ? 'FAILED: ' + fails : 'ALL PASS (darkcss)'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
