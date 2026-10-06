const { chromium } = require('playwright');
const os=require('os'),path=require('path');
const EXT = process.env.LETUS_EXT || path.resolve(__dirname, '..', '..');
const EXE=process.env.CHROME_PATH||path.join(os.homedir(),'.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const REF = process.env.LETUS_REF || path.resolve(__dirname, '..', '..', '..', 'letus_assist_ref');
const OUT=path.join(REF, 'analysis', 'screenshots');
const edit=`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body class="path-mod-assign"><div class="breadcrumb-item"><a href="https://letus.ed.tus.ac.jp/course/view.php?id=1" title="プログラミングとアルゴリズム１ (994321G)">プログラミングとアルゴリズム１ (994321G)</a></div><div class="breadcrumb-item"><a aria-current="page">第3回課題提出</a></div><div id="region-main"><div data-region="activity-information" data-activityname="第3回課題提出"><div class="activity-dates"><div><strong>期限:</strong> 2026年 10月 12日(月曜日) 18:00</div></div></div><div class="submissionstatustable"><table><tbody><tr><th>提出ステータス</th><td>未提出</td></tr></tbody></table></div><form method="post" action="https://letus.ed.tus.ac.jp/mod/assign/view.php?id=2268803"><input type="submit" id="id_submitbutton" name="submitbutton" value="この状態で提出する"></form></div></body></html>`;
const view=`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body class="path-mod-assign"><div class="breadcrumb-item"><a href="https://letus.ed.tus.ac.jp/course/view.php?id=1" title="プログラミングとアルゴリズム１ (994321G)">プログラミングとアルゴリズム１ (994321G)</a></div><div class="breadcrumb-item"><a aria-current="page">第3回課題提出</a></div><div id="region-main"><div data-region="activity-information" data-activityname="第3回課題提出"></div><div class="submissionstatustable"><table><tbody><tr><th>提出ステータス</th><td class="submissionstatussubmitted">評定のために提出済み</td></tr></tbody></table></div></div></body></html>`;
(async()=>{
  const ctx=await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-shot'),{
    executablePath:EXE,headless:true,viewport:{width:1440,height:900},
    args:['--disable-extensions-except='+EXT,'--load-extension='+EXT,'--no-sandbox','--disable-gpu']});
  const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');
  await new Promise(r=>setTimeout(r,1400));
  for(const p of ctx.pages()) await p.close().catch(()=>{});
  await ctx.route(/^https:\/\/letus\.ed\.tus\.ac\.jp\//, async route=>{
    const req=route.request(); const q=new URL(req.url()).searchParams;
    if(req.method()==='POST'){ const to='https://letus.ed.tus.ac.jp/mod/assign/view.php?id='+q.get('id')+'&action=view';
      return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:'<script>location.replace('+JSON.stringify(to)+')</script>'}); }
    return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:(q.get('action')||'view')==='editsubmission'?edit:view});
  });
  // Lv.16 相当の状態から提出 → LEVEL UP と大きな XP を見せる
  await sw.evaluate(()=>new Promise(r=>chrome.storage.local.set({letusAssist:{_v:4,game:{xp:14900,level:16,streakDays:4,bestStreak:6,lastSubmitDate:'2026-10-05',totalSubmits:41,totalFocusMinutes:720,history:[]},celebrate:{enabled:true,sound:true,autoCloseSec:30,confetti:380}}},()=>r(true))));
  const p=await ctx.newPage();
  await p.goto('https://letus.ed.tus.ac.jp/mod/assign/view.php?id=2268803&action=editsubmission',{waitUntil:'load'});
  await p.waitForSelector('#id_submitbutton'); await p.waitForTimeout(900);
  await p.click('#id_submitbutton');
  await p.waitForSelector('#la-celebrate-host');
  await p.waitForTimeout(700);
  await p.screenshot({path:OUT+'/celebration-early.png'});
  await p.waitForTimeout(2600);
  await p.screenshot({path:OUT+'/celebration-full.png'});
  console.log('保存:', OUT);
  await ctx.close();
})();
