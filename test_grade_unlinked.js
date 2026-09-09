// dashboard成績タブ「保存した成績データ（未接続）」のテスト
// node test_grade_unlinked.js
// 1. pinned未接続のみセクションに表示（リンク済み・非pinnedは除外）
// 2. リンクボタン→授業選択モーダル→紐付けでセクションから消える
// 3. 削除ボタンでgradeRowsから消える

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
        classCode: "9943115", nameJa: "テスト科目A",
        addedVia: "syllabus", sources: ["syllabus"]
      }
    },
    gradeLinks: {
      // 9943121 は別授業にリンク済み → 未接続に出さない
      "9943115": {
        s: 13, a: 30.4, b: 34.8, c: 17.4, d: 4.3, count: 23, score: 3.26,
        sourceRow: { classCode: "9943121", nameJa: "別科目" },
        linkedAt: 1
      }
    },
    gradeRows: {
      "9943121": {
        classCode: "9943121", nameJa: "別科目",
        grades: { s: 13, a: 30.4, b: 34.8, c: 17.4, d: 4.3, count: 23 },
        score: 3.26, pinned: true, pinnedAt: 1, scrapedAt: 1
      },
      "9943119": {
        classCode: "9943119", nameJa: "未接続科目",
        grades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 20 },
        score: 4.5, pinned: true, pinnedAt: 2, scrapedAt: 2
      },
      "9943120": {
        classCode: "9943120", nameJa: "自動収集のみ",
        grades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 30 },
        score: 2.6, scrapedAt: 3
      }
    },
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
  const unlinkedCardOf = (name) => {
    const cards = document.querySelectorAll("#tce-grade-list .course-card");
    for (const c of cards) {
      const n = c.querySelector(".name");
      if (n && n.textContent.includes(name) && c.querySelector("button[data-uplink]")) return c;
    }
    return null;
  };
  const toGradeTab = () => {
    document.querySelector('.tab-btn[data-tab="grade"]')
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  };

  // 1. 未接続セクションの表示内容
  toGradeTab();
  await waitFor(() => unlinkedCardOf("未接続科目"), 5000, "未接続セクション描画");
  console.assert(!unlinkedCardOf("別科目"), "1:リンク済みは除外");
  console.assert(!unlinkedCardOf("自動収集のみ"), "1:非pinnedは除外");
  const card = unlinkedCardOf("未接続科目");
  console.assert(card.textContent.includes("スコア 4.50"), "1:スコア表示");
  console.assert(card.querySelector('button[data-uplink="9943119"]'), "1:リンクボタン");
  console.assert(card.querySelector('button[data-undel="9943119"]'), "1:削除ボタン");
  console.log("✓ 1: 未接続セクション表示 通過");

  // 2. リンクボタン→授業選択→紐付けでセクションから消える
  card.querySelector('button[data-uplink="9943119"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const pickBtn = await waitFor(
    () => document.querySelector('#tce-cand-list button[data-pick-course="9943115"]'),
    5000, "2:授業選択モーダル");
  pickBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    const gl = store.gradeLinks || {};
    return gl["9943115"] && gl["9943115"].sourceRow &&
      gl["9943115"].sourceRow.classCode === "9943119" ? true : null;
  }, 5000, "2:紐付け保存");
  await waitFor(() => !unlinkedCardOf("未接続科目"), 5000, "2:セクションから消去");
  // publicGrades も統合され、sources の syllabus が消えていないこと
  const c = store.courses["9943115"];
  console.assert(c.publicGrades && c.publicGrades.s === 50, "2:成績統合");
  console.assert((c.sources || []).includes("syllabus"), "2:sources保持: " + JSON.stringify(c.sources));
  console.log("✓ 2: 紐付けフロー 通過");

  // 3. 削除ボタンで gradeRows から消える（別エントリを追加して検証）
  store.gradeRows["9943122"] = {
    classCode: "9943122", nameJa: "削除対象",
    grades: { s: 0, a: 0, b: 0, c: 100, d: 0, count: 10 },
    score: 2.0, pinned: true, pinnedAt: 4, scrapedAt: 4
  };
  toGradeTab();
  const delCard = await waitFor(() => unlinkedCardOf("削除対象"), 5000, "3:削除対象表示");
  delCard.querySelector('button[data-undel="9943122"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => !((store.gradeRows || {})["9943122"]), 5000, "3:削除保存");
  await waitFor(() => !unlinkedCardOf("削除対象"), 5000, "3:表示から消去");
  console.log("✓ 3: 削除フロー 通過");

  // 4. 保存授業ゼロでも未接続セクションは表示される
  store.gradeRows["9943130"] = {
    classCode: "9943130", nameJa: "保存なし科目",
    grades: { s: 20, a: 30, b: 30, c: 10, d: 10, count: 15 },
    score: 3.4, pinned: true, pinnedAt: 5, scrapedAt: 5
  };
  delete store.courses["9943115"];
  toGradeTab();
  const zeroCard = await waitFor(() => unlinkedCardOf("保存なし科目"), 5000, "4:ゼロ件でも表示");
  console.assert(document.querySelector("#tce-grade-list").textContent.includes("保存済みの授業がありません"),
    "4:ゼロ件メッセージ");
  console.assert(zeroCard.querySelector('button[data-uplink="9943130"]'), "4:リンクボタン");
  console.assert(zeroCard.querySelector('button[data-undel="9943130"]'), "4:削除ボタン");
  console.log("✓ 4: 保存ゼロでも未接続表示 通過");

  // 5. 時間割の履修予定追加リストにもスコア表示
  store.courses["9943115"] = {
    classCode: "9943115", nameJa: "テスト科目A", instructor: "教員A",
    dayPeriodText: "月4", dayPeriods: [{ day: "月", dayNum: 1, period: 4 }],
    credits: "1.0単位", yearSemester: "2025年度前期",
    publicGrades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
    addedVia: "syllabus", sources: ["syllabus"]
  };
  document.querySelector('.tab-btn[data-tab="timetable"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const cand = await waitFor(() => {
    const cards = document.querySelectorAll("#tce-tt-add-list .course-card");
    for (const c of cards) {
      const n = c.querySelector(".name");
      if (n && n.textContent.includes("テスト科目A")) return c;
    }
    return null;
  }, 5000, "5:追加リスト描画");
  const scoreBadge = cand.querySelector(".badge.score");
  console.assert(scoreBadge && scoreBadge.textContent === "スコア 4.50",
    "5:候補スコア表示: " + (scoreBadge && scoreBadge.textContent));
  console.log("✓ 5: 追加リストのスコア表示 通過");

  console.log("GRADE UNLINKED TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
