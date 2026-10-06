const path = require('path');
let calls=[],responses=[];
globalThis.fetch=async(url,init)=>{calls.push({url,init});const r=responses.shift()||{ok:true,status:200,json:async()=>({})};
 return {ok:r.ok!==false,status:r.status||200,json:async()=>(typeof r.json==='function'?r.json():(r.json||{})),text:async()=>(r.text||'')};};
const mem={};
globalThis.chrome={runtime:{id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',lastError:null,getManifest:()=>({oauth2:{client_id:'test.apps.googleusercontent.com'}})},
 identity:{getAuthToken:(o,cb)=>cb('TOK'),removeCachedAuthToken:(o,cb)=>cb(true)},
 storage:{local:{get:(k,cb)=>cb(k&&typeof k==='string'&&k in mem?{[k]:mem[k]}:{}),set:(o,cb)=>{Object.assign(mem,o);if(cb)cb();},remove:(k,cb)=>{delete mem[k];if(cb)cb();}}}};
let fails=0; const check=(n,c,x)=>{if(c)console.log('  PASS  '+n);else{fails++;console.log('  FAIL  '+n+(x!==undefined?'  -> '+JSON.stringify(x):''));}};
const B = path.resolve(__dirname, '..', 'background') + path.sep;
(async()=>{
  const g=await import('file://'+B+'google.js');
  check('client_id 判定', g.isConfigured()===true);
  calls=[];responses=[{json:async()=>({id:'t1',due:'2026-09-22T08:00:00.000Z'})}];
  await g.addTask({title:'[LETUS] 微分積分２ (9943314) 課題の提出はこちら',note:'https://letus.ed.tus.ac.jp/mod/assign/view.php?id=2256263',dueUtc:'2026-09-22T08:00:00.000Z',taskList:'@default'});
  check('Google POST URL', calls[0].url==='https://tasks.googleapis.com/tasks/v1/lists/%40default/tasks', calls[0].url);
  const gb=JSON.parse(calls[0].init.body);
  check('due RFC3339 (JST17:00=08:00Z)', gb.due==='2026-09-22T08:00:00.000Z', gb.due);
  const m=await import('file://'+B+'microsoft.js');
  mem['letusMsAuth']={clientId:'c',tenant:'consumers',accessToken:'T',refreshToken:'R',expiresAt:Date.now()+3600000};
  calls=[];responses=[{json:async()=>({value:[{id:'L1',displayName:'Flagged email',isOwner:true},{id:'L2',displayName:'Tasks'}]})},{json:async()=>({id:'c1'})}];
  await m.addTask({title:'x',note:'u',dueParts:{year:2026,month:9,day:22,hour:17,minute:0},timeZone:'Asia/Tokyo',listName:'Tasks',reminder:true,reminderMinutes:60});
  check('Graph リスト取得', calls[0].url==='https://graph.microsoft.com/v1.0/me/todo/lists?$top=100', calls[0].url);
  check('Graph POST', calls[1].url==='https://graph.microsoft.com/v1.0/me/todo/lists/L2/tasks', calls[1].url);
  const mb=JSON.parse(calls[1].init.body);
  check('dueDateTime 17:00 Tokyo', mb.dueDateTime.dateTime==='2026-09-22T17:00:00'&&mb.dueDateTime.timeZone==='Tokyo Standard Time', mb.dueDateTime);
  check('リマインダー=07:00Z', mb.reminderDateTime.dateTime==='2026-09-22T07:00:00', mb.reminderDateTime);
  const D=globalThis.LA_DATE;
  check('ja 日付パース', JSON.stringify(D.parseDueDate('2026年 09月 22日(火曜日) 17:00'))==='{"year":2026,"month":9,"day":22,"hour":17,"minute":0,"raw":"2026年 09月 22日(火曜日) 17:00"}');
  check('JST->UTC', D.toRfc3339Utc({year:2026,month:9,day:22,hour:17,minute:0},'Asia/Tokyo')==='2026-09-22T08:00:00.000Z');
  console.log(fails?'FAILED: '+fails:'ALL PASS (api)');
  process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
