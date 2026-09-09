// TUS CLASS Helper - Parser & Storage
// 検索結果行 / シラバス詳細 / 曜日時限 のパースと chrome.storage ラッパー

(function (global) {
  "use strict";

  const STORAGE_KEYS = {
    COURSES: "courses",          // {[classCode]: Course}
    GRADE_LINKS: "gradeLinks",    // {[classCode]: {s,a,b,c,d,count}}
    GRADE_ROWS: "gradeRows",      // {[classCode]: {classCode,nameJa,grades,score}} 成績照会の行候補
    TIMETABLE: "timetable",      // {[classCode]: {planned, note}}
    MANUAL_SLOTS: "manualSlots",  // {"day-period": {title, note}}
    SETTINGS: "settings"          // {scoreWeights, ...}
  };

  // 成績分布→スコアの重み（5〜0点）。S=5, A=4, B=3, C=2, D=0 で最大5.0〜最小0.0
  const DEFAULT_SCORE_WEIGHTS = { s: 5, a: 4, b: 3, c: 2, d: 0 };

  // ---- Storage helpers ----
  function get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (data) => resolve(data || {}));
    });
  }
  function set(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve(true));
    });
  }
  function remove(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(keys, () => resolve(true));
    });
  }
  async function getCourses() {
    const d = await get(STORAGE_KEYS.COURSES);
    return d.courses || {};
  }
  // 追加元タグ: "grade"（成績分布側）/ "syllabus"（シラバス側）。
  // 旧データには無いため、データ形状から推論する。
  function getSources(course) {
    if (!course) return [];
    if (Array.isArray(course.sources) && course.sources.length) {
      return course.sources.filter((s) => s === "grade" || s === "syllabus");
    }
    const inferred = [];
    const g = course.publicGrades || {};
    if (g.s != null || g.a != null || g.b != null || g.c != null || g.d != null || g.count != null) {
      inferred.push("grade");
    }
    if (course.addedVia === "syllabus" || course.nameEn || course.courseNumber ||
        course.summary || course.classPlan || course.gradingPolicy || course.textbookInfo) {
      inferred.push("syllabus");
    }
    return inferred;
  }
  // シラバス詳細まで取り込み済みか（= 基本データとして使えるか）。
  // 成績側のみのデータは補助扱い（スコア・分布のみ）。
  function isSyllabusComplete(course) {
    return getSources(course).includes("syllabus");
  }
  async function saveCourse(course) {
    if (!course || !course.classCode) return false;
    const courses = await getCourses();
    const existing = courses[course.classCode] || {};
    const merged = Object.assign({}, existing, course, {
      classCode: course.classCode,
      addedAt: existing.addedAt || Date.now(),
      updatedAt: Date.now()
    });
    // sources は和集合で保持（片側だけの追加状態を後から判定できるようにする）
    const srcSet = new Set([...(existing.sources || []), ...(course.sources || [])]);
    if (srcSet.size) merged.sources = Array.from(srcSet);
    // 配列フィールドの重複マージ
    merged.dayPeriods = course.dayPeriods && course.dayPeriods.length
      ? course.dayPeriods
      : (existing.dayPeriods || []);
    courses[course.classCode] = merged;
    await set({ [STORAGE_KEYS.COURSES]: courses });
    notifyChanged();
    return true;
  }
  async function deleteCourse(classCode) {
    const courses = await getCourses();
    delete courses[classCode];
    await set({ [STORAGE_KEYS.COURSES]: courses });
    const tt = (await get(STORAGE_KEYS.TIMETABLE)).timetable || {};
    delete tt[classCode];
    await set({ [STORAGE_KEYS.TIMETABLE]: tt });
    const gl = (await get(STORAGE_KEYS.GRADE_LINKS)).gradeLinks || {};
    delete gl[classCode];
    await set({ [STORAGE_KEYS.GRADE_LINKS]: gl });
    notifyChanged();
  }
  async function getGradeLinks() {
    const d = await get(STORAGE_KEYS.GRADE_LINKS);
    return d.gradeLinks || {};
  }
  async function getGradeRows() {
    const d = await get(STORAGE_KEYS.GRADE_ROWS);
    return d.gradeRows || {};
  }
  async function saveGradeRows(rows) {
    if (!rows || typeof rows !== "object") return false;
    const cur = await getGradeRows();
    Object.keys(rows).forEach((k) => {
      if (!rows[k]) return;
      const prev = cur[k] || {};
      cur[k] = Object.assign({}, rows[k]);
      // 明示追加の pinned フラグは自動収集の上書きで消さない
      if (prev.pinned && cur[k].pinned !== false) {
        cur[k].pinned = true;
        if (prev.pinnedAt && !cur[k].pinnedAt) cur[k].pinnedAt = prev.pinnedAt;
      }
    });
    await set({ [STORAGE_KEYS.GRADE_ROWS]: cur });
    notifyChanged();
    return true;
  }
  async function removeGradeRow(key) {
    const cur = await getGradeRows();
    delete cur[key];
    await set({ [STORAGE_KEYS.GRADE_ROWS]: cur });
    notifyChanged();
  }
  async function getScoreWeights() {
    const d = await get(STORAGE_KEYS.SETTINGS);
    const w = (d.settings && d.settings.scoreWeights) || {};
    return Object.assign({}, DEFAULT_SCORE_WEIGHTS, w);
  }
  async function setScoreWeights(weights) {
    const d = await get(STORAGE_KEYS.SETTINGS);
    const s = d.settings || {};
    s.scoreWeights = Object.assign({}, DEFAULT_SCORE_WEIGHTS, weights || {});
    await set({ [STORAGE_KEYS.SETTINGS]: s });
    notifyChanged();
  }
  // サイドバーパネルの表示サイズ（設定画面で変更可）
  const DEFAULT_SIDEBAR_SIZE = { panelWidth: 300, fontScale: 100 };
  const SIDEBAR_SIZE_LIMITS = {
    panelWidth: { min: 220, max: 440 },
    fontScale: { min: 85, max: 125 }
  };
  function normalizeSidebarSize(s) {
    const out = Object.assign({}, DEFAULT_SIDEBAR_SIZE);
    if (s && typeof s === "object") {
      ["panelWidth", "fontScale"].forEach((k) => {
        const v = parseInt(s[k], 10);
        if (isNaN(v)) return;
        const lim = SIDEBAR_SIZE_LIMITS[k];
        out[k] = Math.min(lim.max, Math.max(lim.min, v));
      });
    }
    return out;
  }
  function computeGradeScore(grades, weights) {
    if (!grades) return null;
    const w = weights || DEFAULT_SCORE_WEIGHTS;
    const vals = ["s", "a", "b", "c", "d"].map((k) => {
      const v = grades[k];
      return (typeof v === "number" && !isNaN(v)) ? v : 0;
    });
    if (grades.s == null && grades.a == null && grades.b == null && grades.c == null && grades.d == null) {
      return null;
    }
    const score = (vals[0] * w.s + vals[1] * w.a + vals[2] * w.b + vals[3] * w.c + vals[4] * w.d) / 100;
    return Math.round(score * 100) / 100;
  }
  async function saveGradeLink(classCode, data) {
    const gl = await getGradeLinks();
    gl[classCode] = Object.assign({}, gl[classCode] || {}, data, { linkedAt: Date.now() });
    await set({ [STORAGE_KEYS.GRADE_LINKS]: gl });
    notifyChanged();
  }
  async function getTimetable() {
    const d = await get(STORAGE_KEYS.TIMETABLE);
    return d.timetable || {};
  }
  async function setCoursePlanned(classCode, planned) {
    const tt = await getTimetable();
    tt[classCode] = Object.assign({}, tt[classCode] || {}, { planned: !!planned });
    await set({ [STORAGE_KEYS.TIMETABLE]: tt });
    notifyChanged();
  }
  async function getManualSlots() {
    const d = await get(STORAGE_KEYS.MANUAL_SLOTS);
    return d.manualSlots || {};
  }
  async function setManualSlot(key, value) {
    const ms = await getManualSlots();
    if (value === null) delete ms[key];
    else ms[key] = value;
    await set({ [STORAGE_KEYS.MANUAL_SLOTS]: ms });
    notifyChanged();
  }
  async function clearAll() {
    await remove([STORAGE_KEYS.COURSES, STORAGE_KEYS.GRADE_LINKS, STORAGE_KEYS.GRADE_ROWS,
                   STORAGE_KEYS.TIMETABLE, STORAGE_KEYS.MANUAL_SLOTS, STORAGE_KEYS.SETTINGS]);
    notifyChanged();
  }
  async function exportJson() {
    const all = await get([STORAGE_KEYS.COURSES, STORAGE_KEYS.GRADE_LINKS, STORAGE_KEYS.GRADE_ROWS,
                          STORAGE_KEYS.TIMETABLE, STORAGE_KEYS.MANUAL_SLOTS, STORAGE_KEYS.SETTINGS]);
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      courses: all.courses || {},
      gradeLinks: all.gradeLinks || {},
      gradeRows: all.gradeRows || {},
      timetable: all.timetable || {},
      manualSlots: all.manualSlots || {},
      settings: all.settings || {}
    };
  }
  async function importJson(obj) {
    if (!obj || typeof obj !== "object") return false;
    const data = {};
    if (obj.courses) data[STORAGE_KEYS.COURSES] = obj.courses;
    if (obj.gradeLinks) data[STORAGE_KEYS.GRADE_LINKS] = obj.gradeLinks;
    if (obj.gradeRows) data[STORAGE_KEYS.GRADE_ROWS] = obj.gradeRows;
    if (obj.timetable) data[STORAGE_KEYS.TIMETABLE] = obj.timetable;
    if (obj.manualSlots) data[STORAGE_KEYS.MANUAL_SLOTS] = obj.manualSlots;
    if (obj.settings) {
      const cur = (await get(STORAGE_KEYS.SETTINGS)).settings || {};
      data[STORAGE_KEYS.SETTINGS] = Object.assign({}, cur, obj.settings);
    }
    await set(data);
    notifyChanged();
    return true;
  }
  function notifyChanged() {
    try {
      chrome.runtime.sendMessage({ type: "COUNTS_CHANGED" });
    } catch (e) { /* ignore */ }
  }

  // ---- Parsers ----
  const DAY_MAP = { "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6, "日": 0 };
  const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

  function parseDayPeriod(text) {
    if (!text) return [];
    const result = [];
    const cleaned = String(text).replace(/\s+/g, " ").trim();
    // パターンA: 短縮形 "月4" "火4 金1" "水1 金1" → 数字1桁
    // パターンB: 日本語表記 "月曜4限" "火曜1限" → 「曜」の後に1-8 + 任意の「限」
    // パターンC: 英語表記 "Monday, 4th period" は parseDayPeriod の対象ではないが
    //            数字 + "period"/"限" を含むパターンにも対応
    // 全体: 曜日漢字 + 1-8 の数字
    const regex = /([月火水木金土日])(?:[曜])?([1-8])(?:限)?/g;
    let m;
    while ((m = regex.exec(cleaned)) !== null) {
      const day = m[1];
      const period = parseInt(m[2], 10);
      if (!result.some((r) => r.day === day && r.period === period)) {
        result.push({ day, dayNum: DAY_MAP[day], period });
      }
    }
    return result;
  }

  function parseYearSemester(text) {
    if (!text) return { year: "", semester: "" };
    const m = String(text).match(/(\d{4})年度\s*(前期|後期|通年|集中)?/);
    return {
      year: m ? m[1] : "",
      semester: m && m[2] ? m[2] : ""
    };
  }

  function parsePercent(text) {
    if (text == null) return null;
    const m = String(text).match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return isNaN(v) ? null : v;
  }

  // 単位数「1.0単位」「2.0単位」などから数値のみ抽出。無ければ null
  function parseCredits(text) {
    if (text == null) return null;
    const m = String(text).replace(/[\s,]/g, "").match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return isNaN(v) ? null : v;
  }

  // 検索結果行 → Course (基本 + 成績分布)
  function parseSearchRow(tr) {
    if (!tr) return null;
    const tds = tr.querySelectorAll("td");
    if (tds.length < 12) return null;
    const department = tds[0].textContent.trim();
    const yearSemesterText = tds[1].textContent.trim();
    const classCode = tds[2].textContent.trim();
    const nameAnchor = tds[3].querySelector("a");
    const nameJa = nameAnchor ? nameAnchor.textContent.trim() : tds[3].textContent.trim();
    const dayPeriodText = tds[4].textContent.trim();
    const instructor = tds[5].textContent.trim();
    const evalCountText = tds[6].textContent.trim();
    const sText = tds[7].textContent.trim();
    const aText = tds[8].textContent.trim();
    const bText = tds[9].textContent.trim();
    const cText = tds[10].textContent.trim();
    const dText = tds[11].textContent.trim();
    if (!classCode) return null;
    const ys = parseYearSemester(yearSemesterText);
    return {
      classCode,
      nameJa,
      department,
      year: ys.year,
      semester: ys.semester,
      yearSemester: yearSemesterText,
      dayPeriodText,
      dayPeriods: parseDayPeriod(dayPeriodText),
      instructor,
      publicGrades: {
        count: parsePercent(evalCountText),
        s: parsePercent(sText),
        a: parsePercent(aText),
        b: parsePercent(bText),
        c: parsePercent(cText),
        d: parsePercent(dText)
      },
      addedVia: "search"
    };
  }

  // ---- 検索結果テーブルの形式判定・汎用パース ----
  // 成績評価公開授業照会（12列・S〜D分布あり）とシラバス照会（列構成が異なる）の両対応。
  // 見出しテキスト（thead th）で列の意味を特定する。
  function getTableHeaders(table) {
    if (!table) return [];
    const ths = table.querySelectorAll("thead th");
    return Array.from(ths).map((th) => {
      const title = th.querySelector(".ui-column-title");
      return cleanText(title ? title.textContent : th.textContent);
    });
  }
  function isGradeHeaders(headers) {
    const joined = (headers || []).join(" ");
    return /S評価/.test(joined) || /成績評価状況/.test(joined);
  }
  function findNameAnchor(tr) {
    if (!tr) return null;
    return tr.querySelector('a[id*="jugyoKmkName"]');
  }
  // 授業コードらしきトークン判定
  // 従来は「先頭5桁以上の数字」必須だったため 99KT101 / 99KT15J のような
  // 「数字＋英字混じり」コードを取りこぼしていた。英数字4文字以上＋数字を1文字以上含むものを採用する。
  // 年度（2025）・人名（Matthew）・科目名（Listening）との区別は呼び出し側の文脈（コード列・先頭トークン）で行う。
  const CODE_TOKEN_RE = /^(?=[0-9A-Z\-_]*\d)[0-9A-Z][0-9A-Z\-_]*$/i;
  function looksLikeCodeToken(tok) {
    const t = String(tok == null ? "" : tok).trim().replace(/^[(),，、。]+|[(),，、。]+$/g, "");
    if (t.length < 4 || !CODE_TOKEN_RE.test(t)) return false;
    // 4文字が純粋な数字（年度の2025等）の場合は除外。英字を含む4文字以上は採用
    if (t.length === 4 && !/[A-Z]/i.test(t)) return false;
    return true;
  }
  function extractClassCode(text) {
    if (!text) return "";
    const tokens = String(text).split(/[\s\u3000／\/]+/).map((t) => t.trim()).filter(Boolean);
    for (const tok of tokens) {
      if (looksLikeCodeToken(tok)) return tok.replace(/^[(),，、。]+|[(),，、。]+$/g, "");
    }
    return "";
  }
  function colByHeader(cells, headers, pred) {
    if (!headers || !headers.length) return "";
    for (let i = 0; i < headers.length && i < cells.length; i++) {
      if (pred(headers[i], i)) return cleanText(cells[i].textContent);
    }
    return "";
  }
  // シラバス照会（Kmh006等）の検索結果行 → Course（基本のみ・成績分布なし）
  // 例: リンク文言が「9943119 Listening & SpeakingⅠb b組」のようにコード+科目名一体の場合あり
  function parseSyllabusSearchRow(tr, headers) {
    if (!tr) return null;
    const anchor = findNameAnchor(tr);
    if (!anchor) return null;
    const cells = Array.from(tr.querySelectorAll("td"));
    if (!cells.length) return null;
    const anchorText = cleanText(anchor.textContent);
    const hs = headers && headers.length ? headers : [];
    let classCode = "";
    if (hs.length) {
      // コード列が特定できる場合はそのセルの値を優先（99KT101 形式もそのまま採用）
      const codeCell = colByHeader(cells, hs, (h) => /授業コード|科目コード|コード/.test(h)).trim();
      if (codeCell && looksLikeCodeToken(codeCell.replace(/\s+/g, ""))) {
        classCode = codeCell.replace(/\s+/g, "");
      } else {
        classCode = extractClassCode(codeCell);
      }
    }
    if (!classCode) {
      // リンク文言の先頭トークン（例:「99KT101 生命科学入門…」「9943119 Listening…」）
      const firstTok = anchorText.split(/[\s\u3000]+/)[0] || "";
      if (looksLikeCodeToken(firstTok)) classCode = firstTok;
    }
    if (!classCode) {
      // コード列以外のセルは文脈が弱いので、科目リンクセルとコード列候補のみ走査
      const anchorCell = anchor.closest("td");
      const candCells = anchorCell ? [anchorCell] : [];
      if (hs.length) {
        cells.forEach((td, i) => {
          if (hs[i] && /授業コード|科目コード|コード/.test(hs[i])) candCells.push(td);
        });
      }
      const scanCells = candCells.length ? candCells : cells;
      for (const td of scanCells) {
        classCode = extractClassCode(cleanText(td.textContent));
        if (classCode) break;
      }
    }
    if (!classCode) return null;
    let nameJa = anchorText;
    const firstTok = anchorText.split(/[\s\u3000]+/)[0] || "";
    if (looksLikeCodeToken(firstTok)) {
      nameJa = anchorText.slice(firstTok.length).trim();
    }
    if (!nameJa) nameJa = anchorText;
    let yearSemesterText = hs.length
      ? colByHeader(cells, hs, (h) => /年度|学期/.test(h))
      : "";
    let dayPeriodText = hs.length
      ? colByHeader(cells, hs, (h) => /曜日|時限/.test(h))
      : "";
    if (!dayPeriodText) {
      for (const td of cells) {
        const t = cleanText(td.textContent);
        if (parseDayPeriod(t).length) { dayPeriodText = t; break; }
      }
    }
    const instructor = hs.length
      ? colByHeader(cells, hs, (h) => /教員|担当/.test(h))
      : "";
    const credits = hs.length
      ? colByHeader(cells, hs, (h) => /単位/.test(h))
      : "";
    // 「開講年度学期」に /開講/ が含まれるため学科判定から除外する
    const department = hs.length
      ? colByHeader(cells, hs, (h) => /学科|組織/.test(h) || (/開講/.test(h) && !/年度|学期/.test(h)))
      : "";
    const method = hs.length
      ? colByHeader(cells, hs, (h) => /開講区分|授業形態|実施形態|形態|方式/.test(h))
      : "";
    const ys = parseYearSemester(yearSemesterText);
    return {
      classCode,
      nameJa,
      department,
      year: ys.year,
      semester: ys.semester,
      yearSemester: yearSemesterText,
      dayPeriodText,
      dayPeriods: parseDayPeriod(dayPeriodText),
      instructor,
      credits,
      method,
      addedVia: "search"
    };
  }

  // シラバス詳細テーブル (#pkx02301:ch:table) → Course (詳細)
  // 仕様: 1〜2カラムの行が交互に並ぶ
  function parseSyllabusTable(table) {
    if (!table) return {};
    const result = {};
    let lastKey = null;
    const setOrAppend = (key, val) => {
      if (!key) return;
      if (result[key] != null) result[key] = result[key] + "\n" + val;
      else result[key] = val;
    };
    const rows = table.querySelectorAll(".rowStyle.rowMargin");
    rows.forEach((row) => {
      // 各グループ: [header][content] または [content] 単体
      // 1つの .rowStyle.rowMargin 内は <div> が連続し、ヘッダ・値が交互
      const children = Array.from(row.children);
      let pendingJa = null;
      let pendingEn = null;
      children.forEach((child) => {
        const isHeader = child.classList.contains("ui-widget-header");
        if (isHeader) {
          // 日英併記ヘッダ（全角空白2つ以上で区切られる）を和文・英文に分割。
          // cleanText で潰す前に生テキストで分割するのが要点
          // （例:「教科書の使用有無（有=Y , 無=N）　Textbook used...」や
          //  「授業でのBYOD PCの利用有無　Whether or not...」は単純な正規表現では切れない）
          const parts = splitHeader(child.textContent);
          if (!parts.ja) return;
          pendingJa = parts.ja;
          pendingEn = parts.en;
        } else {
          // content 側
          const text = cleanText(child.textContent);
          if (pendingJa) {
            setOrAppend(pendingJa, text);
            if (pendingEn) setOrAppend(pendingEn, text);
            pendingJa = null;
            pendingEn = null;
          } else {
            // ラベルなしの追加値（例: 空のcontentなど）— 直前キーに追記
            if (lastKey) setOrAppend(lastKey, text);
          }
        }
      });
      // 最後のヘッダ名を保持
      if (pendingJa) lastKey = pendingJa;
    });

    // 整形（和文ラベル・英文ラベルの両方から拾う。画面により表記ゆれがあるため候補を広めに持つ）
    const pick = (...keys) => {
      for (const k of keys) {
        if (result[k] != null && String(result[k]).trim() !== "") return result[k];
      }
      return "";
    };
    let classCode = pick("授業コード", "Class code");
    if (!classCode) {
      // フォールバック: テーブル全体のテキストから「授業コード 9943119」を拾う
      const m = cleanText(table.textContent).match(/授業コード\s*([0-9A-Z]{5,})|Class code\s*([0-9A-Z]{5,})/);
      if (m) classCode = m[1] || m[2] || "";
    }
    const yearSemesterText = pick("開講年度学期");
    return {
      nameJa: pick("科目授業名称（和文）", "科目名（和文）", "科目名", "授業科目名", "Name of the subject/class (in Japanese)"),
      nameEn: pick("科目授業名称（英文）", "科目名（英文）", "Name of the subject/class (in English)"),
      classCode,
      courseNumber: pick("科目番号", "Course number"),
      instructor: pick("教員名", "担当教員"),
      instructorEn: pick("Instructor"),
      yearSemester: yearSemesterText,
      year: parseYearSemester(yearSemesterText).year,
      semester: parseYearSemester(yearSemesterText).semester,
      dayPeriodText: pick("曜日時限"),
      classHours: pick("Class hours"),
      dayPeriods: parseDayPeriod(pick("曜日時限")),
      department: pick("開講学科・専攻", "Department"),
      credits: pick("単位数", "Course credit"),
      method: pick("授業の方法", "Teaching method"),
      language: pick("外国語のみの科目（使用言語）", "Course in only foreign languages (languages)"),
      mainFormat: pick("授業の主な実施形態", "Main class format"),
      summary: pick("概要", "Description"),
      objectives: pick("目的", "Objectives"),
      outcomes: pick("到達目標", "Outcomes"),
      diplomaPolicy: pick("卒業認定・学位授与の方針との関係（学部科目のみ）"),
      prerequisites: pick("履修上の注意", "Course notes prerequisites"),
      activeLearning: pick("アクティブ・ラーニング科目", "Teaching type（Active Learning）", "Teaching type(Active Learning)"),
      prepReview: pick("準備学習・復習", "Preparation and review"),
      gradingPolicy: pick("成績評価方法", "Performance grading policy"),
      evaluation: pick("学修成果の評価", "Evaluation of academic achievement"),
      textbookUsed: pick("教科書の使用有無（有=Y , 無=N）", "Textbook used(Y for yes, N for no)"),
      textbookInfo: pick("書誌情報", "Bibliographic information"),
      mykitsUrl: pick("MyKiTSのURL（教科書販売サイト）", "URL for MyKiTS(textbook sales site)"),
      references: pick("参考書・その他資料", "Reference and other materials"),
      classPlan: pick("授業計画", "Class plan"),
      instructorExperience: pick("担当教員の実務経験とそれを活かした教育内容", "Work experience of the instructor"),
      software: pick("教育用ソフトウェア", "Educational software"),
      remarks: pick("備考", "Remarks"),
      byodPc: pick("授業でのBYOD PCの利用有無", "Whether or not students may use BYOD PCs in class"),
      virtualPc: pick("授業での仮想PCの利用有無", "Whether or not students may use a virtual PC in class"),
      addedVia: "syllabus"
    };
  }

  function cleanText(s) {
    if (!s) return "";
    return String(s).replace(/[\s\u3000]+/g, " ").trim();
  }
  // 日英併記ヘッダを {ja, en} に分割する。
  // 和文と英文は「空白2つ以上（全角含む）」で区切られるのがCLASSの約束。
  // 先に潰してしまうと「教科書の使用有無（有=Y , 無=N）」や「授業でのBYOD PCの利用有無」、
  // 「MyKiTSのURL…」のようにASCIIを含む和文ラベルが切断されるため、生テキストで分割する。
  const JA_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  function splitHeader(raw) {
    const s = String(raw == null ? "" : raw);
    const parts = s.split(/[\s\u3000]{2,}/).map((p) => p.trim()).filter((p) => p !== "");
    if (!parts.length) return { ja: "", en: "" };
    if (parts.length >= 2) {
      const ja = cleanText(parts[0]);
      const en = cleanText(parts.slice(1).join(" "));
      // 先頭チャンクが英文のみなら ja には入れない
      if (!JA_RE.test(ja)) {
        return { ja: "", en: cleanText(s) };
      }
      return { ja, en };
    }
    const single = cleanText(parts[0]);
    // 日本語を含まないヘッダ（"Class hours"等）は両方に入れておく
    if (!JA_RE.test(single)) {
      return { ja: single, en: single };
    }
    // 単一空白区切りの日英併記（例:「備考 Remarks」）に対応。
    // 条件: 左に日本語を含み、右が大文字始まりの日本語なし英文。最初に一致した境界を採用する
    // （「教科書の使用有無（有=Y , 無=N） Textbook ...」や「授業でのBYOD PCの利用有無 Whether ...」の
    //  ように和文内にASCIIが混ざる場合でも、右側の日本語有無で誤切断を避けられる）
    const tokens = single.split(" ");
    for (let i = 1; i < tokens.length; i++) {
      const left = tokens.slice(0, i).join(" ");
      const right = tokens.slice(i).join(" ");
      if (JA_RE.test(left) && /^[A-Z]/.test(right) && !JA_RE.test(right)) {
        return { ja: left, en: right };
      }
    }
    return { ja: single, en: "" };
  }
  function normalizeLabel(text) {
    // 後方互換: 和文部分のみ返す
    return splitHeader(text).ja || cleanText(text);
  }

  // ---- Public API ----
  global.TCE = global.TCE || {};
  global.TCE.parser = {
    STORAGE_KEYS, DEFAULT_SCORE_WEIGHTS, DEFAULT_SIDEBAR_SIZE, SIDEBAR_SIZE_LIMITS,
    getCourses, saveCourse, deleteCourse, getSources, isSyllabusComplete,
    getGradeLinks, saveGradeLink,
    getGradeRows, saveGradeRows, removeGradeRow,
    getScoreWeights, setScoreWeights, computeGradeScore, normalizeSidebarSize,
    getTimetable, setCoursePlanned,
    getManualSlots, setManualSlot,
    clearAll, exportJson, importJson,
    parseDayPeriod, parseYearSemester, parsePercent, parseCredits,
    parseSearchRow, parseSyllabusSearchRow, parseSyllabusTable,
    getTableHeaders, isGradeHeaders, findNameAnchor, extractClassCode, looksLikeCodeToken,
    cleanText, normalizeLabel, splitHeader,
    DAY_NAMES
  };
})(typeof window !== "undefined" ? window : this);
