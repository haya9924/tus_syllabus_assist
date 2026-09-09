// サイドバーの動作テスト
// node test_sidebar.js
// 1. 既定は縮小タブ（シラバス取得済み件数）
// 2. 展開でミニ時間割＋追加講座一覧（成績のみ除外・メモ・スコア表示）
// 3. 履修予定のみフィルタ
// 4. 縮小⇔OFF⇔再表示の切替
// 5. storage変更で再描画
// 6. 設定のサイズ反映・不正値丸め

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const PAGE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h2>シラバス照会</h2>
</body></html>`;

const parserCode = fs.readFileSync(path.join(__dirname, "content", "parser.js"), "utf-8");
const sidebarCode = fs.readFileSync(path.join(__dirname, "content", "sidebar.js"), "utf-8");

async function main() {
  const dom = new JSDOM(PAGE_HTML, { url: "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml" });
  const { window } = dom;
  const { document } = window;
  global.window = window;
  global.document = document;
  global.location = window.location;
  global.MutationObserver = window.MutationObserver;
  // 外部スタイルシートはjsdomが読まないため手動注入（computed style判定用）
  const css = fs.readFileSync(path.join(__dirname, "content", "content.css"), "utf-8");
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const store = {
    courses: {
      "9943115": {
        classCode: "9943115", nameJa: "テスト科目A", credits: "1.0単位",
        dayPeriodText: "月4", dayPeriods: [{ day: "月", dayNum: 1, period: 4 }],
        memo: "抽選あり",
        publicGrades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
        addedVia: "syllabus", sources: ["syllabus"]
      },
      "9943116": {
        classCode: "9943116", nameJa: "テスト科目B", credits: "2.0単位",
        dayPeriodText: "火2", dayPeriods: [{ day: "火", dayNum: 2, period: 2 }],
        addedVia: "syllabus", sources: ["syllabus"]
      },
      "9943119": {
        classCode: "9943119", nameJa: "成績のみ科目",
        dayPeriodText: "水3", dayPeriods: [{ day: "水", dayNum: 3, period: 3 }],
        publicGrades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100 },
        addedVia: "search", sources: ["grade"]
      }
    },
    timetable: { "9943115": { planned: true } },
    gradeLinks: {},
    settings: {}
  };
  const changeListeners = [];
  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          const pick = (k) => { out[k] = store[k]; };
          if (typeof keys === "string") pick(keys);
          else if (Array.isArray(keys)) keys.forEach(pick);
          else if (keys && typeof keys === "object") Object.keys(keys).forEach(pick);
          cb(out);
        },
        set: (obj, cb) => { Object.assign(store, obj); if (cb) cb(); },
        remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]); if (cb) cb(); }
      },
      onChanged: { addListener: (fn) => changeListeners.push(fn) }
    },
    runtime: { sendMessage: () => {} }
  };

  new Function("window", "document", parserCode)(window, document);
  (0, eval)(sidebarCode + "\n//# sourceURL=sidebar.js");

  const waitFor = async (fn, timeoutMs, label) => {
    const start = Date.now();
    for (;;) {
      let v = null;
      try { v = fn(); } catch (e) { /* retry */ }
      if (v) return v;
      if (Date.now() - start > timeoutMs) throw new Error("タイムアウト: " + label);
      await new Promise((r) => setTimeout(r, 50));
    }
  };

  // 1. 既定は縮小タブ（成績のみ除外で2件）
  const tab = await waitFor(
    () => document.querySelector("#tce-sp-tab"), 5000, "1:縮小タブ");
  console.assert(document.querySelector(".tce-sp-tab-count").textContent === "2",
    "1:件数2: " + document.querySelector(".tce-sp-tab-count").textContent);
  console.log("✓ 1: 縮小タブ常駐 通過");

  // 2. 展開でミニ時間割＋一覧
  tab.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.querySelector("#tce-sidepanel .tce-sp-panel"),
    5000, "2:展開パネル");
  const blockA = document.querySelector('.tce-sp-block[data-code="9943115"]');
  console.assert(blockA, "2:時間割ブロック");
  console.assert(/抽選あり/.test(blockA.title) && /スコア 4.50/.test(blockA.title), "2:tooltip: " + blockA.title);
  const spBg = window.getComputedStyle(blockA).backgroundColor;
  console.assert(/255,\s*255,\s*255/.test(spBg), "2:sidebar既定背景は白: " + spBg);
  const items = document.querySelectorAll(".tce-sp-course");
  console.assert(items.length === 2, "2:一覧2件: " + items.length);
  const texts = Array.from(items).map((el) => el.textContent);
  console.assert(!texts.some((t) => t.includes("成績のみ科目")), "2:成績のみ除外");
  console.assert(texts.some((t) => t.includes("抽選あり")), "2:メモ表示");
  console.assert(texts.some((t) => t.includes("スコア 4.50")), "2:スコア表示");
  console.log("✓ 2: 展開パネル 通過");

  // 3. 履修予定のみフィルタ
  const filt = document.querySelector("#tce-sp-planned-only");
  filt.checked = true;
  filt.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitFor(() => document.querySelectorAll(".tce-sp-course").length === 1,
    5000, "3:フィルタ");
  console.assert(document.querySelector(".tce-sp-course").textContent.includes("テスト科目A"),
    "3:予定のみ");
  console.log("✓ 3: フィルタ 通過");

  // 4. 縮小→OFF→再表示
  document.querySelector("#tce-sp-collapse")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.querySelector("#tce-sp-tab"), 5000, "4:縮小");
  // 展開してOFF
  document.querySelector("#tce-sp-tab")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.querySelector("#tce-sp-off"), 5000, "4:再展開");
  document.querySelector("#tce-sp-off")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const edge = await waitFor(
    () => document.querySelector("#tce-sp-edge"), 5000, "4:OFF極小タブ");
  console.assert(!document.querySelector("#tce-sp-panel"), "4:パネル消去");
  edge.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.querySelector("#tce-sidepanel .tce-sp-panel"),
    5000, "4:再表示");
  console.log("✓ 4: 縮小/OFF/再表示 通過");

  // 5. storage変更で再描画（縮小状態で件数確認）
  document.querySelector("#tce-sp-collapse")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.querySelector("#tce-sp-tab"), 5000, "5:縮小");
  store.courses["99KT101"] = {
    classCode: "99KT101", nameJa: "追加科目", addedVia: "syllabus", sources: ["syllabus"]
  };
  changeListeners.forEach((fn) => fn({ courses: {} }, "local"));
  await waitFor(() => {
    const el = document.querySelector(".tce-sp-tab-count");
    return el && el.textContent === "3" ? true : null;
  }, 5000, "5:件数更新");
  console.log("✓ 5: storage連動 通過");

  // 6. 設定のサイズがパネルに反映される・不正値は丸められる
  store.settings = { sidebar: { enabled: true, expanded: true, panelWidth: 360, fontScale: 110 } };
  changeListeners.forEach((fn) => fn({ settings: {} }, "local"));
  await waitFor(() => {
    const p = document.querySelector("#tce-sidepanel .tce-sp-panel");
    const st = p && p.getAttribute("style");
    return st && /width:\s*360px/.test(st) && /zoom:\s*1\.1/.test(st) ? st : null;
  }, 5000, "6:サイズ反映");
  console.log("✓ 6: サイズ反映 通過");
  store.settings = { sidebar: { enabled: true, expanded: true, panelWidth: 9999, fontScale: "abc" } };
  changeListeners.forEach((fn) => fn({ settings: {} }, "local"));
  await waitFor(() => {
    const p = document.querySelector("#tce-sidepanel .tce-sp-panel");
    const st = p && p.getAttribute("style");
    return st && /width:\s*440px/.test(st) && /zoom:\s*1(\.0)?($|;|\s)/.test(st) ? st : null;
  }, 5000, "6:不正値丸め");
  console.log("✓ 6: 不正値丸め 通過");

  console.log("SIDEBAR TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
