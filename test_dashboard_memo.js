// ダッシュボードのメモ＋スコア表示テスト
// node test_dashboard_memo.js
// 1. 比較カードにメモ・スコアバッジが表示される
// 2. メモ編集→保存→再表示される
// 3. 時間割ブロックにメモ・スコアが表示される
// 4. 成績タブにもメモが表示される

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

  const store = {
    courses: {
      "9943115": {
        classCode: "9943115", nameJa: "テスト科目A", instructor: "教員A",
        dayPeriodText: "月4", dayPeriods: [{ day: "月", dayNum: 1, period: 4 }],
        credits: "1.0単位", yearSemester: "2025年度前期",
        memo: "抽選あり・注意",
        publicGrades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
        addedVia: "syllabus", sources: ["syllabus"]
      },
      "9943116": {
        classCode: "9943116", nameJa: "テスト科目B", instructor: "教員B",
        dayPeriodText: "火2", dayPeriods: [{ day: "火", dayNum: 2, period: 2 }],
        credits: "2.0単位", yearSemester: "2025年度前期",
        addedVia: "syllabus", sources: ["syllabus"]
      }
    },
    gradeLinks: {},
    timetable: { "9943115": { planned: true }, "9943116": { planned: true } },
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

  // 1. 比較カードのメモ・スコア表示
  await waitFor(() => cardOf("テスト科目A"), 5000, "比較カード描画");
  const cardA = cardOf("テスト科目A");
  console.assert(cardA.querySelector(".memo") &&
    cardA.querySelector(".memo").textContent === "抽選あり・注意", "1:メモ表示");
  console.assert(cardA.textContent.includes("スコア 4.50"), "1:スコアバッジ");
  console.assert(!cardOf("テスト科目B").querySelector(".memo"), "1:メモ無しは非表示");
  console.log("✓ 1: 比較カードのメモ・スコア 通過");

  // 2. メモ編集→保存→再表示
  const memoBtn = cardOf("テスト科目B").querySelector('button[data-act="memo"]');
  console.assert(memoBtn, "2:メモボタン存在");
  memoBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const textarea = await waitFor(
    () => document.getElementById("tce-memo-text"), 5000, "2:メモモーダル");
  console.assert(textarea.value === "", "2:初期値空");
  textarea.value = "新規メモ\n2行目";
  modal.close("ok");
  await waitFor(() => store.courses["9943116"].memo === "新規メモ\n2行目",
    5000, "2:保存");
  await waitFor(() => {
    const c = cardOf("テスト科目B");
    return c && c.querySelector(".memo") &&
      c.querySelector(".memo").textContent === "新規メモ\n2行目" ? true : null;
  }, 5000, "2:再表示");
  console.log("✓ 2: メモ編集・保存 通過");

  // 3. 時間割ブロックのメモ・スコア表示
  document.querySelector('.tab-btn[data-tab="timetable"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const blockA = await waitFor(
    () => document.querySelector('.tt-grid .block[data-code="9943115"]'),
    5000, "3:時間割描画");
  console.assert(blockA.querySelector(".b-memo") &&
    blockA.querySelector(".b-memo").textContent === "抽選あり・注意", "3:メモ表示");
  console.assert(blockA.querySelector(".b-score") &&
    blockA.querySelector(".b-score").textContent === "スコア 4.50", "3:スコア表示");
  const blockB = document.querySelector('.tt-grid .block[data-code="9943116"]');
  console.assert(blockB && blockB.querySelector(".b-memo") &&
    blockB.querySelector(".b-memo").textContent === "新規メモ\n2行目", "3:編集後メモ反映");
  console.assert(!blockB.querySelector(".b-score"), "3:スコア無しは非表示");
  console.log("✓ 3: 時間割のメモ・スコア 通過");

  // 4. 成績タブのメモ表示
  document.querySelector('.tab-btn[data-tab="grade"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    const cards = document.querySelectorAll("#tce-grade-list .course-card");
    return cards.length === 2 ? true : null;
  }, 5000, "4:成績タブ描画");
  const gradeCards = document.querySelectorAll("#tce-grade-list .course-card");
  const texts = Array.from(gradeCards).map((c) => c.textContent);
  console.assert(texts.some((t) => t.includes("抽選あり・注意")), "4:メモ表示A");
  console.assert(texts.some((t) => t.includes("新規メモ")), "4:メモ表示B");
  console.log("✓ 4: 成績タブのメモ 通過");

  console.log("DASHBOARD MEMO TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
