// パーサー動作確認用テスト
// node test_parser.js

// DOM: jsdom を使う
let jsdom;
try { jsdom = require("jsdom"); }
catch (e) { console.error("jsdom が無い"); process.exit(1); }

const fs = require("fs");
const path = require("path");

// テスト対象: parser.js は (function(global){...})(this) 形式
const code = fs.readFileSync(path.join(__dirname, "content", "parser.js"), "utf-8");

// ダミーシラバスHTML
const SAMPLE_HTML = `<!DOCTYPE html><html><body>
<div id="pkx02301:ch:table">
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder" style="width:22%; text-align:left;">科目授業名称（和文）　Name of the subject/class (in Japanese)</div>
    <div class="ui-widget-content colStyle colBorder" style="width:78%; text-align:left;"><div class="fr-box fr-view">Listening &amp; SpeakingⅠa a組</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder" style="width:22%; text-align:left;">科目授業名称（英文）　Name of the subject/class (in English)</div>
    <div class="ui-widget-content colStyle colBorder" style="width:78%; text-align:left;"><div class="fr-box fr-view">Listening &amp; SpeakingⅠa</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder" style="width:22%; text-align:left;">授業コード　Class code</div>
    <div class="ui-widget-content colStyle colBorder" style="width:28%; text-align:left;"><div class="fr-box fr-view">9943115</div></div>
    <div class="ui-widget-header colStyle colBorder" style="width:22%; text-align:left;">科目番号　Course number</div>
    <div class="ui-widget-content colStyle colBorder" style="width:28%; text-align:left;"><div class="fr-box fr-view">L3FLENG101</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder" style="width:22%; text-align:left;">曜日時限</div>
    <div class="ui-widget-content colStyle colBorder" style="width:78%; text-align:left;"><div class="fr-box fr-view">月曜4限</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder" style="width:22%; text-align:left;">単位数　Course credit</div>
    <div class="ui-widget-content colStyle colBorder" style="width:28%; text-align:left;"><div class="fr-box fr-view">1.0単位</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder" style="width:22%; text-align:left;">概要　Description</div>
    <div class="ui-widget-content colStyle colBorder" style="width:78%; text-align:left;"><div class="fr-box fr-view">This class is designed to help students acquire academic listening and speaking skills.</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder" style="width:22%; text-align:left;">備考　Remarks</div>
    <div class="ui-widget-content colStyle colBorder" style="width:78%; text-align:left;"><div class="fr-box fr-view">出席は重要です。</div></div>
  </div>
</div>
<table id="funcForm:table">
  <tbody id="funcForm:table_data">
    <tr data-ri="0">
      <td class="colSize8">東理大 工 電工</td>
      <td class="colSize5"><div>2025年度前期</div></td>
      <td class="colSize3">9943115</td>
      <td class="colSize10"><a id="funcForm:table:0:jugyoKmkName">Listening &amp; SpeakingⅠa a組</a></td>
      <td class="colSize3">月4</td>
      <td class="colSize8">野間 香与子</td>
      <td class="colSize4">24</td>
      <td class="colSize2">41.7</td>
      <td class="colSize2">37.5</td>
      <td class="colSize2">16.7</td>
      <td class="colSize2">4.2</td>
      <td class="colSize2">0.0</td>
    </tr>
  </tbody>
</table>
</body></html>`;

const dom = new jsdom.JSDOM(SAMPLE_HTML);
const window = dom.window;
const document = window.document;
// global として window/document を渡して parser.js を実行
new Function("window", "document", code)(window, document);

const P = window.TCE && window.TCE.parser;
if (!P) { console.error("parser API が見つからない"); process.exit(1); }

// --- 日付パース ---
const dp1 = P.parseDayPeriod("月4");
console.assert(dp1.length === 1 && dp1[0].day === "月" && dp1[0].period === 4, "月4 失敗: " + JSON.stringify(dp1));
const dp2 = P.parseDayPeriod("火4 金1");
console.assert(dp2.length === 2 && dp2[1].day === "金" && dp2[1].period === 1, "火4 金1 失敗: " + JSON.stringify(dp2));
const dp3 = P.parseDayPeriod("水1 金1");
console.assert(dp3.length === 2 && dp3[0].day === "水" && dp3[1].day === "金", "水1 金1 失敗");
const dp4 = P.parseDayPeriod("集中講義など");
console.assert(dp4.length === 0, "集中講義 失敗: " + JSON.stringify(dp4));
const dp5 = P.parseDayPeriod("月曜4限");
console.assert(dp5.length === 1 && dp5[0].day === "月" && dp5[0].period === 4, "月曜4限 失敗: " + JSON.stringify(dp5));
const dp6 = P.parseDayPeriod("火曜1限 水曜5限");
console.assert(dp6.length === 2 && dp6[1].day === "水" && dp6[1].period === 5, "火曜1限 水曜5限 失敗: " + JSON.stringify(dp6));
console.log("✓ parseDayPeriod 通過");

// --- 年度学期 ---
const ys1 = P.parseYearSemester("2025年度前期");
console.assert(ys1.year === "2025" && ys1.semester === "前期", "2025年度前期: " + JSON.stringify(ys1));
console.log("✓ parseYearSemester 通過");

// --- パーセント ---
console.assert(P.parsePercent("41.7") === 41.7, "41.7");
console.assert(P.parsePercent("0.0") === 0, "0.0");
console.assert(P.parsePercent("24") === 24, "24");
console.log("✓ parsePercent 通過");

// --- 単位数 ---
console.assert(P.parseCredits("1.0単位") === 1.0, "1.0単位: " + P.parseCredits("1.0単位"));
console.assert(P.parseCredits("2.0単位") === 2.0, "2.0単位");
console.assert(P.parseCredits("2単位") === 2, "2単位");
console.assert(P.parseCredits("3 単位") === 3, "3 単位");
console.assert(P.parseCredits("1.5単位") === 1.5, "1.5単位");
console.assert(P.parseCredits(null) === null, "null");
console.assert(P.parseCredits("") === null, "空");
console.assert(P.parseCredits("-") === null, "-");
console.log("✓ parseCredits 通過");

// --- normalizeLabel / splitHeader（ASCII混じり和文ラベル対策） ---
console.assert(P.normalizeLabel("概要　Description") === "概要", "概要");
console.assert(P.normalizeLabel("科目授業名称（和文）　Name of the subject/class (in Japanese)") === "科目授業名称（和文）", "長いラベル");
console.assert(P.normalizeLabel("曜日時限") === "曜日時限", "曜日時限");
const sp1 = P.splitHeader("教科書の使用有無（有=Y , 無=N）　Textbook used(Y for yes, N for no)");
console.assert(sp1.ja === "教科書の使用有無（有=Y , 無=N）", "教科書使用有無ja: " + JSON.stringify(sp1));
console.assert(/Textbook used/.test(sp1.en), "教科書使用有無en: " + JSON.stringify(sp1));
const sp2 = P.splitHeader("MyKiTSのURL（教科書販売サイト）　URL for MyKiTS(textbook sales site)");
console.assert(sp2.ja === "MyKiTSのURL（教科書販売サイト）", "MyKiTS ja: " + JSON.stringify(sp2));
const sp3 = P.splitHeader("授業でのBYOD PCの利用有無　Whether or not students may use BYOD PCs in class");
console.assert(sp3.ja === "授業でのBYOD PCの利用有無", "BYOD ja: " + JSON.stringify(sp3));
const sp4 = P.splitHeader("Class hours");
console.assert(sp4.ja === "Class hours" && sp4.en === "Class hours", "Class hours: " + JSON.stringify(sp4));
console.log("✓ splitHeader/normalizeLabel 通過");

// --- シラバス詳細の難ラベル行 ---
const TRICKY_HTML = `<!DOCTYPE html><html><body>
<div id="pkx02301:ch:table">
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder">授業コード　Class code</div>
    <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">9943119</div></div>
    <div class="ui-widget-header colStyle colBorder">科目番号　Course number</div>
    <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">L3FLENG102</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder">教科書の使用有無（有=Y , 無=N）　Textbook used(Y for yes, N for no)</div>
    <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">Y</div></div>
    <div class="ui-widget-header colStyle colBorder">書誌情報　Bibliographic information</div>
    <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">Reflect 3</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder">MyKiTSのURL（教科書販売サイト）　URL for MyKiTS(textbook sales site)</div>
    <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">https://example.invalid/</div></div>
  </div>
  <div class="rowStyle rowMargin">
    <div class="ui-widget-header colStyle colBorder">授業でのBYOD PCの利用有無　Whether or not students may use BYOD PCs in class</div>
    <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">N</div></div>
    <div class="ui-widget-header colStyle colBorder">授業での仮想PCの利用有無　Whether or not students may use a virtual PC in class</div>
    <div class="ui-widget-content colStyle colBorder"><div class="fr-box fr-view">N</div></div>
  </div>
</div>
</body></html>`;
const dom2 = new jsdom.JSDOM(TRICKY_HTML);
const doc2 = dom2.window.document;
const tricky = P.parseSyllabusTable(doc2.querySelector("#pkx02301\\:ch\\:table"));
console.assert(tricky.classCode === "9943119", "tricky classCode: " + tricky.classCode);
console.assert(tricky.courseNumber === "L3FLENG102", "tricky courseNumber: " + tricky.courseNumber);
console.assert(tricky.textbookUsed === "Y", "tricky textbookUsed: " + tricky.textbookUsed);
console.assert(tricky.textbookInfo === "Reflect 3", "tricky textbookInfo: " + tricky.textbookInfo);
console.assert(tricky.mykitsUrl === "https://example.invalid/", "tricky mykits: " + tricky.mykitsUrl);
console.assert(tricky.byodPc === "N", "tricky byod: " + tricky.byodPc);
console.assert(tricky.virtualPc === "N", "tricky virtualPc: " + tricky.virtualPc);
console.log("✓ 難ラベル行パース 通過");

// --- シラバス検索（Kmh006想定）の汎用行パース ---
const SYL_HTML = `<!DOCTYPE html><html><body>
<table id="funcForm:table">
  <thead><tr>
    <th><span class="ui-column-title">開講年度学期</span></th>
    <th><span class="ui-column-title">授業コード</span></th>
    <th><span class="ui-column-title">科目授業名称</span></th>
    <th><span class="ui-column-title">曜日時限</span></th>
    <th><span class="ui-column-title">担当教員</span></th>
    <th><span class="ui-column-title">単位数</span></th>
  </tr></thead>
  <tbody id="funcForm:table_data">
    <tr data-ri="0">
      <td>2025年度後期</td>
      <td>9943119</td>
      <td><a id="funcForm:table:0:jugyoKmkName">9943119 Listening &amp; SpeakingⅠb b組</a></td>
      <td>月4</td>
      <td>Peter H. Budden</td>
      <td>1.0単位</td>
    </tr>
    <tr data-ri="1">
      <td>2025年度後期</td>
      <td></td>
      <td><a id="funcForm:table:1:jugyoKmkName">9943177 線形代数２</a></td>
      <td>火4 金1</td>
      <td>大槻 玲</td>
      <td>2.0単位</td>
    </tr>
    <tr data-ri="2">
      <td>2026年度 後期</td>
      <td>99KT101</td>
      <td><a id="funcForm:table:2:jugyoKmkName">99KT101 生命科学入門 （後期月５・秋山）</a></td>
      <td>月5</td>
      <td>秋山 好嗣</td>
      <td>2.0単位</td>
    </tr>
    <tr data-ri="3">
      <td>2026年度 後期</td>
      <td>99KT140</td>
      <td><a id="funcForm:table:3:jugyoKmkName">99KT140 生命科学概論 （後期集中）</a></td>
      <td></td>
      <td>橋本 茂樹</td>
      <td>2.0単位</td>
    </tr>
    <tr data-ri="4">
      <td>2026年度 後期</td>
      <td>99KT15J</td>
      <td><a id="funcForm:table:4:jugyoKmkName">宇宙物理学 （後期火５・大越）</a></td>
      <td>火5</td>
      <td>大越 克也</td>
      <td>2.0単位</td>
    </tr>
  </tbody>
</table>
</body></html>`;
const dom3 = new jsdom.JSDOM(SYL_HTML);
const doc3 = dom3.window.document;
const sylTable = doc3.querySelector("#funcForm\\:table");
const sylHeaders = P.getTableHeaders(sylTable);
console.assert(sylHeaders.length === 6 && /科目/.test(sylHeaders[2]), "見出し取得: " + JSON.stringify(sylHeaders));
console.assert(!P.isGradeHeaders(sylHeaders), "成績表誤判定");
const gradeHeaders = ["学科組織", "開講年度学期", "授業コード", "授業科目", "曜日時限", "担当教員", "評価対象者数", "S評価", "A評価", "B評価", "C評価", "D評価"];
console.assert(P.isGradeHeaders(gradeHeaders), "成績表判定");
const srow0 = P.parseSyllabusSearchRow(doc3.querySelector("tr[data-ri='0']"), sylHeaders);
console.assert(srow0 && srow0.classCode === "9943119", "syl row0 code: " + JSON.stringify(srow0));
console.assert(srow0.nameJa === "Listening & SpeakingⅠb b組", "syl row0 name: " + srow0.nameJa);
console.assert(srow0.dayPeriods.length === 1 && srow0.dayPeriods[0].period === 4, "syl row0 period");
console.assert(srow0.instructor === "Peter H. Budden", "syl row0 instructor: " + srow0.instructor);
console.assert(srow0.year === "2025" && srow0.semester === "後期", "syl row0 学期");
const srow1 = P.parseSyllabusSearchRow(doc3.querySelector("tr[data-ri='1']"), sylHeaders);
console.assert(srow1 && srow1.classCode === "9943177", "syl row1 code(リンク文言から抽出): " + JSON.stringify(srow1));
console.assert(srow1.nameJa === "線形代数２", "syl row1 name: " + srow1.nameJa);
console.assert(srow1.dayPeriods.length === 2, "syl row1 複数時限");
const srow2 = P.parseSyllabusSearchRow(doc3.querySelector("tr[data-ri='2']"), sylHeaders);
console.assert(srow2 && srow2.classCode === "99KT101", "syl row2 99KT101: " + JSON.stringify(srow2));
console.assert(srow2.nameJa === "生命科学入門 （後期月５・秋山）", "syl row2 name: " + srow2.nameJa);
console.assert(srow2.year === "2026" && srow2.semester === "後期", "syl row2 学期: " + srow2.yearSemester);
const srow3 = P.parseSyllabusSearchRow(doc3.querySelector("tr[data-ri='3']"), sylHeaders);
console.assert(srow3 && srow3.classCode === "99KT140", "syl row3 99KT140(集中・時限なしでも追加可): " + JSON.stringify(srow3));
console.assert(srow3.dayPeriods.length === 0, "syl row3 時限なし");
const srow4 = P.parseSyllabusSearchRow(doc3.querySelector("tr[data-ri='4']"), sylHeaders);
console.assert(srow4 && srow4.classCode === "99KT15J", "syl row4 コード列から取得: " + JSON.stringify(srow4));
console.assert(srow4.nameJa === "宇宙物理学 （後期火５・大越）", "syl row4 name: " + srow4.nameJa);
// コードトークン判定
console.assert(P.looksLikeCodeToken("99KT101"), "99KT101");
console.assert(P.looksLikeCodeToken("9943119"), "9943119");
console.assert(P.looksLikeCodeToken("994657L"), "994657L");
console.assert(P.looksLikeCodeToken("99KT15J"), "99KT15J");
console.assert(!P.looksLikeCodeToken("2025"), "年度はコードではない");
console.assert(!P.looksLikeCodeToken("Matthew"), "人名はコードではない");
console.assert(!P.looksLikeCodeToken("Listening"), "科目名単語はコードではない");
console.assert(!P.looksLikeCodeToken("データマイニング"), "和名はコードではない");
console.log("✓ シラバス検索行パース 通過");

// --- スコア計算（既定 S=5/A=4/B=3/C=2/D=0） ---
const sc1 = P.computeGradeScore({ s: 41.7, a: 37.5, b: 16.7, c: 4.2, d: 0.0 });
console.assert(Math.abs(sc1 - 4.17) < 0.01, "スコア41.7分布: " + sc1);
const scAllS = P.computeGradeScore({ s: 100, a: 0, b: 0, c: 0, d: 0 });
console.assert(scAllS === 5, "all S: " + scAllS);
const scAllD = P.computeGradeScore({ s: 0, a: 0, b: 0, c: 0, d: 100 });
console.assert(scAllD === 0, "all D: " + scAllD);
console.assert(P.computeGradeScore({}) === null, "空はnull");
console.assert(P.computeGradeScore({ s: 50, a: 50, b: 0, c: 0, d: 0 }, { s: 5, a: 4, b: 3, c: 2, d: 1 }) === 4.5, "カスタム重み");
console.log("✓ スコア計算 通過");

// --- シラバスパース (JSDOM 実HTML) ---
const syllabusTable = document.querySelector("#pkx02301\\:ch\\:table");
const result = P.parseSyllabusTable(syllabusTable);
console.log("シラバスパース結果:", JSON.stringify(result, null, 2));
console.assert(result.classCode === "9943115", "classCode: " + result.classCode);
console.assert(result.courseNumber === "L3FLENG101", "courseNumber: " + result.courseNumber);
console.assert(result.nameJa === "Listening & SpeakingⅠa a組", "nameJa: " + result.nameJa);
console.assert(result.credits === "1.0単位", "credits: " + result.credits);
console.assert(result.summary.startsWith("This class"), "summary: " + result.summary);
console.assert(result.remarks === "出席は重要です。", "remarks: " + result.remarks);
console.assert(result.dayPeriods.length === 1 && result.dayPeriods[0].period === 4, "dayPeriods: " + JSON.stringify(result.dayPeriods));
console.log("✓ 実HTMLシラバスパース 通過");

// --- 検索行パース ---
const tr = document.querySelector("#funcForm\\:table_data tr[data-ri='0']");
const row = P.parseSearchRow(tr);
console.log("検索行パース結果:", JSON.stringify(row, null, 2));
console.assert(row.classCode === "9943115", "row classCode");
console.assert(row.nameJa === "Listening & SpeakingⅠa a組", "row nameJa");
console.assert(row.dayPeriods.length === 1 && row.dayPeriods[0].day === "月", "row dayPeriods");
console.assert(row.publicGrades.s === 41.7, "row S: " + row.publicGrades.s);
console.assert(row.publicGrades.a === 37.5, "row A: " + row.publicGrades.a);
console.assert(row.year === "2025" && row.semester === "前期", "row year/semester");
console.log("✓ 実HTML検索行パース 通過");

console.log("ALL TESTS PASSED");
