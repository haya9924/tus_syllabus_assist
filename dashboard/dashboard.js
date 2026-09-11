// TUS CLASS Helper - Dashboard
// 比較 / 時間割 / 成績リンク / 設定

(function () {
  "use strict";

  // ---- ストレージAPI（content/parser.js と同じインターフェースを dashboard 側でも利用） ----
  const K = {
    COURSES: "courses",
    GRADE_LINKS: "gradeLinks",
    GRADE_ROWS: "gradeRows",
    TIMETABLE: "timetable",
    MANUAL_SLOTS: "manualSlots",
    SETTINGS: "settings"
  };
  const DEFAULT_SCORE_WEIGHTS = { s: 5, a: 4, b: 3, c: 2, d: 0 };
  const get = (keys) => new Promise((r) => chrome.storage.local.get(keys, (d) => r(d || {})));
  const set = (obj) => new Promise((r) => chrome.storage.local.set(obj, () => r(true)));
  const getCourses = async () => (await get(K.COURSES)).courses || {};
  const getGradeRows = async () => (await get(K.GRADE_ROWS)).gradeRows || {};
  const getScoreWeights = async () => {
    const d = await get(K.SETTINGS);
    const w = (d.settings && d.settings.scoreWeights) || {};
    return Object.assign({}, DEFAULT_SCORE_WEIGHTS, w);
  };
  const setScoreWeights = async (weights) => {
    const d = await get(K.SETTINGS);
    const s = d.settings || {};
    s.scoreWeights = Object.assign({}, DEFAULT_SCORE_WEIGHTS, weights || {});
    await set({ [K.SETTINGS]: s });
  };
  function computeGradeScore(grades, weights) {
    if (!grades) return null;
    const w = weights || DEFAULT_SCORE_WEIGHTS;
    const keys = ["s", "a", "b", "c", "d"];
    if (keys.every((k) => grades[k] == null)) return null;
    const v = (k) => (typeof grades[k] === "number" && !isNaN(grades[k]) ? grades[k] : 0);
    return Math.round(((v("s") * w.s + v("a") * w.a + v("b") * w.b + v("c") * w.c + v("d") * w.d) / 100) * 100) / 100;
  }
  const saveCourse = async (course) => {
    if (!course || !course.classCode) return false;
    const c = await getCourses();
    const ex = c[course.classCode] || {};
    c[course.classCode] = Object.assign({}, ex, course, { classCode: course.classCode, updatedAt: Date.now() });
    // sources は和集合で保持（content 側と同様）
    const srcSet = new Set([...(ex.sources || []), ...(course.sources || [])]);
    if (srcSet.size) c[course.classCode].sources = Array.from(srcSet);
    if (!ex.addedAt) c[course.classCode].addedAt = Date.now();
    await set({ [K.COURSES]: c });
    return true;
  };
  const deleteCourse = async (code) => {
    const c = await getCourses(); delete c[code]; await set({ [K.COURSES]: c });
    const t = (await get(K.TIMETABLE)).timetable || {}; delete t[code]; await set({ [K.TIMETABLE]: t });
    const g = (await get(K.GRADE_LINKS)).gradeLinks || {}; delete g[code]; await set({ [K.GRADE_LINKS]: g });
  };
  const getGradeLinks = async () => (await get(K.GRADE_LINKS)).gradeLinks || {};
  const removeGradeRow = async (key) => {
    const rows = await getGradeRows();
    delete rows[key];
    await set({ [K.GRADE_ROWS]: rows });
  };
  const saveGradeLink = async (code, data) => {
    const g = await getGradeLinks();
    g[code] = Object.assign({}, g[code] || {}, data, { linkedAt: Date.now() });
    await set({ [K.GRADE_LINKS]: g });
  };
  const getTimetable = async () => (await get(K.TIMETABLE)).timetable || {};
  const setCoursePlanned = async (code, planned) => {
    const t = await getTimetable();
    t[code] = Object.assign({}, t[code] || {}, { planned: !!planned });
    await set({ [K.TIMETABLE]: t });
  };
  const getManualSlots = async () => (await get(K.MANUAL_SLOTS)).manualSlots || {};
  const setManualSlot = async (key, val) => {
    const m = await getManualSlots();
    if (val === null) delete m[key];
    else m[key] = val;
    await set({ [K.MANUAL_SLOTS]: m });
  };
  const clearAll = async () => {
    await new Promise((r) => chrome.storage.local.remove([K.COURSES, K.GRADE_LINKS, K.GRADE_ROWS, K.TIMETABLE, K.MANUAL_SLOTS, K.SETTINGS], () => r()));
  };

  // ---- 曜日 ----
  const DAYS = ["月", "火", "水", "木", "金", "土"];
  const DAY_FULL = { "月": "月曜", "火": "火曜", "水": "水曜", "木": "木曜", "金": "金曜", "土": "土曜" };
  const PERIODS = 8;
  const PERIOD_TIME = ["", "1限", "2限", "3限", "4限", "5限", "6限", "7限", "8限"];

  // ---- 比較表示用フィールド ----
  const COMPARE_FIELDS = [
    ["nameJa", "科目名"],
    ["classCode", "授業コード"],
    ["courseNumber", "科目番号"],
    ["instructor", "教員"],
    ["department", "学科組織"],
    ["yearSemester", "年度学期"],
    ["dayPeriodText", "曜日時限"],
    ["credits", "単位数"],
    ["method", "授業方法"],
    ["summary", "概要"],
    ["objectives", "目的"],
    ["outcomes", "到達目標"],
    ["prerequisites", "履修上の注意"],
    ["gradingPolicy", "成績評価方法"],
    ["textbookInfo", "教科書"],
    ["references", "参考書"],
    ["classPlan", "授業計画"],
    ["remarks", "備考"]
  ];

  // ---- ヘルパ ----
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const dayPeriods = (c) => {
    if (Array.isArray(c.dayPeriods) && c.dayPeriods.length) return c.dayPeriods;
    return parseDayPeriod(c.dayPeriodText);
  };
  function parseDayPeriod(text) {
    if (!text) return [];
    const out = [];
    const re = /([月火水木金土日])(?:[曜])?([1-8])(?:限)?/g;
    let m;
    while ((m = re.exec(String(text))) !== null) {
      const day = m[1];
      const period = parseInt(m[2], 10);
      if (!DAYS.includes(day)) continue;
      if (period < 1 || period > 8) continue;
      if (!out.some((r) => r.day === day && r.period === period)) {
        out.push({ day, period });
      }
    }
    return out;
  }
  function parseYearSemester(text) {
    const m = String(text || "").match(/(\d{4})年度\s*(前期|後期|通年|集中)?/);
    return { year: m ? m[1] : "", semester: m && m[2] ? m[2] : "" };
  }
  function parseCredits(text) {
    if (text == null) return null;
    const m = String(text).replace(/[\s,]/g, "").match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const v = parseFloat(m[1]);
    return isNaN(v) ? null : v;
  }

  // ---- 状態 ----
  const state = {
    selected: new Set(),
    activeTab: "compare",
    compareSort: "code" // code | name | scoreDesc
  };

  // ---- タブ切替 ----
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  function switchTab(name) {
    state.activeTab = name;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
    if (name === "compare") renderCompare();
    if (name === "timetable") renderTimetable();
    if (name === "grade") renderGrade();
  }

  // ===========================================================
  // 比較タブ
  // ===========================================================
  $("tce-compare-btn").addEventListener("click", doCompare);
  $("tce-compare-select-all").addEventListener("click", async () => {
    const c = await getCourses();
    Object.keys(c).forEach((k) => state.selected.add(k));
    renderCompare();
  });
  $("tce-compare-clear").addEventListener("click", () => {
    state.selected.clear();
    renderCompare();
  });

  const compareSortEl = $("tce-compare-sort");
  if (compareSortEl) {
    compareSortEl.addEventListener("change", () => {
      state.compareSort = compareSortEl.value;
      renderCompare();
    });
  }

  function sortCourseList(list) {
    const arr = list.slice();
    if (state.compareSort === "name") {
      arr.sort((a, b) => (a.nameJa || "").localeCompare(b.nameJa || "", "ja"));
    } else if (state.compareSort === "scoreDesc") {
      arr.sort((a, b) => (b._score == null ? -Infinity : b._score) - (a._score == null ? -Infinity : a._score));
    } else {
      arr.sort((a, b) => (a.classCode || "").localeCompare(b.classCode || ""));
    }
    return arr;
  }

  // 追加元タグ（content/parser.js の getSources と同等）
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
  // シラバス詳細まで取り込み済みか（基本データとして使えるか）。成績のみは補助扱い
  function isSyllabusComplete(course) {
    return getSources(course).includes("syllabus");
  }

  async function renderCompare() {
    const courses = await getCourses();
    const gl = await getGradeLinks();
    const tt = await getTimetable();
    const weights = await getScoreWeights();
    // 比較タブはシラバス取得済みのみ（成績のみのデータは成績リンクタブでのみ扱う）
    const withScores = Object.values(courses).filter(isSyllabusComplete).map((c) => {
      const g = c.publicGrades || gl[c.classCode] || {};
      return Object.assign({}, c, { _grades: g, _score: computeGradeScore(g, weights) });
    });
    const list = sortCourseList(withScores);
    $("tce-compare-count").textContent = `${list.length} 件`;
    const el = $("tce-course-list");
    el.innerHTML = "";
    list.forEach((c) => {
      const card = document.createElement("div");
      card.className = "course-card" + (state.selected.has(c.classCode) ? " selected" : "");
      const cardTint = tintColor(c.color, 0.12);
      if (cardTint) card.style.background = cardTint;
      const linked = gl[c.classCode];
      const planned = tt[c.classCode];
      const grades = c._grades || {};
      const badges = [];
      if (linked) badges.push('<span class="badge linked">成績リンク</span>');
      if (planned && planned.planned) badges.push('<span class="badge timetable">履修予定</span>');
      if (c.addedVia === "syllabus") badges.push('<span class="badge">シラバス</span>');
      else if (c.addedVia === "search") badges.push('<span class="badge">検索</span>');
      if (c._score != null) badges.push(`<span class="badge score">スコア ${c._score.toFixed(2)}</span>`);
      const gradeStr = (grades.s != null || grades.a != null)
        ? `S:${fmt(grades.s)}% A:${fmt(grades.a)}% B:${fmt(grades.b)}% C:${fmt(grades.c)}% D:${fmt(grades.d)}%${grades.count != null ? ` (n=${grades.count})` : ""}`
        : "";
      card.innerHTML = `
        <div class="head">
          ${colorDotHtml(c.color, "講座の色")}
          <div class="name">${escapeHtml(c.nameJa || "(名称未取得)")}</div>
          <input type="checkbox" class="check" data-code="${escapeHtml(c.classCode)}" ${state.selected.has(c.classCode) ? "checked" : ""}>
        </div>
        <div class="code">${escapeHtml(c.classCode || "")} / ${escapeHtml(c.yearSemester || "")}</div>
        <div class="meta">${escapeHtml(c.instructor || "")} / ${escapeHtml(c.dayPeriodText || "")} / ${escapeHtml(c.credits || "単位不明")}</div>
        <div class="badges">${badges.join(" ")}</div>
        ${gradeStr ? `<div class="grades"><span>${escapeHtml(gradeStr)}</span></div>` : ""}
        ${c.memo ? `<div class="memo">${escapeHtml(c.memo)}</div>` : ""}
        <div class="actions">
          <button data-act="view" data-code="${escapeHtml(c.classCode)}">詳細</button>
          <button data-act="tt" data-code="${escapeHtml(c.classCode)}">${planned && planned.planned ? "履修予定を解除" : "履修予定に追加"}</button>
          <button data-act="memo" data-code="${escapeHtml(c.classCode)}">メモ</button>
          <button data-act="color" data-code="${escapeHtml(c.classCode)}">色</button>
          <button data-act="del" data-code="${escapeHtml(c.classCode)}">削除</button>
        </div>
      `;
      el.appendChild(card);
    });

    el.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const code = cb.dataset.code;
        if (cb.checked) state.selected.add(code);
        else state.selected.delete(code);
        cb.closest(".course-card").classList.toggle("selected", cb.checked);
      });
    });
    el.querySelectorAll("button[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const code = btn.dataset.code;
        const act = btn.dataset.act;
        if (act === "tt") {
          const t = await getTimetable();
          await setCoursePlanned(code, !(t[code] && t[code].planned));
          renderCompare();
        } else if (act === "view") {
          openSyllabusView(code);
        } else if (act === "memo") {
          openMemoEditor(code);
        } else if (act === "color") {
          openColorEditor(code);
        } else if (act === "del") {
          if (confirm("この授業を削除しますか？")) {
            await deleteCourse(code);
            state.selected.delete(code);
            renderCompare();
          }
        }
      });
    });
  }

  // ---- 講座色付け ----
  const COLOR_PALETTE = [
    "#e74c3c", "#e67e22", "#f39c12", "#2ecc71", "#1abc9c",
    "#3498db", "#9b59b6", "#fd79a8", "#00cec9", "#636e72"
  ];
  // 保存値・表示値ともに #rrggbb 形式のみ許可（XSS対策のためstyle埋め込み前に必ず通す）
  function normalizeColor(v) {
    if (v == null) return "";
    const s = String(v).trim().toLowerCase();
    let m = s.match(/^#([0-9a-f]{6})$/);
    if (m) return "#" + m[1];
    m = s.match(/^#([0-9a-f]{3})$/);
    if (m) return "#" + m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2];
    m = s.match(/^([0-9a-f]{6})$/);
    if (m) return "#" + m[1];
    return "";
  }
  function colorDotHtml(color, title) {
    const c = normalizeColor(color);
    if (!c) return "";
    return `<span class="color-dot" style="background:${c};"${title ? ` title="${escapeHtml(title)}"` : ""}></span>`;
  }
  // 背景色用に白で薄めた色を返す（コマ表示の背景に使用）
  function tintColor(hex, alpha) {
    const c = normalizeColor(hex);
    if (!c) return "";
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function fmt(v) {
    if (v == null) return "-";
    if (typeof v !== "number") return String(v);
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  function fmtCredit(v) {
    if (v == null || isNaN(v)) return "0.0";
    return v.toFixed(1);
  }

  // 成績分布の比較グラフ（S/A/B/C/Dの各判定に講座ごとの系列バーを並べる）
  const HIST_ORDER = ["s", "a", "b", "c", "d"];
  const HIST_LABELS = { s: "S", a: "A", b: "B", c: "C", d: "D" };
  const SERIES_FALLBACK = ["#3498db", "#e74c3c", "#2ecc71", "#9b59b6", "#e67e22", "#00cec9", "#636e72", "#fd79a8"];
  function gradeCompareHistogramHtml(sel, gl) {
    const series = sel.map((c, i) => {
      const g = c.publicGrades || gl[c.classCode] || {};
      const color = normalizeColor(c.color) || SERIES_FALLBACK[i % SERIES_FALLBACK.length];
      const name = c.nameJa || c.classCode;
      return { c, g, color, name, has: HIST_ORDER.some((k) => g[k] != null) };
    });
    const legend = `<div class="hist-legend">${series.map((s) =>
      `<span class="lg-item"><span class="lg-dot" style="background:${s.color};"></span>${escapeHtml(s.name)}</span>`
    ).join("")}</div>`;
    const groups = HIST_ORDER.map((k) => {
      const bars = series.filter((s) => s.g[k] != null).map((s) => {
        const p = s.g[k];
        const h = Math.max(2, Math.min(100, p));
        return `<div class="chist-bar" style="height:${h}%;background:${s.color};" title="${escapeHtml(s.name)} ${HIST_LABELS[k]}: ${fmt(p)}%"></div>`;
      }).join("");
      return `<div class="chist-group">
        <div class="chist-bars">${bars || `<div class="chist-bar chist-empty"></div>`}</div>
        <div class="chist-label">${HIST_LABELS[k]}</div>
      </div>`;
    }).join("");
    const texts = series.map((s) => {
      const g = s.g;
      const line = s.has
        ? `S:${fmt(g.s)}% A:${fmt(g.a)}% B:${fmt(g.b)}% C:${fmt(g.c)}% D:${fmt(g.d)}%${g.count != null ? ` (n=${g.count})` : ""}`
        : "成績データなし";
      return `<div class="hist-text-line">${escapeHtml(s.name)}: ${line}</div>`;
    }).join("");
    return `${legend}<div class="chist" role="img" aria-label="成績分布比較グラフ">${groups}</div><div class="hist-text">${texts}</div>`;
  }

  // 単一科目の成績分布ヒストグラム（S/A/B/C/D ごとの棒＋値。シラバス確認画面用）
  const HIST_COLORS = { s: "#f0c040", a: "#4a8f3f", b: "#3498db", c: "#e67e22", d: "#e74c3c" };
  function gradeHistogramHtml(g) {
    g = g || {};
    if (!HIST_ORDER.some((k) => g[k] != null)) return `<span class="muted">成績データなし</span>`;
    const groups = HIST_ORDER.map((k) => {
      const p = g[k] != null ? g[k] : 0;
      const h = Math.max(2, Math.min(100, p));
      const bar = g[k] != null
        ? `<div class="chist-bar" style="height:${h}%;background:${HIST_COLORS[k]};" title="${HIST_LABELS[k]}: ${fmt(p)}%"></div>`
        : `<div class="chist-bar chist-empty"></div>`;
      return `<div class="chist-group">
        <div class="chist-bars">${bar}</div>
        <div class="chist-label">${HIST_LABELS[k]}</div>
        <div class="chist-val">${g[k] != null ? fmt(p) + "%" : "-"}</div>
      </div>`;
    }).join("");
    return `<div class="chist" role="img" aria-label="成績分布ヒストグラム">${groups}</div>`;
  }

  async function doCompare() {
    const courses = await getCourses();
    const gl = await getGradeLinks();
    const weights = await getScoreWeights();
    const sel = Array.from(state.selected).map((k) => courses[k]).filter(Boolean);
    const out = $("tce-compare-result");
    if (sel.length < 2) {
      out.innerHTML = `<p class="muted">2つ以上選択してください。</p>`;
      return;
    }
    // 重複コマ警告
    const slotMap = {};
    sel.forEach((c) => {
      dayPeriods(c).forEach((dp) => {
        const k = `${dp.day}-${dp.period}`;
        (slotMap[k] = slotMap[k] || []).push(c);
      });
    });
    const conflicts = Object.entries(slotMap).filter(([, arr]) => arr.length > 1);
    let conflictHtml = "";
    if (conflicts.length) {
      conflictHtml = `<div class="conflicts">⚠ 同時限に複数科目が登録されています: ` +
        conflicts.map(([k, arr]) => {
          const [d, p] = k.split("-");
          return `${DAY_FULL[d]} ${p}限: ${arr.map((c) => escapeHtml(c.nameJa || c.classCode)).join(" / ")}`;
        }).join("<br>") + `</div>`;
    }

    let html = conflictHtml + `<table><thead><tr><th>項目</th>${sel.map((c) => `<th>${escapeHtml(c.nameJa || c.classCode)}<br><span class="muted">${escapeHtml(c.classCode)}</span></th>`).join("")}</tr></thead><tbody>`;
    COMPARE_FIELDS.forEach(([key, label]) => {
      const values = sel.map((c) => c[key] || "");
      const allSame = values.every((v) => v === values[0]);
      html += `<tr><td class="label">${escapeHtml(label)}</td>${values.map((v) => `<td class="val${allSame ? "" : " diff"}">${escapeHtml(v)}</td>`).join("")}</tr>`;
    });
    // 公開成績分布（単一の比較グラフ）+ スコア
    html += `<tr><td class="label">成績分布</td><td class="val" colspan="${sel.length}">${gradeCompareHistogramHtml(sel, gl)}</td></tr>`;
    html += `<tr><td class="label">成績スコア</td>${sel.map((c) => {
      const g = c.publicGrades || gl[c.classCode] || {};
      const sc = computeGradeScore(g, weights);
      return `<td class="val">${sc == null ? "-" : sc.toFixed(2)}</td>`;
    }).join("")}</tr>`;
    html += `</tbody></table>`;
    out.innerHTML = html;
  }

  // ===========================================================
  // 時間割タブ
  // ===========================================================
  $("tce-tt-clear").addEventListener("click", async () => {
    if (!confirm("履修予定を全て解除しますか？")) return;
    const courses = await getCourses();
    for (const code of Object.keys(courses)) await setCoursePlanned(code, false);
    renderTimetable();
  });

  async function renderTimetable() {
    const courses = await getCourses();
    const tt = await getTimetable();
    const manual = await getManualSlots();
    const gl = await getGradeLinks();
    const weights = await getScoreWeights();
    // 時間割もシラバス取得済みのみ（成績のみのデータは成績リンクタブでのみ扱う）
    const planned = Object.values(courses).filter((c) => isSyllabusComplete(c) && tt[c.classCode] && tt[c.classCode].planned);

    const totalCredits = planned.reduce((sum, c) => sum + (parseCredits(c.credits) || 0), 0);
    $("tce-tt-count").textContent = `${planned.length} 件履修予定 / 合計 ${fmtCredit(totalCredits)}単位`;

    // グリッド生成
    const grid = $("tce-tt-grid");
    let html = "<thead><tr><th class='time'>時限</th>";
    DAYS.forEach((d) => html += `<th class='day'>${DAY_FULL[d]}</th>`);
    html += "</tr></thead><tbody>";
    for (let p = 1; p <= PERIODS; p++) {
      html += `<tr><th class='time'>${PERIOD_TIME[p]}</th>`;
      for (const day of DAYS) {
        const key = `${day}-${p}`;
        const courseList = planned.filter((c) =>
          dayPeriods(c).some((dp) => dp.day === day && dp.period === p)
        );
        // 重複検出
        const conflict = courseList.length > 1;
        html += `<td class="cell${conflict ? " conflict" : ""}" data-day="${day}" data-period="${p}">`;
        courseList.forEach((c) => {
          const g = c.publicGrades || gl[c.classCode] || {};
          const sc = computeGradeScore(g, weights);
          const memo = (c.memo || "").trim();
          const col = normalizeColor(c.color);
          const blockStyle = col ? ` style="border-left-color:${col};background:${tintColor(col, 0.25)};"` : "";
          html += `<div class="block" data-code="${escapeHtml(c.classCode)}" title="クリックで詳細"${blockStyle}>
            <button class="b-remove" data-rm="${escapeHtml(c.classCode)}" title="履修予定を解除">×</button>
            <div class="b-title">${escapeHtml(c.nameJa || c.classCode)}</div>
            <div class="b-meta">${escapeHtml(c.classCode)} / ${escapeHtml(c.credits || "単位不明")}</div>
            ${sc != null ? `<div class="b-score">スコア ${sc.toFixed(2)}</div>` : ""}
            ${memo ? `<div class="b-memo">${escapeHtml(memo)}</div>` : ""}
          </div>`;
        });
        // 手動メモ
        const m = manual[key];
        if (m) {
          html += `<div class="block manual" data-manual="${key}">
            <button class="b-remove" data-rm-manual="${key}" title="削除">×</button>
            <div class="b-title">${escapeHtml(m.title || "(無題)")}</div>
            ${m.note ? `<div class="b-meta">${escapeHtml(m.note)}</div>` : ""}
          </div>`;
        }
        html += `</td>`;
      }
      html += "</tr>";
    }
    html += "</tbody>";
    grid.innerHTML = html;

    // 追加リスト
    const addList = $("tce-tt-add-list");
    addList.innerHTML = "";
    const candidates = Object.values(courses)
      .filter((c) => isSyllabusComplete(c) && (!tt[c.classCode] || !tt[c.classCode].planned))
      .sort((a, b) => (a.classCode || "").localeCompare(b.classCode || ""));
    if (!candidates.length) {
      addList.innerHTML = `<p class="muted">追加できる授業がありません。シラバス詳細画面で「+ 比較に追加」してから再度開いてください。</p>`;
    } else {
      candidates.forEach((c) => {
        const card = document.createElement("div");
        card.className = "course-card";
        const candTint = tintColor(c.color, 0.12);
        if (candTint) card.style.background = candTint;
        const cg = c.publicGrades || gl[c.classCode] || {};
        const csc = computeGradeScore(cg, weights);
        const cbadges = [];
        if (gl[c.classCode]) cbadges.push('<span class="badge linked">成績リンク</span>');
        if (csc != null) cbadges.push(`<span class="badge score">スコア ${csc.toFixed(2)}</span>`);
        card.innerHTML = `
          <div class="name">${colorDotHtml(c.color, "講座の色")}${escapeHtml(c.nameJa || c.classCode)}</div>
          <div class="code">${escapeHtml(c.classCode)} / ${escapeHtml(c.yearSemester || "")}</div>
          <div class="meta">${escapeHtml(c.instructor || "")} / ${escapeHtml(c.dayPeriodText || "-")} / ${escapeHtml(c.credits || "単位不明")}</div>
          <div class="badges">${cbadges.join(" ")}</div>
          ${c.memo ? `<div class="memo">${escapeHtml(c.memo)}</div>` : ""}
          <div class="actions">
            <button data-add="${escapeHtml(c.classCode)}">履修予定に追加</button>
            <button data-memo="${escapeHtml(c.classCode)}">メモ</button>
            <button data-color="${escapeHtml(c.classCode)}">色</button>
            <button data-view="${escapeHtml(c.classCode)}">詳細</button>
          </div>
        `;
        addList.appendChild(card);
      });
      addList.querySelectorAll("button[data-add]").forEach((b) => {
        b.addEventListener("click", async () => {
          await setCoursePlanned(b.dataset.add, true);
          renderTimetable();
        });
      });
      addList.querySelectorAll("button[data-memo]").forEach((b) => {
        b.addEventListener("click", () => openMemoEditor(b.dataset.memo));
      });
      addList.querySelectorAll("button[data-color]").forEach((b) => {
        b.addEventListener("click", () => openColorEditor(b.dataset.color));
      });
      addList.querySelectorAll("button[data-view]").forEach((b) => {
        b.addEventListener("click", () => openSyllabusView(b.dataset.view));
      });
    }

    // 時間割内の操作
    grid.querySelectorAll(".block[data-code]").forEach((b) => {
      b.addEventListener("click", (e) => {
        if (e.target.closest(".b-remove")) return;
        openSyllabusView(b.dataset.code);
      });
    });
    grid.querySelectorAll(".b-remove[data-rm]").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        await setCoursePlanned(b.dataset.rm, false);
        renderTimetable();
      });
    });
    grid.querySelectorAll(".b-remove[data-rm-manual]").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        await setManualSlot(b.dataset.rmManual, null);
        renderTimetable();
      });
    });
    grid.querySelectorAll("td.cell").forEach((cell) => {
      cell.addEventListener("dblclick", () => {
        const key = `${cell.dataset.day}-${cell.dataset.period}`;
        openManualSlotEditor(key, manual[key]);
      });
    });
  }

  async function openManualSlotEditor(key, current) {
    openModal("空きセルに追加", `
      <div class="form-row"><label>タイトル</label><input type="text" id="tce-manual-title" value="${escapeHtml(current && current.title ? current.title : "")}" placeholder="例: ゼミ"></div>
      <div class="form-row"><label>メモ</label><input type="text" id="tce-manual-note" value="${escapeHtml(current && current.note ? current.note : "")}" placeholder="場所など"></div>
    `, async (ok) => {
      if (!ok) return;
      const title = $("tce-manual-title").value.trim();
      const note = $("tce-manual-note").value.trim();
      if (!title && !note) {
        await setManualSlot(key, null);
      } else {
        await setManualSlot(key, { title, note, updatedAt: Date.now() });
      }
      renderTimetable();
    }, !!current, async () => {
      await setManualSlot(key, null);
      renderTimetable();
    });
  }

  // ===========================================================
  // 成績リンクタブ
  // 仕様: シラバス詳細画面で追加した保存済み授業をまず全件表示し、
  // 各行の「接続」ボタンから成績照会の候補一覧を出してリンク/解除する。
  // ===========================================================
  async function renderGrade() {
    const courses = await getCourses();
    const gl = await getGradeLinks();
    const rows = await getGradeRows();
    const weights = await getScoreWeights();
    const el = $("tce-grade-list");
    el.innerHTML = "";
    const list = Object.values(courses).sort((a, b) => (a.classCode || "").localeCompare(b.classCode || ""));
    const linkedCount = list.filter((c) => gl[c.classCode]).length;
    const summary = $("tce-grade-summary");
    if (summary) {
      summary.textContent = `保存済み ${list.length} 件（接続中 ${linkedCount} 件） / 成績候補 ${Object.keys(rows).length} 件`;
    }
    // 保存済み授業がゼロでも未接続セクションは表示する（早期returnしない）
    if (!list.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "保存済みの授業がありません。シラバス詳細画面で「+ 比較に追加」を押してください。";
      el.appendChild(p);
    }
    list.forEach((course) => {
      const link = gl[course.classCode];
      const g = link || course.publicGrades || {};
      const score = computeGradeScore(g, weights);
      const card = document.createElement("div");
      card.className = "course-card" + (isSyllabusComplete(course) ? "" : " incomplete");
      const gradeTint = tintColor(course.color, 0.12);
      if (gradeTint) card.style.background = gradeTint;
      const statusBadge = link
        ? `<span class="badge linked">接続中${score != null ? ` スコア ${score.toFixed(2)}` : ""}</span>`
        : `<span class="badge">未接続</span>`;
      const incompleteBadge = isSyllabusComplete(course)
        ? ""
        : `<span class="badge incomplete">詳細未取得</span>`;
      const distHtml = (g.s != null || g.a != null || g.count != null)
        ? `<div class="grades">
             <span>S:${fmt(g.s)}%</span><span>A:${fmt(g.a)}%</span><span>B:${fmt(g.b)}%</span><span>C:${fmt(g.c)}%</span><span>D:${fmt(g.d)}%</span>
             ${g.count != null ? `<span>n=${g.count}</span>` : ""}
           </div>`
        : `<div class="muted">成績データなし</div>`;
      const srcHtml = link && link.sourceRow
        ? `<div class="muted">接続先: ${escapeHtml(link.sourceRow.nameJa || "")} (${escapeHtml(link.sourceRow.classCode || "")})</div>`
        : "";
      card.innerHTML = `
        <div class="head">
          ${colorDotHtml(course.color, "講座の色")}
          <div class="name">${escapeHtml(course.nameJa || course.classCode)}</div>
          ${statusBadge}${incompleteBadge}
        </div>
        <div class="code">${escapeHtml(course.classCode || "")} / ${escapeHtml(course.yearSemester || "")}</div>
        <div class="meta">${escapeHtml(course.instructor || "")} / ${escapeHtml(course.dayPeriodText || "-")}</div>
        ${distHtml}
        ${srcHtml}
        ${course.memo ? `<div class="memo">${escapeHtml(course.memo)}</div>` : ""}
        <div class="actions">
          <button data-view="${escapeHtml(course.classCode)}">詳細</button>
          <button data-connect="${escapeHtml(course.classCode)}">${link ? "接続先を変更" : "成績を接続"}</button>
          <button data-memo="${escapeHtml(course.classCode)}">メモ</button>
          <button data-color="${escapeHtml(course.classCode)}">色</button>
          ${link ? `<button data-unlink="${escapeHtml(course.classCode)}">接続解除</button>
          <button data-edit="${escapeHtml(course.classCode)}">数値を直接編集</button>` : ""}
        </div>
      `;
      el.appendChild(card);
    });
    el.querySelectorAll("button[data-view]").forEach((b) => {
      b.addEventListener("click", () => openSyllabusView(b.dataset.view));
    });
    el.querySelectorAll("button[data-connect]").forEach((b) => {
      b.addEventListener("click", () => openCandidateModal(b.dataset.connect));
    });
    el.querySelectorAll("button[data-edit]").forEach((b) => {
      b.addEventListener("click", () => openGradeEditor(b.dataset.edit));
    });
    el.querySelectorAll("button[data-memo]").forEach((b) => {
      b.addEventListener("click", () => openMemoEditor(b.dataset.memo));
    });
    el.querySelectorAll("button[data-color]").forEach((b) => {
      b.addEventListener("click", () => openColorEditor(b.dataset.color));
    });
    el.querySelectorAll("button[data-unlink]").forEach((b) => {
      b.addEventListener("click", async () => {
        if (!confirm("この成績接続を解除しますか？")) return;
        const code = b.dataset.unlink;
        const g = await getGradeLinks();
        delete g[code];
        await set({ [K.GRADE_LINKS]: g });
        renderGrade();
        renderCompare();
      });
    });

    // ---- 保存した成績データ（未接続）----
    // 成績一覧の「＋成績追加」で明示保存した行のうち、どの保存済み授業にも
    // 紐付いていないもの。シラバス比較には追加しない。
    const linkedRowKeys = new Set();
    Object.values(gl).forEach((l) => {
      if (l && l.sourceRow && l.sourceRow.classCode) linkedRowKeys.add(l.sourceRow.classCode);
    });
    const unlinked = Object.values(rows)
      .filter((r) => r && r.pinned && !linkedRowKeys.has(r.classCode))
      .map((r) => Object.assign({}, r, { _score: r.score != null ? r.score : computeGradeScore(r.grades, weights) }))
      .sort((a, b) => (b._score == null ? -Infinity : b._score) - (a._score == null ? -Infinity : a._score));
    const secHead = document.createElement("h3");
    secHead.textContent = `保存した成績データ（未接続） ${unlinked.length} 件`;
    secHead.style.marginTop = "16px";
    el.appendChild(secHead);
    if (!unlinked.length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "未接続の保存成績はありません。成績照会の一覧で「＋成績追加」を押すとここに保存されます。";
      el.appendChild(p);
    }
    unlinked.forEach((r) => {
      const g = r.grades || {};
      const card = document.createElement("div");
      card.className = "course-card";
      card.innerHTML = `
        <div class="head">
          <div class="name">${escapeHtml(r.nameJa || r.classCode)}</div>
          <span class="badge">未接続の保存成績</span>
          ${r._score != null ? `<span class="badge score">スコア ${r._score.toFixed(2)}</span>` : ""}
        </div>
        <div class="code">${escapeHtml(r.classCode || "")}${r.yearSemester ? ` / ${escapeHtml(r.yearSemester)}` : ""}</div>
        <div class="grades">
          <span>S:${fmt(g.s)}%</span><span>A:${fmt(g.a)}%</span><span>B:${fmt(g.b)}%</span><span>C:${fmt(g.c)}%</span><span>D:${fmt(g.d)}%</span>
          ${g.count != null ? `<span>n=${g.count}</span>` : ""}
        </div>
        <div class="actions">
          <button data-uplink="${escapeHtml(r.classCode)}">保存済み授業にリンク</button>
          <button data-undel="${escapeHtml(r.classCode)}">削除</button>
        </div>
      `;
      el.appendChild(card);
    });
    el.querySelectorAll("button[data-uplink]").forEach((b) => {
      b.addEventListener("click", () => openGradeCoursePicker(b.dataset.uplink));
    });
    el.querySelectorAll("button[data-undel]").forEach((b) => {
      b.addEventListener("click", async () => {
        if (!confirm("この保存成績を削除しますか？")) return;
        await removeGradeRow(b.dataset.undel);
        renderGrade();
      });
    });
  }

  // 未接続の保存成績 gradeKey を保存済み授業に紐付けるモーダル
  async function openGradeCoursePicker(gradeKey) {
    const courses = await getCourses();
    const rows = await getGradeRows();
    const row = rows[gradeKey];
    if (!row) return;
    const weights = await getScoreWeights();
    const g = row.grades || {};
    const sc = row.score != null ? row.score : computeGradeScore(g, weights);
    const list = Object.values(courses)
      .sort((a, b) => (a.classCode || "").localeCompare(b.classCode || ""));
    const bodyHtml = `
      <p class="muted">「${escapeHtml(row.nameJa || gradeKey)}」の成績を接続する保存済み授業を選んでください。</p>
      <div class="form-row"><input type="text" id="tce-cand-search" placeholder="科目名・授業コードで絞り込み"></div>
      <div id="tce-cand-list" class="cand-list"></div>
    `;
    openModal(`成績をリンク: ${row.nameJa || gradeKey}`, bodyHtml, null);
    const listEl = $("tce-cand-list");
    const searchEl = $("tce-cand-search");
    const renderList = (q) => {
      const query = (q || "").toLowerCase().trim();
      const filtered = query
        ? list.filter((c) => (c.nameJa || "").toLowerCase().includes(query) || (c.classCode || "").toLowerCase().includes(query))
        : list;
      if (!filtered.length) {
        listEl.innerHTML = `<p class="muted">保存済み授業がありません。先にシラバス詳細画面で追加してください。</p>`;
        return;
      }
      listEl.innerHTML = "";
      filtered.forEach((c) => {
        const item = document.createElement("div");
        item.className = "cand-item";
        item.innerHTML = `
          <div class="cand-main">
            <div class="cand-name">${escapeHtml(c.nameJa || c.classCode)}</div>
            <div class="cand-meta">${escapeHtml([c.classCode, c.yearSemester, c.dayPeriodText].filter(Boolean).join(" / "))}</div>
          </div>
          <button type="button" data-pick-course="${escapeHtml(c.classCode)}">この授業にリンク</button>
        `;
        listEl.appendChild(item);
      });
      listEl.querySelectorAll("button[data-pick-course]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const code = btn.dataset.pickCourse;
          await saveGradeLink(code, Object.assign({}, g, {
            score: sc,
            sourceRow: { classCode: row.classCode, nameJa: row.nameJa }
          }));
          await saveCourse({ classCode: code, publicGrades: g, sources: ["grade"] });
          $("tce-modal").close("ok");
          renderGrade();
          renderCompare();
        });
      });
    };
    renderList("");
    searchEl.addEventListener("input", () => renderList(searchEl.value));
  }

  // 保存済み授業 courseCode に対して、成績候補（成績照会の行）の一覧から接続するモーダル
  async function openCandidateModal(courseCode) {
    const courses = await getCourses();
    const course = courses[courseCode];
    if (!course) return;
    const rows = await getGradeRows();
    const weights = await getScoreWeights();
    const candidates = Object.values(rows)
      .map((r) => Object.assign({}, r, { _score: r.score != null ? r.score : computeGradeScore(r.grades, weights) }))
      .sort((a, b) => (b._score == null ? -Infinity : b._score) - (a._score == null ? -Infinity : a._score));
    const bodyHtml = `
      <p class="muted">${escapeHtml(course.nameJa || courseCode)} に接続する成績を選んでください（スコア降順）。候補は成績評価公開授業照会で検索を実行すると自動収集されます。</p>
      <div class="form-row"><input type="text" id="tce-cand-search" placeholder="科目名・授業コードで絞り込み"></div>
      <div id="tce-cand-list" class="cand-list"></div>
      <div class="form-row" style="margin-top:8px;">
        <button id="tce-cand-manual" type="button">数値を手入力で設定</button>
      </div>
    `;
    openModal(`成績を接続: ${course.nameJa || courseCode}`, bodyHtml, null);
    const listEl = $("tce-cand-list");
    const searchEl = $("tce-cand-search");
    const renderList = (q) => {
      const query = (q || "").toLowerCase().trim();
      const filtered = query
        ? candidates.filter((r) => (r.nameJa || "").toLowerCase().includes(query) || (r.classCode || "").toLowerCase().includes(query))
        : candidates;
      if (!filtered.length) {
        listEl.innerHTML = `<p class="muted">候補がありません。成績評価公開授業照会の画面で検索を実行してから再度開いてください。</p>`;
        return;
      }
      listEl.innerHTML = "";
      filtered.forEach((r) => {
        const g = r.grades || {};
        const item = document.createElement("div");
        item.className = "cand-item";
        item.innerHTML = `
          <div class="cand-main">
            <div class="cand-name">${escapeHtml(r.nameJa || r.classCode)}</div>
            <div class="cand-meta">${escapeHtml(r.classCode || "")}${r.yearSemester ? ` / ${escapeHtml(r.yearSemester)}` : ""}</div>
            <div class="cand-grades">S:${fmt(g.s)}% A:${fmt(g.a)}% B:${fmt(g.b)}% C:${fmt(g.c)}% D:${fmt(g.d)}%${g.count != null ? ` (n=${g.count})` : ""}${r._score != null ? ` / スコア ${r._score.toFixed(2)}` : ""}</div>
          </div>
          <button type="button" data-link-row="${escapeHtml(r.classCode)}">この成績にリンク</button>
        `;
        listEl.appendChild(item);
      });
      listEl.querySelectorAll("button[data-link-row]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const row = candidates.find((r) => r.classCode === btn.dataset.linkRow);
          if (!row) return;
          const sc = row._score != null ? row._score : computeGradeScore(row.grades, weights);
          await saveGradeLink(courseCode, Object.assign({}, row.grades, {
            score: sc,
            sourceRow: { classCode: row.classCode, nameJa: row.nameJa }
          }));
          $("tce-modal").close("ok");
          renderGrade();
          renderCompare();
        });
      });
    };
    renderList("");
    searchEl.addEventListener("input", () => renderList(searchEl.value));
    $("tce-cand-manual").addEventListener("click", () => {
      $("tce-modal").close("cancel");
      openGradeEditor(courseCode);
    });
  }

  async function openGradeEditor(code) {
    const courses = await getCourses();
    const gl = await getGradeLinks();
    const c = courses[code];
    if (!c) return;
    const cur = gl[code] || c.publicGrades || {};
    openModal(`成績分布: ${c.nameJa || code}`, `
      <div class="form-row"><label>評価対象者数</label><input type="number" id="tce-g-count" value="${cur.count != null ? cur.count : ""}"></div>
      <div class="form-row"><label>S (%)</label><input type="number" step="0.1" id="tce-g-s" value="${cur.s != null ? cur.s : ""}"></div>
      <div class="form-row"><label>A (%)</label><input type="number" step="0.1" id="tce-g-a" value="${cur.a != null ? cur.a : ""}"></div>
      <div class="form-row"><label>B (%)</label><input type="number" step="0.1" id="tce-g-b" value="${cur.b != null ? cur.b : ""}"></div>
      <div class="form-row"><label>C (%)</label><input type="number" step="0.1" id="tce-g-c" value="${cur.c != null ? cur.c : ""}"></div>
      <div class="form-row"><label>D (%)</label><input type="number" step="0.1" id="tce-g-d" value="${cur.d != null ? cur.d : ""}"></div>
    `, async (ok) => {
      if (!ok) return;
      const data = {
        count: numOrNull($("tce-g-count").value),
        s: numOrNull($("tce-g-s").value),
        a: numOrNull($("tce-g-a").value),
        b: numOrNull($("tce-g-b").value),
        c: numOrNull($("tce-g-c").value),
        d: numOrNull($("tce-g-d").value)
      };
      const weights = await getScoreWeights();
      data.score = computeGradeScore(data, weights);
      const prev = (await getGradeLinks())[code] || {};
      data.sourceRow = prev.sourceRow || { classCode: code, nameJa: (courses[code] || {}).nameJa || code, manual: true };
      await saveGradeLink(code, data);
      if (state.activeTab === "grade") renderGrade();
      if (state.activeTab === "compare") renderCompare();
    });
  }
  function numOrNull(v) {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  async function openMemoEditor(code) {
    const courses = await getCourses();
    const c = courses[code];
    if (!c) return;
    openModal(`メモ: ${c.nameJa || code}`, `
      <div class="form-row"><label>メモ（比較・時間割・成績タブに表示されます）</label><textarea id="tce-memo-text" rows="4" placeholder="例: 抽選科目・教科書要確認など">${escapeHtml(c.memo || "")}</textarea></div>
    `, async (ok) => {
      if (!ok) return;
      const memo = $("tce-memo-text").value.trim();
      await saveCourse({ classCode: code, memo });
      if (state.activeTab === "compare") renderCompare();
      if (state.activeTab === "timetable") renderTimetable();
      if (state.activeTab === "grade") renderGrade();
    });
  }

  async function openColorEditor(code) {
    const courses = await getCourses();
    const c = courses[code];
    if (!c) return;
    const cur = normalizeColor(c.color);
    const swatches = COLOR_PALETTE.map((col) =>
      `<button type="button" class="color-swatch${col === cur ? " selected" : ""}" data-color="${col}" style="background:${col};" title="${col}"></button>`
    ).join("");
    openModal(`色: ${c.nameJa || code}`, `
      <div class="form-row"><label>講座の色（比較・時間割・成績タブに表示されます）</label>
        <div class="color-palette" id="tce-color-palette">${swatches}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
          <input type="color" id="tce-color-custom" value="${cur || "#3498db"}">
          <label for="tce-color-custom" style="font-size:12px;">カスタム色</label>
          <input type="hidden" id="tce-color-value" value="${cur}">
          <button type="button" id="tce-color-clear" class="btn-secondary">クリア</button>
        </div>
      </div>
    `, async (ok) => {
      if (!ok) return;
      const v = normalizeColor($("tce-color-value").value);
      await saveCourse({ classCode: code, color: v });
      if (state.activeTab === "compare") renderCompare();
      if (state.activeTab === "timetable") renderTimetable();
      if (state.activeTab === "grade") renderGrade();
    });
    const hidden = $("tce-color-value");
    const custom = $("tce-color-custom");
    const paint = () => {
      document.querySelectorAll("#tce-color-palette .color-swatch").forEach((s) => {
        s.classList.toggle("selected", s.dataset.color === hidden.value);
      });
    };
    document.querySelectorAll("#tce-color-palette .color-swatch").forEach((s) => {
      s.addEventListener("click", () => { hidden.value = s.dataset.color; custom.value = s.dataset.color; paint(); });
    });
    custom.addEventListener("input", () => { hidden.value = custom.value; paint(); });
    $("tce-color-clear").addEventListener("click", () => { hidden.value = ""; paint(); });
  }

  async function openSyllabusView(code) {
    const courses = await getCourses();
    const gl = await getGradeLinks();
    const weights = await getScoreWeights();
    const c = courses[code];
    if (!c) return;
    const g = c.publicGrades || gl[code] || {};
    const score = computeGradeScore(g, weights);
    const actions = `<div class="sv-actions">
      <button type="button" data-sv-edit="grade">成績を編集</button>
      <button type="button" data-sv-edit="memo">メモを編集</button>
      <button type="button" data-sv-edit="color">色を編集</button>
    </div>`;
    const gradeBlock = `<div class="sv-grade">
      <div class="sv-grade-title">成績分布</div>
      ${gradeHistogramHtml(g)}
      ${score != null ? `<div class="sv-score">スコア ${score.toFixed(2)}</div>` : ""}
    </div>`;
    const fields = [
      ["nameJa", "科目名"], ["nameEn", "科目名(英)"], ["classCode", "授業コード"], ["courseNumber", "科目番号"],
      ["instructor", "教員"], ["instructorEn", "教員(英)"], ["department", "学科"], ["yearSemester", "年度学期"],
      ["dayPeriodText", "曜日時限"], ["classHours", "開講時間"], ["credits", "単位数"], ["method", "授業方法"],
      ["language", "使用言語"], ["mainFormat", "実施形態"], ["activeLearning", "AL科目"],
      ["summary", "概要"], ["objectives", "目的"], ["outcomes", "到達目標"],
      ["prerequisites", "履修上の注意"], ["prepReview", "準備学習・復習"],
      ["gradingPolicy", "成績評価方法"], ["evaluation", "学修成果の評価"],
      ["textbookUsed", "教科書使用"], ["textbookInfo", "教科書"], ["references", "参考書"],
      ["classPlan", "授業計画"], ["software", "教育用ソフト"],
      ["byodPc", "BYOD PC"], ["virtualPc", "仮想PC"],
      ["diplomaPolicy", "DPとの関係"], ["instructorExperience", "教員実務経験"], ["remarks", "備考"],
      ["memo", "メモ"], ["color", "色"]
    ];
    let html = actions + gradeBlock + `<table style="width:100%; font-size:12px; border-collapse: collapse;">`;
    fields.forEach(([k, label]) => {
      const v = c[k] || "";
      let cell;
      if (k === "color" && normalizeColor(v)) {
        cell = `<span class="color-dot" style="background:${normalizeColor(v)};"></span> ${escapeHtml(v)}`;
      } else {
        cell = escapeHtml(v);
      }
      html += `<tr><th style="text-align:left; padding:4px; border:1px solid #ddd; background:#f5f7fa; width:100px;">${escapeHtml(label)}</th><td style="padding:4px; border:1px solid #ddd; white-space:pre-wrap;">${cell}</td></tr>`;
    });
    html += `</table>`;
    openModal(`${c.nameJa || code} のシラバス詳細`, html, null, false, () => {});
    document.querySelectorAll("[data-sv-edit]").forEach((b) => {
      b.addEventListener("click", () => {
        const kind = b.dataset.svEdit;
        $("tce-modal").close();
        if (kind === "grade") openGradeEditor(code);
        else if (kind === "memo") openMemoEditor(code);
        else openColorEditor(code);
      });
    });
  }

  // ===========================================================
  // 設定タブ
  // ===========================================================
  $("tce-export").addEventListener("click", async () => {
    const all = await get([K.COURSES, K.GRADE_LINKS, K.GRADE_ROWS, K.TIMETABLE, K.MANUAL_SLOTS, K.SETTINGS]);
    const obj = {
      version: 2,
      exportedAt: new Date().toISOString(),
      courses: all.courses || {},
      gradeLinks: all.gradeLinks || {},
      gradeRows: all.gradeRows || {},
      timetable: all.timetable || {},
      manualSlots: all.manualSlots || {},
      settings: all.settings || {}
    };
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tus-class-helper-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  });

  $("tce-import").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!confirm("既存のデータに上書きマージします。続行しますか？")) return;
    try {
      const text = await file.text();
      const obj = JSON.parse(text);
      const data = {};
      if (obj.courses) data[K.COURSES] = obj.courses;
      if (obj.gradeLinks) data[K.GRADE_LINKS] = obj.gradeLinks;
      if (obj.gradeRows) data[K.GRADE_ROWS] = obj.gradeRows;
      if (obj.timetable) data[K.TIMETABLE] = obj.timetable;
      if (obj.manualSlots) data[K.MANUAL_SLOTS] = obj.manualSlots;
      if (obj.settings) {
        const cur = (await get(K.SETTINGS)).settings || {};
        data[K.SETTINGS] = Object.assign({}, cur, obj.settings);
      }
      await set(data);
      renderCompare();
      renderTimetable();
      renderGrade();
      alert("インポートしました");
    } catch (err) {
      alert("インポート失敗: " + err.message);
    }
  });

  $("tce-clear-all").addEventListener("click", async () => {
    if (!confirm("本当に全データを削除しますか？この操作は取り消せません。")) return;
    await clearAll();
    renderCompare();
    renderTimetable();
    renderGrade();
  });

  // ---- スコア重み設定 ----
  async function loadWeightsForm() {
    const w = await getScoreWeights();
    ["s", "a", "b", "c", "d"].forEach((k) => {
      const el = $("tce-w-" + k);
      if (el) el.value = w[k];
    });
  }
  $("tce-weights-save").addEventListener("click", async () => {
    const w = {};
    ["s", "a", "b", "c", "d"].forEach((k) => {
      const v = parseFloat(($("tce-w-" + k) || {}).value);
      w[k] = isNaN(v) ? DEFAULT_SCORE_WEIGHTS[k] : v;
    });
    await setScoreWeights(w);
    alert("スコアの重みを保存しました");
    renderCompare();
    renderGrade();
  });
  $("tce-weights-reset").addEventListener("click", async () => {
    await setScoreWeights(Object.assign({}, DEFAULT_SCORE_WEIGHTS));
    loadWeightsForm();
    renderCompare();
    renderGrade();
  });
  loadWeightsForm();

  // ---- サイドバー表示サイズ設定 ----
  const SIDEBAR_SIZE_DEFAULTS = { panelWidth: 300, fontScale: 100 };
  const SIDEBAR_SIZE_LIMITS = {
    panelWidth: { min: 220, max: 440 },
    fontScale: { min: 85, max: 125 }
  };
  function clampSidebarSize(s) {
    const out = Object.assign({}, SIDEBAR_SIZE_DEFAULTS);
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
  async function getSidebarSize() {
    const d = await get(K.SETTINGS);
    const s = (d.settings && d.settings.sidebar) || {};
    return clampSidebarSize(s);
  }
  async function setSidebarSize(patch) {
    const d = await get(K.SETTINGS);
    const settings = d.settings || {};
    settings.sidebar = Object.assign({}, settings.sidebar, patch);
    await set({ [K.SETTINGS]: settings });
  }
  function paintSidebarSizeForm(size) {
    $("tce-sp-width").value = size.panelWidth;
    $("tce-sp-font").value = size.fontScale;
    $("tce-sp-width-val").textContent = size.panelWidth + "px";
    $("tce-sp-font-val").textContent = size.fontScale + "%";
  }
  async function loadSidebarSizeForm() {
    paintSidebarSizeForm(await getSidebarSize());
  }
  ["tce-sp-width", "tce-sp-font"].forEach((id) => {
    $(id).addEventListener("input", () => {
      paintSidebarSizeForm(clampSidebarSize({
        panelWidth: $("tce-sp-width").value,
        fontScale: $("tce-sp-font").value
      }));
    });
  });
  $("tce-sp-size-save").addEventListener("click", async () => {
    await setSidebarSize(clampSidebarSize({
      panelWidth: $("tce-sp-width").value,
      fontScale: $("tce-sp-font").value
    }));
    alert("サイドバーのサイズを保存しました");
  });
  $("tce-sp-size-reset").addEventListener("click", async () => {
    await setSidebarSize(Object.assign({}, SIDEBAR_SIZE_DEFAULTS));
    loadSidebarSizeForm();
  });
  loadSidebarSizeForm();

  // ===========================================================
  // モーダル
  // ===========================================================
  function openModal(title, bodyHtml, onOk, showDelete, onDelete) {
    $("tce-modal-title").textContent = title;
    $("tce-modal-body").innerHTML = bodyHtml;
    const okBtn = $("tce-modal-ok");
    const modal = $("tce-modal");
    okBtn.style.display = onOk ? "" : "none";
    if (showDelete) {
      let delBtn = document.getElementById("tce-modal-del");
      if (!delBtn) {
        delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.id = "tce-modal-del";
        delBtn.value = "delete";
        delBtn.textContent = "削除";
        delBtn.style.background = "var(--danger)";
        delBtn.style.color = "#fff";
        delBtn.style.borderColor = "var(--danger)";
        okBtn.parentNode.insertBefore(delBtn, okBtn);
      }
      delBtn.style.display = "";
      delBtn.onclick = (e) => { e.preventDefault(); onDelete && onDelete(); modal.close("delete"); };
    } else {
      const delBtn = document.getElementById("tce-modal-del");
      if (delBtn) delBtn.style.display = "none";
    }
    modal.returnValue = "";
    modal.showModal();
    modal.onclose = () => {
      if (typeof onOk === "function") {
        onOk(modal.returnValue === "ok");
      }
    };
  }

  // ---- 初期表示 ----
  renderCompare();
})();
