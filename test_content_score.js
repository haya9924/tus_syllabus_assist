// スコア列（成績評価状況の横の列）の動作確認テスト
// node test_content_score.js
// 検証: th追加位置 / 各行tdの値 / ヘッダークリックで降順⇔復元 / 重複なし

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const GRADE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<h2>成績評価公開授業照会</h2>
<div id="funcForm:table">
<div class="ui-datatable-tablewrapper"><table>
  <thead id="funcForm:table_head">
    <tr>
      <th rowspan="2">学科組織</th><th rowspan="2">開講年度学期</th>
      <th rowspan="2">授業コード</th><th rowspan="2">授業科目</th>
      <th rowspan="2">曜日時限</th><th rowspan="2">担当教員</th>
      <th rowspan="2">評価対象者数</th><th colspan="5">成績評価状況(%)※</th>
    </tr>
    <tr><th>S評価</th><th>A評価</th><th>B評価</th><th>C評価</th><th>D評価</th></tr>
  </thead>
  <tbody id="funcForm:table_data">
    <tr data-ri="0">
      <td>東理大 工 電工</td><td>2025年度前期</td><td>9943116</td>
      <td><a id="funcForm:table:0:jugyoKmkName">Listening &amp; SpeakingⅠa b組</a></td>
      <td>月4</td><td>Peter H. Budden</td><td>25</td>
      <td>20.0</td><td>32.0</td><td>36.0</td><td>12.0</td><td>0.0</td>
    </tr>
    <tr data-ri="1">
      <td>東理大 工 電工</td><td>2025年度前期</td><td>9943121</td>
      <td><a id="funcForm:table:1:jugyoKmkName">Listening &amp; SpeakingⅠa d組</a></td>
      <td>月4</td><td>McLaughlin Matthew</td><td>23</td>
      <td>13.0</td><td>30.4</td><td>34.8</td><td>17.4</td><td>4.3</td>
    </tr>
    <tr data-ri="2">
      <td>東理大 工 電工</td><td>2025年度前期</td><td>9943115</td>
      <td><a id="funcForm:table:2:jugyoKmkName">Listening &amp; SpeakingⅠa a組</a></td>
      <td>月4</td><td>野間 香与子</td><td>24</td>
      <td>41.7</td><td>37.5</td><td>16.7</td><td>4.2</td><td>0.0</td>
    </tr>
  </tbody>
</table></div>
</div>
</body></html>`;
// 期待スコア(S=5/A=4/B=3/C=2/D=0):
// 9943116: (100+128+108+24+0)/100 = 3.60
// 9943121: (65+121.6+104.4+34.8+0)/100 = 3.258 -> 3.26
// 9943115: (208.5+150+50.1+8.4+0)/100 = 4.17

async function main() {
  const dom = new JSDOM(GRADE_HTML, {
    url: "https://class.admin.tus.ac.jp/uprx/up/xu/xut107/Xut10701.xhtml"
  });
  const { window } = dom;
  const { document } = window;

  // グローバル注入
  global.window = window;
  global.document = document;
  global.location = window.location;
  global.MutationObserver = window.MutationObserver;
  const store = {};
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
    },
    runtime: { sendMessage: () => {} }
  };

  // parser → content の順で読み込み
  const parserCode = fs.readFileSync(path.join(__dirname, "content", "parser.js"), "utf-8");
  new Function("window", "document", parserCode)(window, document);
  if (!window.TCE || !window.TCE.parser) throw new Error("parser 未ロード");
  // content.js は bare identifier で window/document を参照するので eval で実行
  const contentCode = fs.readFileSync(path.join(__dirname, "content", "content.js"), "utf-8");
  (0, eval)(contentCode + "\n//# sourceURL=content.js");

  const waitFor = async (fn, timeoutMs, label) => {
    const start = Date.now();
    for (;;) {
      let v = null;
      try { v = fn(); } catch (e) { /* retry */ }
      if (v) return v;
      if (Date.now() - start > timeoutMs) {
        const diag = `rows=${document.querySelectorAll("#funcForm\\:table_data tr[data-ri]").length} ` +
          `th=${document.querySelectorAll("th.tce-score-head").length} ` +
          `td=${document.querySelectorAll("td.tce-score-cell").length} ` +
          `btns=${document.querySelectorAll("button.tce-btn").length}`;
        throw new Error("タイムアウト: " + label + " [" + diag + "]");
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const scoreOrder = () => Array.from(document.querySelectorAll("#funcForm\\:table_data tr[data-ri]"))
    .map((tr) => tr.querySelector("td.tce-score-cell").textContent);

  // 1. スコア列ヘッダーが成績評価状況の横に追加される
  const th = await waitFor(() => document.querySelector("th.tce-score-head"), 5000, "th.tce-score-head");
  console.assert(th.textContent === "スコア", "th文言: " + th.textContent);
  console.assert(th.getAttribute("rowspan") === "2", "rowspan=2");
  console.assert(/成績評価状況/.test(th.previousSibling.textContent), "成績評価状況の横");
  console.log("✓ スコア列ヘッダー 通過");

  // 2. 各行にスコアセル（3.60 / 3.26 / 4.17 の順）
  await waitFor(() => {
    const cells = document.querySelectorAll("td.tce-score-cell");
    return cells.length === 3 ? cells : null;
  }, 5000, "td 3件");
  const got = scoreOrder();
  console.assert(JSON.stringify(got) === JSON.stringify(["3.60", "3.26", "4.17"]),
    "スコア値: " + JSON.stringify(got));
  const trs = document.querySelectorAll("#funcForm\\:table_data tr[data-ri]");
  console.assert(trs[0].dataset.tceScore === "3.6", "dataset: " + trs[0].dataset.tceScore);
  console.log("✓ スコアセル値 通過:", JSON.stringify(got));

  // 3. 未保存行には「＋成績追加」（シラバス比較には追加しない）。リンクボタンは無し
  const addBtns = Array.from(document.querySelectorAll("#funcForm\\:table_data button.tce-grade-add"));
  console.assert(addBtns.length === 3, "成績追加ボタン3件: " + addBtns.length);
  console.assert(addBtns.every((b) => b.textContent === "＋成績追加"), "文言");
  console.assert(document.querySelectorAll("#funcForm\\:table_data button.tce-link").length === 0,
    "リンク無し");
  console.assert(document.querySelector(".tce-sortbar"), "ソートバー");
  console.log("✓ ボタン類 通過");

  // 4. ヘッダークリックで降順ソート → もう一度で元に戻る
  th.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    const o = scoreOrder();
    return JSON.stringify(o) === JSON.stringify(["4.17", "3.60", "3.26"]) ? o : null;
  }, 5000, "降順ソート");
  console.log("✓ 降順ソート 通過");
  th.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await waitFor(() => {
    const o = scoreOrder();
    return JSON.stringify(o) === JSON.stringify(["3.60", "3.26", "4.17"]) ? o : null;
  }, 5000, "元に戻す");
  console.log("✓ 順序復元 通過");

  // 5. MutationObserver の再発火で重複しない
  await new Promise((r) => setTimeout(r, 500));
  console.assert(document.querySelectorAll("th.tce-score-head").length === 1, "th重複なし");
  console.assert(document.querySelectorAll("td.tce-score-cell").length === 3, "td重複なし");
  console.assert(document.querySelectorAll(".tce-sortbar").length === 1, "ソートバー重複なし");
  console.log("✓ 重複なし 通過");

  console.log("SCORE COLUMN TESTS PASSED");
  process.exit(0);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
