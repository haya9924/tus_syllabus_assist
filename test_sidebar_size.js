// ダッシュボード設定画面のサイドバーサイズ設定テスト
// node test_sidebar_size.js
// 1. 保存値がフォーム初期値に反映される
// 2. スライダー変更→保存で正規化されて永続化される
// 3. 範囲外は丸められる
// 4. リセットで既定値に戻る

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
    courses: {},
    gradeLinks: {},
    gradeRows: {},
    timetable: {},
    manualSlots: {},
    settings: { sidebar: { enabled: true, expanded: false, panelWidth: 360, fontScale: 110 } }
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
  const $ = (id) => document.getElementById(id);

  // 1. 保存値がフォーム初期値に反映される
  await waitFor(() => $("tce-sp-width-val").textContent === "360px" &&
    $("tce-sp-font-val").textContent === "110%", 5000, "1:初期値反映");
  console.assert($("tce-sp-width").value === "360", "1:幅スライダー");
  console.assert($("tce-sp-font").value === "110", "1:文字スライダー");
  console.log("✓ 1: 初期値反映 通過");

  // 2. 変更→保存で永続化（既存の enabled 等は保持）
  $("tce-sp-width").value = "400";
  $("tce-sp-font").value = "90";
  $("tce-sp-width").dispatchEvent(new window.Event("input", { bubbles: true }));
  console.assert($("tce-sp-width-val").textContent === "400px", "2:表示更新");
  $("tce-sp-size-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    const s = (store.settings || {}).sidebar || {};
    return s.panelWidth === 400 && s.fontScale === 90 ? true : null;
  }, 5000, "2:保存");
  console.assert(store.settings.sidebar.enabled === true, "2:既存キー保持");
  console.log("✓ 2: 保存・永続化 通過");

  // 3. 範囲外は丸められる
  $("tce-sp-width").value = "999";
  $("tce-sp-font").value = "10";
  $("tce-sp-size-save").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    const s = (store.settings || {}).sidebar || {};
    return s.panelWidth === 440 && s.fontScale === 85 ? true : null;
  }, 5000, "3:丸め保存");
  console.log("✓ 3: 範囲外丸め 通過");

  // 4. リセットで既定値に戻る
  $("tce-sp-size-reset").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    const s = (store.settings || {}).sidebar || {};
    return s.panelWidth === 300 && s.fontScale === 100 ? true : null;
  }, 5000, "4:リセット保存");
  await waitFor(() => $("tce-sp-width-val").textContent === "300px" &&
    $("tce-sp-font-val").textContent === "100%", 5000, "4:フォーム復元");
  console.log("✓ 4: リセット 通過");

  console.log("SIDEBAR SIZE TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
