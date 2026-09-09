// ダッシュボードの講座色付けテスト
// node test_course_color.js
// 1. 保存済み色の表示（比較カードのドット・時間割ブロックの左ボーダー）
// 2. 比較タブの「色」ボタン→パレット選択→保存→再表示
// 3. 時間割の追加候補・成績タブにもドット表示
// 4. 成績タブからカスタム色に変更→クリアで消去

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

async function main() {
  const html = fs.readFileSync(path.join(__dirname, "dashboard", "dashboard.html"), "utf-8");
  const dom = new JSDOM(html, { url: "https://localhost/dashboard/dashboard.html" });
  const { window } = dom;
  const { document } = window;
  global.window = window;
  global.document = document;
  global.confirm = () => true;
  global.alert = () => {};
  // 外部スタイルシートはjsdomが読まないため手動注入（computed style判定用）
  const css = fs.readFileSync(path.join(__dirname, "dashboard", "dashboard.css"), "utf-8");
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const store = {
    courses: {
      "9943115": {
        classCode: "9943115", nameJa: "テスト科目A", instructor: "教員A",
        dayPeriodText: "月4", dayPeriods: [{ day: "月", dayNum: 1, period: 4 }],
        credits: "1.0単位", yearSemester: "2025年度前期",
        color: "#3498db",
        publicGrades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
        addedVia: "syllabus", sources: ["syllabus"]
      },
      "9943116": {
        classCode: "9943116", nameJa: "テスト科目B", instructor: "教員B",
        dayPeriodText: "火2", dayPeriods: [{ day: "火", dayNum: 2, period: 2 }],
        credits: "2.0単位", yearSemester: "2025年度前期",
        addedVia: "syllabus", sources: ["syllabus"]
      },
      "9943117": {
        classCode: "9943117", nameJa: "テスト科目C", instructor: "教員C",
        dayPeriodText: "水3", dayPeriods: [{ day: "水", dayNum: 3, period: 3 }],
        credits: "1.0単位", yearSemester: "2025年度前期",
        addedVia: "syllabus", sources: ["syllabus"]
      }
    },
    gradeLinks: {},
    timetable: { "9943115": { planned: true }, "9943117": { planned: true } },
    manualSlots: {},
    settings: {}
  };
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
      }
    }
  };

  // <dialog> は jsdom 未実装のためスタブ化
  const modal = document.getElementById("tce-modal");
  modal.showModal = function () { this.setAttribute("open", ""); };
  modal.close = function (v) {
    this.returnValue = v == null ? "" : v;
    this.removeAttribute("open");
    if (typeof this.onclose === "function") this.onclose();
  };

  const code = fs.readFileSync(path.join(__dirname, "dashboard", "dashboard.js"), "utf-8");
  (0, eval)(code + "\n//# sourceURL=dashboard.js");

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
  const cardOf = (name) => {
    const cards = document.querySelectorAll("#tce-course-list .course-card");
    for (const c of cards) {
      if (c.querySelector(".name").textContent.includes(name)) return c;
    }
    return null;
  };
  const gradeCardOf = (name) => {
    const cards = document.querySelectorAll("#tce-grade-list .course-card");
    for (const c of cards) {
      if (c.querySelector(".name").textContent.includes(name)) return c;
    }
    return null;
  };

  // 1. 保存済み色の表示
  await waitFor(() => cardOf("テスト科目A"), 5000, "比較カード描画");
  console.assert(cardOf("テスト科目A").querySelector(".color-dot"), "1:Aにドット");
  console.assert(/rgba\(52,\s*152,\s*219/.test(cardOf("テスト科目A").getAttribute("style") || ""),
    "1:Aカード背景: " + cardOf("テスト科目A").getAttribute("style"));
  console.assert(!cardOf("テスト科目B").querySelector(".color-dot"), "1:Bはドット無し");
  console.assert(!(cardOf("テスト科目B").getAttribute("style") || "").includes("background"),
    "1:Bは背景無し");
  console.log("✓ 1: 比較カードの色表示 通過");

  // 2. 比較タブの「色」ボタン→パレット選択→保存→再表示
  const colorBtn = cardOf("テスト科目B").querySelector('button[data-act="color"]');
  console.assert(colorBtn, "2:色ボタン存在");
  colorBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.getElementById("tce-color-value"), 5000, "2:色モーダル");
  console.assert(document.getElementById("tce-color-value").value === "", "2:初期値空");
  console.assert(!document.querySelector(".color-swatch.selected"), "2:初期選択無し");
  document.querySelector('.color-swatch[data-color="#e74c3c"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  console.assert(document.getElementById("tce-color-value").value === "#e74c3c", "2:パレット反映");
  modal.close("ok");
  await waitFor(() => store.courses["9943116"].color === "#e74c3c", 5000, "2:保存");
  await waitFor(() => {
    const c = cardOf("テスト科目B");
    return c && c.querySelector(".color-dot") ? true : null;
  }, 5000, "2:再表示");
  console.log("✓ 2: 色編集・保存 通過");

  // 3. 時間割ブロック・追加候補・成績タブの表示
  document.querySelector('.tab-btn[data-tab="timetable"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const blockA = await waitFor(
    () => document.querySelector('.tt-grid .block[data-code="9943115"]'),
    5000, "3:時間割描画");
  const blockStyle = blockA.getAttribute("style") || "";
  console.assert(/border-left-color/i.test(blockStyle), "3:ブロック左ボーダー: " + blockStyle);
  console.assert(/rgba\(52,\s*152,\s*219/.test(blockStyle), "3:ブロック背景: " + blockStyle);
  const candB = await waitFor(() => {
    const cards = document.querySelectorAll("#tce-tt-add-list .course-card");
    for (const c of cards) {
      if (c.querySelector(".name").textContent.includes("テスト科目B")) return c;
    }
    return null;
  }, 5000, "3:追加候補描画");
  console.assert(candB.querySelector(".color-dot"), "3:候補ドット");
  // 色指定なしの科目C（時間割済）→インライン色無し・CSS既定は白
  const blockC = await waitFor(
    () => document.querySelector('.tt-grid .block[data-code="9943117"]'),
    5000, "3:Cブロック描画");
  const cStyle = blockC.getAttribute("style") || "";
  console.assert(!/background|border-left/i.test(cStyle), "3:Cはインライン色無し: " + cStyle);
  const cBg = window.getComputedStyle(blockC).backgroundColor;
  console.assert(/255,\s*255,\s*255/.test(cBg), "3:C既定背景は白: " + cBg);
  const cBl = window.getComputedStyle(blockC).borderLeftColor;
  console.assert(/156,\s*163,\s*175/.test(cBl), "3:C既定ボーダーはグレー: " + cBl);
  document.querySelector('.tab-btn[data-tab="grade"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => gradeCardOf("テスト科目A"), 5000, "4:成績タブ描画");
  console.assert(gradeCardOf("テスト科目A").querySelector(".color-dot"), "3:成績Aドット");
  console.assert(gradeCardOf("テスト科目B").querySelector(".color-dot"), "3:成績Bドット");
  console.assert(/rgba\(231,\s*76,\s*60/.test(gradeCardOf("テスト科目B").getAttribute("style") || ""),
    "3:成績B背景: " + gradeCardOf("テスト科目B").getAttribute("style"));
  console.log("✓ 3: 時間割・成績タブの色表示 通過");

  // 4. 成績タブからカスタム色に変更→クリア
  const gColorBtn = gradeCardOf("テスト科目B").querySelector('button[data-color]');
  console.assert(gColorBtn, "4:成績タブの色ボタン存在");
  gColorBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const custom = await waitFor(
    () => document.getElementById("tce-color-custom"), 5000, "4:色モーダル");
  custom.value = "#123456";
  custom.dispatchEvent(new window.Event("input", { bubbles: true }));
  console.assert(document.getElementById("tce-color-value").value === "#123456", "4:カスタム反映");
  modal.close("ok");
  await waitFor(() => store.courses["9943116"].color === "#123456", 5000, "4:カスタム保存");
  // クリア
  gradeCardOf("テスト科目B").querySelector('button[data-color]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.getElementById("tce-color-clear"), 5000, "4:再オープン");
  document.getElementById("tce-color-clear")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  modal.close("ok");
  await waitFor(() => store.courses["9943116"].color === "", 5000, "4:クリア保存");
  await waitFor(() => {
    const c = gradeCardOf("テスト科目B");
    return c && !c.querySelector(".color-dot") &&
      !((c.getAttribute("style") || "").includes("background")) ? true : null;
  }, 5000, "4:ドット・背景消去");
  console.log("✓ 4: 変更・クリア 通過");

  console.log("COURSE COLOR TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
