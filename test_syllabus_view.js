// 全パネルの「シラバスを確認」ボタン＋シラバス確認モーダル（成績ヒストグラム・編集ボタン）のテスト
// node test_syllabus_view.js
// 1. 比較カードに「シラバスを確認」ボタンがあり、クリックでシラバス詳細＋成績ヒストグラム＋編集ボタンが表示
// 2. シラバス確認内の「成績を編集」→成績編集モーダルが開き保存される
// 3. シラバス確認内の「メモを編集」→メモ編集モーダルが開く
// 4. 成績タブ・時間割追加候補のパネルにも「シラバスを確認」ボタンがある

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
        summary: "概要文", gradingPolicy: "評価方法",
        memo: "テストメモ", color: "#3498db",
        publicGrades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
        addedVia: "syllabus", sources: ["syllabus"]
      }
    },
    gradeLinks: {},
    gradeRows: {},
    timetable: {},
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
  const cardOf = (name, listSel) => {
    const cards = document.querySelectorAll((listSel || "#tce-course-list") + " .course-card");
    for (const c of cards) {
      if (c.querySelector(".name").textContent.includes(name)) return c;
    }
    return null;
  };

  // ---- 1. 比較カードの「シラバスを確認」→ シラバス詳細＋成績ヒストグラム＋編集ボタン ----
  await waitFor(() => cardOf("テスト科目A"), 5000, "比較カード描画");
  const viewBtn = cardOf("テスト科目A").querySelector('button[data-act="view"]');
  console.assert(viewBtn && viewBtn.textContent === "シラバスを確認", "1:比較カードにシラバス確認ボタン");
  viewBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const sv = await waitFor(() => document.querySelector("#tce-modal-body .sv-grade"), 5000, "1:シラバス確認モーダル");
  const chist = sv.querySelector(".chist");
  console.assert(chist, "1:成績ヒストグラム表示");
  console.assert(chist.querySelectorAll(".chist-group").length === 5, "1:ヒストグラム5判定");
  console.assert(chist.querySelectorAll(".chist-val").length === 5, "1:ヒストグラムに値表示");
  console.assert(/スコア 4.50/.test(sv.textContent), "1:スコア表示: " + sv.textContent);
  console.assert(/概要文/.test(document.getElementById("tce-modal-body").textContent), "1:シラバス詳細表示");
  const edits = document.querySelectorAll("#tce-modal-body [data-sv-edit]");
  console.assert(edits.length === 3, "1:編集ボタン3つ: " + edits.length);
  console.assert(Array.from(edits).map((b) => b.textContent).join(",") === "成績を編集,メモを編集,色を編集",
    "1:編集ボタン文言: " + Array.from(edits).map((b) => b.textContent).join(","));
  console.log("✓ 1: シラバス確認モーダル 通過");

  // ---- 2. シラバス確認内の「成績を編集」→ 成績編集モーダル → 保存 ----
  document.querySelector('#tce-modal-body [data-sv-edit="grade"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const sInput = await waitFor(() => document.getElementById("tce-g-s"), 5000, "2:成績編集モーダル");
  console.assert(sInput.value === "50", "2:S初期値: " + sInput.value);
  sInput.value = "60";
  modal.close("ok");
  await waitFor(() => (store.gradeLinks["9943115"] || {}).s === 60, 5000, "2:保存");
  console.assert(!modal.hasAttribute("open"), "2:成績編集モーダルは閉じた");
  console.log("✓ 2: 成績を編集 通過");

  // ---- 3. シラバス確認内の「メモを編集」→ メモ編集モーダル ----
  cardOf("テスト科目A").querySelector('button[data-act="view"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.querySelector("#tce-modal-body [data-sv-edit='memo']"), 5000, "3:再表示");
  document.querySelector('#tce-modal-body [data-sv-edit="memo"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.getElementById("tce-memo-text"), 5000, "3:メモ編集モーダル");
  console.assert(document.getElementById("tce-memo-text").value === "テストメモ", "3:メモ初期値");
  modal.close("cancel");
  console.log("✓ 3: メモを編集 通過");

  // ---- 4. 成績タブ・時間割追加候補にも「シラバスを確認」ボタン ----
  document.querySelector('.tab-btn[data-tab="grade"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => cardOf("テスト科目A", "#tce-grade-list"), 5000, "4:成績タブ描画");
  const gViewBtn = cardOf("テスト科目A", "#tce-grade-list").querySelector('button[data-view]');
  console.assert(gViewBtn && gViewBtn.textContent === "シラバスを確認", "4:成績タブにシラバス確認ボタン");
  document.querySelector('.tab-btn[data-tab="timetable"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => cardOf("テスト科目A", "#tce-tt-add-list"), 5000, "4:時間割候補描画");
  const ttViewBtn = cardOf("テスト科目A", "#tce-tt-add-list").querySelector('button[data-view]');
  console.assert(ttViewBtn && ttViewBtn.textContent === "シラバスを確認", "4:時間割候補にシラバス確認ボタン");
  console.log("✓ 4: 全パネルにボタン 通過");

  console.log("SYLLABUS VIEW TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });