// JSONインポートのテスト（ファイル選択・ドラッグ&ドロップ・エラー表示）
// node test_import.js
// 1. ファイル選択→確認→ストレージへ書き込み、各タブへ反映・成功アラート
// 2. accept 属性に .json 拡張子を含む（ファイル選択で選べない環境対策）
// 3. ドラッグ&ドロップでもインポートできる
// 4. 壊れたJSON / courses 無しJSONは具体的なエラーメッセージで弾く
// 5. キャンセル時は取り込まず「キャンセル」を通知

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

  const store = {};
  let confirmResult = true;
  const alerts = [];
  global.confirm = () => confirmResult;
  global.alert = (m) => alerts.push(m);

  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          const pick = (k) => { out[k] = store[k]; };
          if (typeof keys === "string") pick(keys);
          else if (Array.isArray(keys)) keys.forEach(pick);
          else if (keys && typeof keys === "object") Object.keys(keys).forEach(pick);
          setTimeout(() => cb(out), 0);
        },
        set: (obj, cb) => { Object.assign(store, obj); setTimeout(() => cb && cb(), 0); },
        remove: (keys, cb) => { (Array.isArray(keys) ? keys : [keys]).forEach((k) => delete store[k]); setTimeout(() => cb && cb(), 0); }
      }
    }
  };

  const modal = document.getElementById("tce-modal");
  modal.showModal = function () { this.setAttribute("open", ""); };
  modal.close = function (v) { this.returnValue = v == null ? "" : v; this.removeAttribute("open"); if (typeof this.onclose === "function") this.onclose(); };

  const code = fs.readFileSync(path.join(__dirname, "dashboard", "dashboard.js"), "utf-8");
  (0, eval)(code);
  await new Promise((r) => setTimeout(r, 500));

  const backup = {
    version: 2,
    exportedAt: "2026-09-13T13:59:42.343Z",
    courses: {
      "9943119": { classCode: "9943119", nameJa: "テスト科目X", addedVia: "syllabus", sources: ["syllabus"] },
      "9943120": { classCode: "9943120", nameJa: "テスト科目Y", addedVia: "syllabus", sources: ["syllabus"] }
    },
    gradeLinks: { "9943119": { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100, score: 2.5 } },
    gradeRows: { "9943119": { classCode: "9943119", grades: { s: 10 }, pinned: true } },
    timetable: { "9943119": { planned: true } },
    manualSlots: { "月-1": { title: "メモ" } },
    settings: { sidebar: { enabled: false } }
  };
  const jsonText = JSON.stringify(backup, null, 2);
  const waitAlerts = async () => { for (let i = 0; i < 40; i++) { if (alerts.length) return; await new Promise((r) => setTimeout(r, 50)); } };
  const importViaInput = async (text, name) => {
    const file = new window.File([text], name, { type: "application/json" });
    const input = document.getElementById("tce-import");
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await waitAlerts();
  };
  const importViaDrop = async (text, name) => {
    const file = new window.File([text], name, { type: "application/json" });
    const sec = document.getElementById("tab-settings");
    const fire = (type, files) => {
      const ev = new window.Event(type, { bubbles: true, cancelable: true });
      ev.dataTransfer = { types: ["Files"], files };
      sec.dispatchEvent(ev);
    };
    fire("dragenter", [file]);
    fire("dragover", [file]);
    if (!sec.classList.contains("drag-over")) console.assert(!sec.classList.contains("drag-over") === false, "6:dragoverで強調表示");
    fire("drop", [file]);
    await waitAlerts();
  };

  // ---- 2. accept 属性 ----
  const accept = document.getElementById("tce-import").getAttribute("accept");
  console.assert(/\.json/.test(accept), "2:acceptに.json拡張子: " + accept);
  console.assert(/application\/json/.test(accept), "2:acceptにapplication/json");
  console.log("✓ 2: accept属性 通過");

  // ---- 1. ファイル選択でのインポート ----
  await importViaInput(jsonText, "backup.json");
  console.assert(/インポートしました/.test(alerts[alerts.length - 1]), "1:成功アラート: " + alerts[alerts.length - 1]);
  console.assert(/授業 2 件/.test(alerts[alerts.length - 1]), "1:件数表示: " + alerts[alerts.length - 1]);
  console.assert(store.courses && store.courses["9943119"].nameJa === "テスト科目X", "1:courses保存");
  console.assert(store.gradeLinks["9943119"].score === 2.5, "1:gradeLinks");
  console.assert(store.gradeRows["9943119"] && store.gradeRows["9943119"].pinned, "1:gradeRows");
  console.assert(store.timetable["9943119"].planned === true, "1:timetable");
  console.assert(store.manualSlots["月-1"].title === "メモ", "1:manualSlots");
  console.assert(store.settings.sidebar.enabled === false, "1:settings");
  // 入力リセット: 同じファイル再選択でも change が発火する
  const again = new window.Event("change", { bubbles: true });
  const inputEl = document.getElementById("tce-import");
  console.assert(inputEl.value === "", "1:選択後リセット");
  console.assert(store.courses["9943120"], "1:Coursesは残存");
  console.log("✓ 1: ファイル選択インポート 通過");

  // ---- 5. キャンセル ----
  const before = JSON.stringify(store.courses);
  confirmResult = false;
  alerts.length = 0;
  await importViaInput(jsonText, "backup.json");
  console.assert(/キャンセル/.test(alerts[alerts.length - 1]), "5:キャンセル通知: " + alerts[alerts.length - 1]);
  console.assert(before === JSON.stringify(store.courses), "5:キャンセル時は変更なし");
  confirmResult = true;
  console.log("✓ 5: キャンセル 通過");

  // ---- 4a. 壊れたJSON ----
  alerts.length = 0;
  await importViaInput("{これは壊れたJSON", "broken.json");
  console.assert(/インポート失敗/.test(alerts[alerts.length - 1]), "4a:壊れたJSONで失敗表示: " + alerts[alerts.length - 1]);
  console.assert(/解析できません/.test(alerts[alerts.length - 1]), "4a:解析エラー文言");
  console.log("✓ 4a: 壊れたJSON 通過");

  // ---- 4b. courses 無しJSON ----
  alerts.length = 0;
  await importViaInput(JSON.stringify({ hello: "world" }), "other.json");
  console.assert(/インポート失敗/.test(alerts[alerts.length - 1]) && /本拡張機能が書き出したバックアップJSONではありません/.test(alerts[alerts.length - 1]),
    "4b:バックアップ以外のJSON: " + alerts[alerts.length - 1]);
  console.log("✓ 4b: courses無し 通過");

  // ---- 3. ドラッグ&ドロップでのインポート ----
  store.courses = {};
  alerts.length = 0;
  await importViaDrop(jsonText, "backup2.json");
  console.assert(/インポートしました/.test(alerts[alerts.length - 1]), "3:ドロップ成功: " + alerts[alerts.length - 1]);
  console.assert(store.courses["9943119"], "3:ドロップで書き込み");
  console.log("✓ 3: ドラッグ&ドロップ 通過");

  console.log("IMPORT TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });