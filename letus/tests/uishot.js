const { chromium } = require('playwright');
const os=require('os'),path=require('path');
const EXT = process.env.LETUS_EXT || path.resolve(__dirname, '..', '..');
const EXE=process.env.CHROME_PATH||path.join(os.homedir(),'.cache/ms-playwright/chromium-1243/chrome-linux64/chrome');
const REF = process.env.LETUS_REF || path.resolve(__dirname, '..', '..', '..', 'letus_assist_ref');
const OUT=path.join(REF, 'analysis', 'screenshots');
(async()=>{
  const ctx=await chromium.launchPersistentContext(path.join(os.tmpdir(), 'la-ui'),{
    executablePath:EXE,headless:true,viewport:{width:1100,height:900},
    args:['--disable-extensions-except='+EXT,'--load-extension='+EXT,'--no-sandbox','--disable-gpu']});
  const sw=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');
  const id=new URL(sw.url()).host;
  console.log('拡張ID:', id);
  await new Promise(r=>setTimeout(r,1500));
  for(const p of ctx.pages()) await p.close().catch(()=>{});
  // ゲーム状態を仕込む
  const seed = {
    _v: 5,
    game: {
      xp: 1560, level: 4, streakDays: 3, bestStreak: 6, lastSubmitDate: '2026-10-06',
      totalSubmits: 9, totalFocusMinutes: 214,
      history: [
        { ts: Date.now() - 3600000, id: '2268803', name: '第3回課題提出', course: 'プログラミングとアルゴリズム１ (994321G)', xp: 1050, mult: 3, tier: 'SUPER', streak: 3, levelBefore: 3, levelAfter: 4, focusMinutes: 42 },
        { ts: Date.now() - 90000000, id: '2256263', name: '課題の提出はこちら', course: '微分積分２ (9943314)', xp: 250, mult: 1, tier: 'NICE', streak: 1, levelBefore: 3, levelAfter: 3, focusMinutes: 18 },
        { ts: Date.now() - 180000000, id: '1', name: '10/7　出席チェック', course: '電気基礎実験A組 (994335M)', xp: 350, mult: 1, tier: 'NICE', streak: 1, levelBefore: 2, levelAfter: 3, focusMinutes: 5 }
      ]
    },
    top: {
      courseStyles: {
        'https://letus.ed.tus.ac.jp/course/view.php?id=214735': { color: '#e11d48', icon: 'fa-flask', name: 'Listening & SpeakingⅠab組 (9943116)' },
        'https://letus.ed.tus.ac.jp/course/view.php?id=214742': { color: '#2563eb', name: '線形代数１ (9943176)' },
        'https://letus.ed.tus.ac.jp/course/view.php?id=208235': { icon: 'fa-vial', name: '化学 (994347W)' }
      },
      hiddenCourses: ['https://letus.ed.tus.ac.jp/course/view.php?id=214756', 'https://letus.ed.tus.ac.jp/course/view.php?id=214759']
    }
  };
  await sw.evaluate((data) => new Promise((r) => chrome.storage.local.set({ letusAssist: data }, () => r(true))), seed);

  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('chrome-extension://'+id+'/letus/options/options.html');
  await p.waitForSelector('#achv .lv',{timeout:8000});
  await p.waitForTimeout(400);
  // 個別設定セクション
  await p.evaluate(()=>{document.querySelectorAll('section h2').forEach(h=>{if(h.textContent.includes('2-2')) h.scrollIntoView();});});
  await p.waitForTimeout(300);
  console.log('個別設定:', await p.evaluate(()=>{
    const el=document.getElementById('styleList');
    const rows=[...el.querySelectorAll('tbody tr')];
    return { count:rows.length, status:document.getElementById('styleStatus').textContent,
      first:rows[0]?rows[0].querySelector('td a').textContent:null,
      swatch:rows[0]?!!rows[0].querySelector('.swatch'):null,
      icon:rows[0]?rows[0].querySelector('i.icon').className:null };
  }));
  await p.screenshot({path:OUT+'/options-course-styles.png'});
  console.log('options 実績:', await p.evaluate(()=>{
    const a=document.getElementById('achv');
    return { lv:a.querySelector('.lv').textContent, name:a.querySelector('.awname').textContent,
      xp:a.querySelector('.xp').textContent, rows:a.querySelectorAll('tbody tr').length,
      bar:a.querySelector('.bar i').style.width };
  }));
  await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
  await p.waitForTimeout(300);
  await p.screenshot({path:OUT+'/options-achievements.png'});
  await p.evaluate(()=>window.scrollTo(0,0));
  // 演出セクション
  await p.evaluate(()=>{document.querySelectorAll('section h2').forEach(h=>{if(h.textContent.includes('7. 提出完了')) h.scrollIntoView();});});
  await p.waitForTimeout(300);
  await p.screenshot({path:OUT+'/options-celebrate.png'});
  const p2=await ctx.newPage();
  const errs2=[]; p2.on('pageerror',e=>errs2.push(e.message));
  await p2.goto('chrome-extension://'+id+'/popup/popup.html');
  await p2.waitForSelector('.achv .lv',{timeout:8000});
  await p2.waitForTimeout(400);
  console.log('popup 実績:', await p2.evaluate(()=>{
    const a=document.querySelector('.achv'); return { lv:a.querySelector('.lv').textContent, sub:a.querySelector('.sub').textContent };
  }));
  await p2.screenshot({path:OUT+'/popup.png'});
  console.log('エラー:', errs.concat(errs2).length? errs.concat(errs2) : '(なし)');
  await ctx.close();
})();
