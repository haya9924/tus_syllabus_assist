const { chromium } = require('playwright');
const os = require('os');
const path = require('path');
const EXT = process.env.LETUS_EXT || path.resolve(__dirname, '..', '..');
const EXE = process.env.CHROME_PATH || path.join(os.homedir(), '.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const REF = process.env.LETUS_REF || path.resolve(__dirname, '..', '..', '..', 'letus_assist_ref');
const OUT = path.join(REF, 'analysis', 'screenshots');

const read = (pg) => pg.evaluate(() => {
  const h = document.getElementById('la-celebrate-host');
  if (!h || !h.shadowRoot) return null;
  const sr = h.shadowRoot;
  const q = (s) => sr.querySelector(s);
  return {
    result: q('.result') ? !q('.result').classList.contains('hidden') : null,
    t3d: q('.t3d') ? q('.t3d').style.transform : null,
    telop: q('.telop') ? q('.telop').textContent : null
  };
});

(async () => {
  const ctx = await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-shotp'), {
    executablePath: EXE, headless: true, viewport: { width: 1440, height: 900 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox', '--disable-gpu']
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  await new Promise((r) => setTimeout(r, 1400));
  for (const pg of ctx.pages()) await pg.close().catch(() => {});
  const id = new URL(sw.url()).host;
  const p = await ctx.newPage();
  await p.goto('chrome-extension://' + id + '/letus/preview/preview.html');
  await p.waitForSelector('#play');
  await p.waitForTimeout(300);
  await p.selectOption('#streak', '3');
  await p.fill('#level', '18');
  await p.selectOption('#intensity', 'normal');
  await p.selectOption('#strobe', 'normal');

  const t0 = Date.now();
  await p.click('#play');
  await p.waitForSelector('#la-celebrate-host');

  const at = async (sec, name) => {
    const wait = sec * 1000 - (Date.now() - t0);
    if (wait > 0) await p.waitForTimeout(wait);
    await p.screenshot({ path: OUT + '/' + name + '.png' });
    console.log(name, ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(await read(p)));
  };

  await at(1.5, 'pachi-1-hold');
  await at(3.3, 'pachi-2-reach');
  await at(7.2, 'pachi-3-finalreach');

  // 3D は大当たりと同時に左からローリング開始（translateX が大きく負の間）
  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    const t = h && h.shadowRoot && h.shadowRoot.querySelector('.t3d');
    if (!t) return false;
    const m = /translateX\((-?[\d.]+)vw\)/.exec(t.style.transform || '');
    return m && parseFloat(m[1]) < -20;
  }, { timeout: 20000 }).catch(() => {});
  await p.screenshot({ path: OUT + '/pachi-4-rolling.png' });
  console.log('pachi-4-rolling', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(await read(p)));

  await p.waitForFunction(() => {
    const h = document.getElementById('la-celebrate-host');
    return h && !h.shadowRoot.querySelector('.result').classList.contains('hidden');
  }, { timeout: 20000 });
  console.log('結果表示:', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(await read(p)));
  await p.waitForTimeout(2800);
  await p.screenshot({ path: OUT + '/pachi-5-result.png' });
  console.log('保存:', OUT);
  await ctx.close();
})();
