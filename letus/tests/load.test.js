const { chromium } = require('playwright');
const os=require('os'),path=require('path');
const EXT = process.env.LETUS_EXT || path.resolve(__dirname, '..', '..');
const EXE=process.env.CHROME_PATH||path.join(os.homedir(),'.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
(async()=>{
  const ctx=await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-load2'),{
    executablePath:EXE,headless:true,args:['--disable-extensions-except='+EXT,'--load-extension='+EXT,'--no-sandbox','--disable-gpu']});
  const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker',{timeout:15000});
  const id=new URL(sw.url()).host;
  const mf=await sw.evaluate(()=>chrome.runtime.getManifest());
  console.log('✓ 読み込み成功  ID='+id);
  console.log('  名前:',mf.name,'v'+mf.version);
  console.log('  content_scripts:',mf.content_scripts[0].js.length,'スクリプト /',mf.content_scripts[0].css.length,'CSS');
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('chrome-extension://'+id+'/letus/options/options.html');
  await p.waitForSelector('#achv .lv');
  console.log('✓ 設定ページ OK（実績・演出設定を描画）');
  await p.goto('chrome-extension://'+id+'/popup/popup.html');
  await p.waitForSelector('.achv .lv');
  console.log('✓ ポップアップ OK');
  console.log('  ページエラー:', errs.length?errs:'なし');
  const files=await sw.evaluate(()=>new Promise(r=>{ r('ok'); }));
  await ctx.close();
})();
