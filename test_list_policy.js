// 一覧は追加不可・注意表示のみ＋ダイアログ単一ボタンのテスト
// node test_list_policy.js
// A: シラバス一覧（成績側のみ既存）→ 注意のみ、ボタン無し
// B: 成績一覧（シラバス側のみ既存）→ 注意＋リンクボタン、追加ボタン無し
// C: ピッカーで保存済みをクリック→即時リンク＋注意消去
// D: 未保存のみ→リンクボタン無し・追加ボタンのみ
// E: ダイアログは追加ボタン1つのみ（再発火でも重複しない）
// F: 両側済みは注意無し
// G: 後からのstorage追加→onChangedで注意表示
// H: ダイアログ内で成績側のみ既存→詳細追加ボタン＋注意書き
// I: 成績ページのダイアログには追加ボタンを出さない
// J: 未保存行は「＋成績追加」→クリックでpinned保存→「成績保存済み」
// K: pinned後に授業が保存されるとリンクボタンに切り替わる
// L: 授業なし・pinned成績のみ → シラバス一覧に注意表示
// M: 後からシラバス側が揃うと注意が消える
// N: 一覧の注意書きは文字のみ（クリック無反応・授業未作成）
// P: legacy成績のみ授業の注意書きも文字のみ
// Q1: 未追加＋pinnedあり→追加ボタン一発で詳細保存＋リンク＋追加済み
// Q2: 成績のみ既存＋pinnedあり→詳細追加ボタン一発で完了（明示保存を優先）
// Q3: リンクボタン→候補モーダル→選択で詳細保存＋リンク

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SYLLABUS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h2>シラバス照会</h2>
<div id="funcForm:table"><div class="ui-datatable-tablewrapper"><table>
<thead><tr>
<th>開講年度学期</th><th>授業コード</th><th>科目授業名称</th>
<th>曜日時限</th><th>担当教員</th><th>単位数</th>
</tr></thead>
<tbody id="funcForm:table_data">
<tr data-ri="0">
<td>2026年度 後期</td><td>99KT101</td>
<td><a id="funcForm:table:0:jugyoKmkName">99KT101 生命科学入門</a></td>
<td>月5</td><td>秋山 好嗣</td><td>2.0単位</td>
</tr>
</tbody>
</table></div></div>
</body></html>`;

const GRADE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h2>成績評価公開授業照会</h2>
<div id="funcForm:table"><div class="ui-datatable-tablewrapper"><table>
<thead><tr>
<th rowspan="2">学科組織</th><th rowspan="2">開講年度学期</th>
<th rowspan="2">授業コード</th><th rowspan="2">授業科目</th>
<th rowspan="2">曜日時限</th><th rowspan="2">担当教員</th>
<th rowspan="2">評価対象者数</th><th colspan="5">成績評価状況(%)※</th>
</tr>
<tr><th>S評価</th><th>A評価</th><th>B評価</th><th>C評価</th><th>D評価</th></tr>
</thead>
<tbody id="funcForm:table_data">
<tr data-ri="0">
<td>東理大 工 電工</td><td>2025年度前期</td><td>9943115</td>
<td><a id="funcForm:table:0:jugyoKmkName">Listening &amp; SpeakingⅠa a組</a></td>
<td>月4</td><td>野間 香与子</td><td>24</td>
<td>50.0</td><td>50.0</td><td>0.0</td><td>0.0</td><td>0.0</td>
</tr>
</tbody>
</table></div></div>
</body></html>`;

const DIALOG_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h2>シラバス照会</h2>
<div id="pkx02301:dialog">
  <div class="print"><span class="btnNewLocation1"></span></div>
  <div id="pkx02301:ch:table">
    <div class="rowStyle rowMargin">
      <div class="ui-widget-header colStyle colBorder">科目授業名称（和文）　　Name of the subject/class (in Japanese)</div>
      <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">テスト科目</div></div>
    </div>
    <div class="rowStyle rowMargin">
      <div class="ui-widget-header colStyle colBorder">授業コード　　Class code</div>
      <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">9943115</div></div>
    </div>
    <div class="rowStyle rowMargin">
      <div class="ui-widget-header colStyle colBorder">概要　　Description</div>
      <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">テスト概要文</div></div>
    </div>
  </div>
</div>
</body></html>`;

const parserCode = fs.readFileSync(path.join(__dirname, "content", "parser.js"), "utf-8");
const contentCode = fs.readFileSync(path.join(__dirname, "content", "content.js"), "utf-8");

async function loadEnv(html, url, store) {
  const dom = new JSDOM(html, { url });
  const { window } = dom;
  const { document } = window;
  global.window = window;
  global.document = document;
  global.location = window.location;
  global.MutationObserver = window.MutationObserver;
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
  (0, eval)(contentCode + "\n//# sourceURL=content.js");
  const fireChanged = (changes, area) =>
    changeListeners.forEach((fn) => fn(changes, area || "local"));
  return { window, document, store, fireChanged };
}

async function waitFor(fn, timeoutMs, label, document) {
  const start = Date.now();
  for (;;) {
    let v = null;
    try { v = fn(); } catch (e) { /* retry */ }
    if (v) return v;
    if (Date.now() - start > timeoutMs) {
      throw new Error("タイムアウト: " + label);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

function rowButtons(document, code) {
  const rows = document.querySelectorAll("#funcForm\\:table_data tr[data-ri]");
  for (const tr of rows) {
    if (tr.textContent.includes(code)) return Array.from(tr.querySelectorAll("button"));
  }
  return [];
}

async function main() {
  // ---- A: シラバス一覧（成績側のみ既存）→ 注意のみ、ボタン無し ----
  {
    const store = {
      courses: {
        "99KT101": {
          classCode: "99KT101", nameJa: "生命科学入門",
          publicGrades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100 },
          sources: ["grade"]
        }
      }
    };
    const { document } = await loadEnv(SYLLABUS_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    const note = await waitFor(
      () => document.querySelector("span.tce-mini-note"), 5000, "A:注意表示", document);
    console.assert(note.textContent === "成績分布側ですでに追加されています",
      "A:文言: " + note.textContent);
    console.assert(rowButtons(document, "99KT101").length === 0, "A:ボタン無し");
    console.log("✓ A: シラバス一覧の注意表示 通過");
  }

  // ---- B: 成績一覧（シラバス側のみ既存）→ 注意＋リンク、追加ボタン無し ----
  {
    const store = {
      courses: {
        "9943115": {
          classCode: "9943115", nameJa: "Listening & SpeakingⅠa a組",
          addedVia: "syllabus", summary: "概要文", sources: ["syllabus"]
        }
      }
    };
    const { document } = await loadEnv(GRADE_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/xu/xut107/Xut10701.xhtml", store);
    const note = await waitFor(
      () => document.querySelector("span.tce-mini-note"), 5000, "B:注意表示", document);
    console.assert(note.textContent === "シラバス側ですでに追加されています",
      "B:文言: " + note.textContent);
    const btns = rowButtons(document, "9943115");
    console.assert(btns.length === 1 && btns[0].textContent === "成績をリンク",
      "B:リンクのみ: " + btns.map((b) => b.textContent).join(","));
    console.log("✓ B: 成績一覧の注意＋リンク 通過");
  }

  // ---- C: ピッカーで保存済みをクリック→即時リンク＋注意消去 ----
  {
    const store = {
      courses: {
        "9943115": {
          classCode: "9943115", nameJa: "Listening & SpeakingⅠa a組",
          addedVia: "syllabus", sources: ["syllabus"]
        }
      }
    };
    const { window, document } = await loadEnv(GRADE_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/xu/xut107/Xut10701.xhtml", store);
    const linkBtn = await waitFor(
      () => document.querySelector("#funcForm\\:table_data button.tce-link"),
      5000, "C:リンクボタン", document);
    linkBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const li = await waitFor(
      () => document.querySelector("#tce-picker li"), 5000, "C:ピッカー候補", document);
    li.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await waitFor(() => {
      const gl = store.gradeLinks || {};
      return gl["9943115"] && linkBtn.textContent === "成績リンク済" &&
        !document.getElementById("tce-picker") &&
        !document.querySelector("span.tce-mini-note") ? true : null;
    }, 5000, "C:即時リンク＋注意消去", document);
    console.log("✓ C: ピッカー即時リンク 通過");
  }

  // ---- D: 未保存のみ→リンクボタン無し・追加ボタンのみ ----
  {
    const store = {};
    const { document } = await loadEnv(GRADE_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/xu/xut107/Xut10701.xhtml", store);
    await waitFor(
      () => document.querySelector("#funcForm\\:table_data button.tce-grade-add"),
      5000, "D:成績追加ボタン", document);
    console.assert(!document.querySelector("#funcForm\\:table_data button.tce-link"),
      "D:リンクボタン無し");
    console.log("✓ D: 未保存は追加ボタンのみ 通過");
  }

  // ---- E: ダイアログの追加ボタンは1つのみ（再発火でも重複しない） ----
  {
    const store = {
      courses: {
        "9943115": {
          classCode: "9943115", nameJa: "テスト科目",
          addedVia: "syllabus", sources: ["syllabus"]
        }
      }
    };
    const { document } = await loadEnv(DIALOG_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    const btn = await waitFor(
      () => document.querySelector("button.tce-syllabus-action"), 5000, "E:ダイアログボタン", document);
    console.assert(btn.textContent === "+ 追加", "E:ボタン文言: " + btn.textContent);
    // わざとDOM変化を起こしてObserverを再発火させる
    document.body.appendChild(document.createElement("div"));
    document.body.appendChild(document.createElement("div"));
    await new Promise((r) => setTimeout(r, 500));
    const btns = document.querySelectorAll("button.tce-syllabus-action");
    console.assert(btns.length === 1, "E:重複なし: " + btns.length);
    console.assert(btns[0].disabled && /追加済み/.test(btns[0].textContent),
      "E:保存済み反映: " + btns[0].textContent);
    console.log("✓ E: ダイアログ単一ボタン 通過");
  }

  // ---- F: 両側済みは注意無し ----
  {
    const store = {
      courses: {
        "9943115": {
          classCode: "9943115", nameJa: "Listening & SpeakingⅠa a組",
          addedVia: "syllabus", sources: ["grade", "syllabus"]
        }
      }
    };
    const { document } = await loadEnv(GRADE_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/xu/xut107/Xut10701.xhtml", store);
    await waitFor(
      () => document.querySelector("#funcForm\\:table_data button.tce-link"),
      5000, "F:リンクボタン", document);
    await new Promise((r) => setTimeout(r, 400));
    console.assert(document.querySelector("span.tce-mini-note") === null, "F:注意なし");
    console.log("✓ F: 両側済み 通過");
  }

  // ---- G: 後からstorage追加→onChangedで注意表示 ----
  {
    const store = { courses: {} };
    const { document, fireChanged } = await loadEnv(SYLLABUS_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    await waitFor(() => document.querySelector("#funcForm\\:table_data tr[data-ri]"),
      5000, "G:行描画", document);
    await new Promise((r) => setTimeout(r, 400));
    console.assert(document.querySelector("span.tce-mini-note") === null, "G:初期は注意なし");
    store.courses["99KT101"] = {
      classCode: "99KT101", nameJa: "生命科学入門",
      publicGrades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100 },
      sources: ["grade"]
    };
    fireChanged({ courses: {} }, "local");
    const note = await waitFor(
      () => document.querySelector("span.tce-mini-note"), 5000, "G:storage連動", document);
    console.assert(note.textContent === "成績分布側ですでに追加されています",
      "G:文言: " + note.textContent);
    console.log("✓ G: storage変更で注意表示 通過");
  }

  // ---- H: ダイアログ内で成績側のみ既存→詳細追加ボタン＋注意書き ----
  {
    const store = {
      courses: {
        "9943115": {
          classCode: "9943115", nameJa: "テスト科目",
          publicGrades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
          sources: ["grade"]
        }
      }
    };
    const { document } = await loadEnv(DIALOG_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    const btn = await waitFor(
      () => document.querySelector("button.tce-syllabus-action"), 5000, "H:ダイアログボタン", document);
    const note = await waitFor(
      () => document.querySelector("#pkx02301\\:dialog span.tce-mini-note"),
      5000, "H:ダイアログ内注意", document);
    console.assert(!btn.disabled, "H:追加ボタン有効化");
    console.assert(note && note.textContent === "成績分布側ですでに追加されています",
      "H:ダイアログ内注意: " + (note && note.textContent));
    console.assert(document.querySelectorAll("button.tce-syllabus-action").length === 1,
      "H:ボタン単一");
    console.log("✓ H: ダイアログ内注意書き 通過");
  }

  // ---- I: 成績ページのダイアログには追加ボタンを出さない ----
  {
    const store = { courses: {} };
    const GRADE_DIALOG_HTML = DIALOG_HTML.replace("<h2>シラバス照会</h2>", "<h2>成績評価公開授業照会</h2>");
    const { document } = await loadEnv(GRADE_DIALOG_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/xu/xut107/Xut10701.xhtml", store);
    // content script の初期化が走るのを待つ（ダイアログ監視が動けば十分な時間）
    await new Promise((r) => setTimeout(r, 800));
    // ダイアログ検出のダミー変化を起こして再発火させても出ないこと
    document.body.appendChild(document.createElement("div"));
    await new Promise((r) => setTimeout(r, 500));
    console.assert(document.querySelectorAll("button.tce-syllabus-action").length === 0,
      "I:成績ページのダイアログはボタン無し");
    console.log("✓ I: 成績ページのダイアログ抑制 通過");
  }

  // ---- J: 未保存行は「＋成績追加」→ pinned 保存 ----
  {
    const store = { courses: {} };
    const { window, document } = await loadEnv(GRADE_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/xu/xut107/Xut10701.xhtml", store);
    const addBtn = await waitFor(
      () => document.querySelector("#funcForm\\:table_data button.tce-grade-add"),
      5000, "J:成績追加ボタン", document);
    console.assert(addBtn.textContent === "＋成績追加", "J:文言: " + addBtn.textContent);
    addBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await waitFor(() => {
      const r = (store.gradeRows || {})["9943115"];
      return r && r.pinned === true ? true : null;
    }, 5000, "J:pinned保存", document);
    // ボタンは作り直されるためDOMから取り直す
    await waitFor(() => {
      const b = document.querySelector("#funcForm\\:table_data button.tce-added");
      return b && b.disabled && b.textContent === "成績保存済み" ? true : null;
    }, 5000, "J:保存済み表示", document);
    // シラバス比較（courses）には追加されていないこと
    console.assert(!((store.courses || {})["9943115"]), "J:coursesには追加しない");
    console.log("✓ J: 成績追加のみ保存 通過");
  }

  // ---- K: pinned後に授業保存→リンクボタンに切り替わる ----
  {
    const store = {
      gradeRows: {
        "9943115": {
          classCode: "9943115", nameJa: "Listening & SpeakingⅠa a組",
          grades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
          score: 4.5, pinned: true, pinnedAt: 1, scrapedAt: 1
        }
      }
    };
    const { document, fireChanged } = await loadEnv(GRADE_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/xu/xut107/Xut10701.xhtml", store);
    await waitFor(() => {
      const b = document.querySelector("#funcForm\\:table_data button.tce-added");
      return b && b.disabled && b.textContent === "成績保存済み" ? b : null;
    }, 5000, "K:初期は保存済み表示", document);
    // シラバス詳細から追加された想定
    store.courses = {
      "9943115": {
        classCode: "9943115", nameJa: "Listening & SpeakingⅠa a組",
        addedVia: "syllabus", summary: "概要", sources: ["syllabus"]
      }
    };
    fireChanged({ courses: {} }, "local");
    const linkBtn = await waitFor(() => {
      const b = document.querySelector("#funcForm\\:table_data button.tce-link");
      return b && b.textContent === "成績をリンク" ? b : null;
    }, 5000, "K:リンクボタンに切替", document);
    console.assert(!document.querySelector("#funcForm\\:table_data button.tce-grade-add"),
      "K:追加ボタン消去");
    console.assert(linkBtn, "K:リンクボタン存在");
    console.log("✓ K: 保存後にリンクボタンへ切替 通過");
  }

  // ---- L: 授業なし・pinned成績のみ → シラバス一覧に注意表示 ----
  {
    const store = {
      gradeRows: {
        "99KT101": {
          classCode: "99KT101", nameJa: "生命科学入門",
          grades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100 },
          score: 2.6, pinned: true, pinnedAt: 1, scrapedAt: 1
        }
      }
    };
    const { document, fireChanged } = await loadEnv(SYLLABUS_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    const note = await waitFor(
      () => document.querySelector("span.tce-mini-note"), 5000, "L:注意表示", document);
    console.assert(note.textContent === "成績分布側ですでに追加されています",
      "L:文言: " + note.textContent);
    console.assert(rowButtons(document, "99KT101").length === 0, "L:ボタン無し");
    console.log("✓ L: pinnedのみでも注意表示 通過");

    // ---- M: 後からシラバス側が揃うと注意が消える ----
    store.courses = {
      "99KT101": {
        classCode: "99KT101", nameJa: "生命科学入門",
        addedVia: "syllabus", summary: "概要", sources: ["syllabus"]
      }
    };
    fireChanged({ courses: {} }, "local");
    await waitFor(() => !document.querySelector("span.tce-mini-note"),
      5000, "M:注意消去", document);
    console.log("✓ M: 完全化で注意消去 通過");
  }

  // ---- N: 一覧の注意書きは文字のみ（クリックしても何も起きない） ----
  {
    const store = {
      gradeRows: {
        "99KT101": {
          classCode: "99KT101", nameJa: "生命科学入門",
          grades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100 },
          score: 2.6, pinned: true, pinnedAt: 1, scrapedAt: 1
        }
      }
    };
    const { window, document } = await loadEnv(SYLLABUS_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    const note = await waitFor(
      () => document.querySelector("span.tce-mini-note"), 5000, "N:注意表示", document);
    console.assert(note.textContent === "成績分布側ですでに追加されています",
      "N:文言: " + note.textContent);
    console.assert(!note.classList.contains("tce-clickable"), "N:クリック不可");
    note.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));
    console.assert(!document.getElementById("tce-picker"), "N:モーダルが出ない");
    // 授業は作られない（シラバス比較に混ざらない）
    console.assert(!(store.courses || {})["99KT101"], "N:授業未作成");
    console.log("✓ N: 一覧注意書きは文字のみ 通過");
  }

  // ---- P: legacy成績のみ授業の注意書きも文字のみ ----
  {
    const store = {
      courses: {
        "99KT101": {
          classCode: "99KT101", nameJa: "生命科学入門（旧）",
          publicGrades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100 },
          sources: ["grade"]
        }
      }
    };
    const { window, document } = await loadEnv(SYLLABUS_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    const note = await waitFor(
      () => document.querySelector("span.tce-mini-note"), 5000, "P:注意表示", document);
    console.assert(note.textContent === "成績分布側ですでに追加されています",
      "P:文言: " + note.textContent);
    console.assert(!note.classList.contains("tce-clickable"), "P:クリック不可");
    note.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));
    console.assert(!document.getElementById("tce-picker"), "P:モーダルが出ない");
    console.log("✓ P: legacy注意書きも文字のみ 通過");
  }

  // ---- Q1: 未追加＋pinnedあり→「＋比較に追加」一発で詳細保存＋リンク＋追加済み ----
  {
    const store = {
      gradeRows: {
        "9943115": {
          classCode: "9943115", nameJa: "テスト科目",
          grades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
          score: 4.5, pinned: true, pinnedAt: 1, scrapedAt: 1
        }
      }
    };
    const { window, document } = await loadEnv(DIALOG_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    // 一致（未接続pinnedあり）なのでリンクボタンも出る
    await waitFor(
      () => document.querySelector("button.tce-syllabus-action"), 5000, "Q1:追加ボタン", document);
    const linkBtnQ1 = await waitFor(
      () => document.querySelector("button.tce-dialog-link"), 5000, "Q1:リンクボタン", document);
    console.assert(linkBtnQ1 && linkBtnQ1.textContent === "成績をリンク", "Q1:リンクボタン併存");
    console.assert(!document.getElementById("tce-picker"), "Q1:モーダル無し");
    const addBtn = document.querySelector("button.tce-syllabus-action");
    console.assert(addBtn && !addBtn.disabled && addBtn.textContent === "+ 追加",
      "Q1:追加ボタン通常表示: " + (addBtn && addBtn.textContent));
    addBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await waitFor(() => {
      const gl = store.gradeLinks || {};
      const c = (store.courses || {})["9943115"];
      return gl["9943115"] && gl["9943115"].sourceRow &&
        gl["9943115"].sourceRow.classCode === "9943115" &&
        c && (c.sources || []).includes("syllabus") &&
        (c.sources || []).includes("grade") &&
        c.publicGrades && c.publicGrades.s === 50 ? true : null;
    }, 5000, "Q1:詳細保存＋リンク", document);
    await waitFor(() => {
      const b = document.querySelector("button.tce-syllabus-action");
      return b && b.disabled && /追加済み/.test(b.textContent) ? true : null;
    }, 5000, "Q1:追加済み表示", document);
    // 両側完了したので注意書きは消える
    console.assert(!document.querySelector("#pkx02301\\:dialog span.tce-mini-note"), "Q1:注意書き消去");
    console.log("✓ Q1: 追加一発で詳細＋リンク 通過");
  }

  // ---- Q2: 成績のみ既存（994347W相当）＋pinnedあり→「＋詳細を追加」一発で完了 ----
  {
    const store = {
      courses: {
        "9943115": {
          classCode: "9943115", nameJa: "テスト科目",
          publicGrades: { s: 10, a: 20, b: 30, c: 25, d: 15, count: 100 },
          sources: ["grade"]
        }
      },
      gradeRows: {
        "9943115": {
          classCode: "9943115", nameJa: "テスト科目",
          grades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
          score: 4.5, pinned: true, pinnedAt: 1, scrapedAt: 1
        }
      }
    };
    const { window, document } = await loadEnv(DIALOG_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    const addBtn = await waitFor(() => {
      const b = document.querySelector("button.tce-syllabus-action");
      return b && !b.disabled && b.textContent === "+ 追加" ? b : null;
    }, 5000, "Q2:追加ボタン", document);
    const linkBtnQ2 = await waitFor(
      () => document.querySelector("button.tce-dialog-link"), 5000, "Q2:リンクボタン", document);
    console.assert(linkBtnQ2, "Q2:リンクボタン併存");
    addBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await waitFor(() => {
      const gl = store.gradeLinks || {};
      const c = (store.courses || {})["9943115"];
      return gl["9943115"] && gl["9943115"].sourceRow &&
        gl["9943115"].sourceRow.classCode === "9943115" &&
        c && (c.sources || []).includes("syllabus") &&
        c.publicGrades && c.publicGrades.s === 50 ? true : null;
    }, 5000, "Q2:詳細保存＋リンク上書き", document);
    await waitFor(() => {
      const b = document.querySelector("button.tce-syllabus-action");
      return b && b.disabled && /追加済み/.test(b.textContent) ? true : null;
    }, 5000, "Q2:追加済み表示", document);
    console.assert(!document.querySelector("#pkx02301\\:dialog span.tce-mini-note"), "Q2:注意書き消去");
    console.log("✓ Q2: 詳細追加一発で完了 通過");
  }

  // ---- Q3: リンクボタン→候補モーダル→選択で詳細保存＋リンク ----
  {
    const store = {
      gradeRows: {
        "9943115": {
          classCode: "9943115", nameJa: "テスト科目",
          grades: { s: 50, a: 50, b: 0, c: 0, d: 0, count: 24 },
          score: 4.5, pinned: true, pinnedAt: 1, scrapedAt: 1
        }
      }
    };
    const { window, document, fireChanged } = await loadEnv(DIALOG_HTML,
      "https://class.admin.tus.ac.jp/uprx/up/km/kmh006/Kmh00601.xhtml", store);
    const linkBtn = await waitFor(
      () => document.querySelector("button.tce-dialog-link"), 5000, "Q3:リンクボタン", document);
    console.assert(linkBtn.textContent === "成績をリンク", "Q3:文言: " + linkBtn.textContent);
    linkBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    const candBtn = await waitFor(() => {
      const lis = document.querySelectorAll("#tce-picker li");
      for (const li of lis) {
        const b = li.querySelector("button");
        if (b && b.textContent === "リンク") return b;
      }
      return null;
    }, 5000, "Q3:候補モーダル", document);
    const modalText = document.getElementById("tce-picker").textContent;
    console.assert(/S:50%/.test(modalText) && /スコア 4.50/.test(modalText),
      "Q3:分布・スコア表示: " + modalText.slice(0, 120));
    candBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await waitFor(() => {
      const gl = store.gradeLinks || {};
      const c = (store.courses || {})["9943115"];
      return gl["9943115"] && gl["9943115"].sourceRow &&
        gl["9943115"].sourceRow.classCode === "9943115" &&
        c && (c.sources || []).includes("syllabus") &&
        (c.sources || []).includes("grade") &&
        c.publicGrades && c.publicGrades.s === 50 &&
        c.summary === "テスト概要文" && !document.getElementById("tce-picker") ? true : null;
    }, 5000, "Q3:詳細保存＋リンク", document);
    // storage連動でダイアログが最新化：追加済み・注意消去・リンクボタン消去
    fireChanged({ courses: {}, gradeRows: {}, gradeLinks: {} }, "local");
    await waitFor(() => {
      const b = document.querySelector("button.tce-syllabus-action");
      return b && b.disabled && /追加済み/.test(b.textContent) ? true : null;
    }, 5000, "Q3:追加済み表示", document);
    await waitFor(() => !document.querySelector("button.tce-dialog-link"),
      5000, "Q3:リンクボタン消去", document);
    console.assert(!document.querySelector("#pkx02301\\:dialog span.tce-mini-note"), "Q3:注意書き消去");
    console.log("✓ Q3: リンク経由で詳細＋リンク 通過");
  }

  console.log("LIST POLICY TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
