// 時間割タブの追加候補カード（メモ・色編集）＋比較結果の成績分布ヒストグラムのテスト
// node test_tt_addlist_hist.js
// 1. 時間割タブの追加候補にメモ・色ボタンがあり、メモ編集→保存→候補カードに反映
// 2. 色編集→保存→候補カードのドット・tint反映
// 3. 比較結果の成績分布が単一グラフ（S/A/B/C/Dごとに講座系列）で表示される

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
        publicGrades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
        addedVia: "syllabus", sources: ["syllabus"]
      },
      "9943116": {
        classCode: "9943116", nameJa: "テスト科目B", instructor: "教員B",
        dayPeriodText: "火2", dayPeriods: [{ day: "火", dayNum: 2, period: 2 }],
        credits: "2.0単位", yearSemester: "2025年度前期",
        publicGrades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100 },
        addedVia: "syllabus", sources: ["syllabus"]
      }
    },
    gradeLinks: {},
    timetable: { "9943115": { planned: true } },
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
  const candOf = (name) => {
    const cards = document.querySelectorAll("#tce-tt-add-list .course-card");
    for (const c of cards) {
      if (c.querySelector(".name").textContent.includes(name)) return c;
    }
    return null;
  };

  // ---- 1. 追加候補のメモボタン・編集→保存→候補カードに反映 ----
  document.querySelector('.tab-btn[data-tab="timetable"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const candB = await waitFor(() => candOf("テスト科目B"), 5000, "候補B描画");
  const memoBtn = candB.querySelector('button[data-memo="9943116"]');
  const colorBtn = candB.querySelector('button[data-color="9943116"]');
  console.assert(memoBtn, "1:候補にメモボタン");
  console.assert(colorBtn, "1:候補に色ボタン");
  console.assert(!candOf("テスト科目A"), "1:時間割済みは候補に出ない");
  memoBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const textarea = await waitFor(
    () => document.getElementById("tce-memo-text"), 5000, "1:メモモーダル");
  textarea.value = "時間割から追加メモ";
  modal.close("ok");
  await waitFor(() => store.courses["9943116"].memo === "時間割から追加メモ",
    5000, "1:保存");
  await waitFor(() => {
    const c = candOf("テスト科目B");
    return c && c.querySelector(".memo") &&
      c.querySelector(".memo").textContent === "時間割から追加メモ" ? true : null;
  }, 5000, "1:候補カードに反映");
  console.log("✓ 1: 候補カードのメモ編集 通過");

  // ---- 2. 候補カードの色編集→保存→ドット・tint反映 ----
  colorBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => document.getElementById("tce-color-value"), 5000, "2:色モーダル");
  document.querySelector('.color-swatch[data-color="#2ecc71"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  modal.close("ok");
  await waitFor(() => store.courses["9943116"].color === "#2ecc71", 5000, "2:色保存");
  await waitFor(() => {
    const c = candOf("テスト科目B");
    return c && c.querySelector(".color-dot") &&
      /rgba\(46,\s*204,\s*113/.test(c.getAttribute("style") || "") ? true : null;
  }, 5000, "2:ドット・tint反映");
  console.log("✓ 2: 候補カードの色編集 通過");

  // ---- 3. 比較結果の成績分布が単一グラフ（S/A/B/C/Dごとに講座系列）で表示される ----
  document.querySelector('.tab-btn[data-tab="compare"]')
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    const cards = document.querySelectorAll("#tce-course-list .course-card");
    return cards.length === 2 ? true : null;
  }, 5000, "3:比較カード描画");
  document.querySelectorAll('#tce-course-list .check').forEach((cb) => {
    if (cb.dataset.code !== "9943115" && cb.dataset.code !== "9943116") return;
    if (cb.checked) return;
    cb.checked = true;
    cb.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  document.getElementById("tce-compare-btn")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const chist = await waitFor(
    () => document.querySelector("#tce-compare-result .chist"),
    5000, "3:比較グラフ描画");
  const groups = chist.querySelectorAll(".chist-group");
  console.assert(groups.length === 5, "3:判定5グループ: " + groups.length);
  const labels = Array.from(chist.querySelectorAll(".chist-label")).map((el) => el.textContent);
  console.assert(labels.join(",") === "S,A,B,C,D", "3:ラベル順S,A,B,C,D: " + labels.join(","));
  groups.forEach((g, i) => {
    const bars = g.querySelectorAll(".chist-bar:not(.chist-empty)");
    console.assert(bars.length === 2, "3:グループ" + i + "は系列2本: " + bars.length);
  });
  const sBars = groups[0].querySelectorAll(".chist-bar:not(.chist-empty)");
  console.assert(sBars[0].style.height === "50%" && sBars[1].style.height === "10%",
    "3:S系列高さ50/10%: " + Array.from(sBars).map((b) => b.style.height).join(","));
  const legend = document.querySelector("#tce-compare-result .hist-legend");
  console.assert(legend && legend.querySelectorAll(".lg-item").length === 2,
    "3:凡例2件: " + (legend && legend.querySelectorAll(".lg-item").length));
  const resultText = document.getElementById("tce-compare-result").textContent;
  console.assert(/S:50% A:50%/.test(resultText) && /S:10% A:20% B:30%/.test(resultText),
    "3:数値テキスト併記");
  console.log("✓ 3: 比較結果の単一グラフ 通過");

  console.log("TT ADDLIST + HIST TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });