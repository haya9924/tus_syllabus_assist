// TUS CLASS Helper - Sidebar panel (CLASS pages, right side)
// 小さく薄い常駐タブ → 展開でミニ時間割＋追加講座一覧。ON/OFF・展開/縮小可。
// 追加はシラバス詳細からのみが方針のため、一覧にはシラバス取得済みのみ表示する。

(function () {
  "use strict";
  const P = window.TCE && window.TCE.parser;
  if (!P) return;
  const HOST = location.hostname;
  if (!HOST.includes("tus.ac.jp")) return;

  const DAYS = ["月", "火", "水", "木", "金", "土"];
  const PERIODS = 8;

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function dayPeriodsOf(c) {
    if (Array.isArray(c.dayPeriods) && c.dayPeriods.length) return c.dayPeriods;
    return P.parseDayPeriod(c.dayPeriodText || "");
  }

  async function getSidebarState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["settings"], (d) => {
        const s = (d && d.settings && d.settings.sidebar) || {};
        const size = P.normalizeSidebarSize(s);
        resolve({
          enabled: s.enabled !== false,
          expanded: !!s.expanded,
          plannedOnly: !!s.plannedOnly,
          panelWidth: size.panelWidth,
          fontScale: size.fontScale
        });
      });
    });
  }
  async function setSidebarState(patch) {
    const cur = await getSidebarState();
    const next = Object.assign({}, cur, patch);
    return new Promise((resolve) => {
      chrome.storage.local.get(["settings"], (d) => {
        const settings = (d && d.settings) || {};
        settings.sidebar = next;
        chrome.storage.local.set({ settings }, () => resolve(next));
      });
    });
  }

  function openDashboard() {
    try {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    } catch (e) { /* ignore */ }
  }

  async function render() {
    let root = document.getElementById("tce-sidepanel");
    if (!root) {
      root = document.createElement("div");
      root.id = "tce-sidepanel";
      document.body.appendChild(root);
    }
    const state = await getSidebarState();
    const [courses, tt, gl, weights] = await Promise.all([
      P.getCourses(), P.getTimetable(), P.getGradeLinks(), P.getScoreWeights()
    ]);
    // 基本データはシラバス取得済みのみ（成績のみは成績リンク画面でのみ扱う）
    const list = Object.values(courses)
      .filter((c) => P.isSyllabusComplete(c))
      .sort((a, b) => (a.classCode || "").localeCompare(b.classCode || ""));
    const planned = list.filter((c) => tt[c.classCode] && tt[c.classCode].planned);

    if (!state.enabled) {
      // OFF: 極小の薄いタブのみ残す
      root.innerHTML =
        `<div class="tce-sp-edge" id="tce-sp-edge" title="TUS Helper サイドバーを表示">▶</div>`;
      root.querySelector("#tce-sp-edge").addEventListener("click", async () => {
        await setSidebarState({ enabled: true, expanded: true });
        render();
      });
      return;
    }
    if (!state.expanded) {
      // 縮小: 細いタブ（件数付き）
      root.innerHTML =
        `<div class="tce-sp-tab" id="tce-sp-tab" title="クリックで展開（時間割・追加講座）">` +
        `<span class="tce-sp-tab-label">TUS</span>` +
        `<span class="tce-sp-tab-count">${list.length}</span>` +
        `</div>`;
      root.querySelector("#tce-sp-tab").addEventListener("click", async () => {
        await setSidebarState({ expanded: true });
        render();
      });
      return;
    }

    // 展開: ミニ時間割＋追加講座一覧
    let grid = `<table class="tce-sp-grid"><thead><tr><th></th>${DAYS.map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>`;
    for (let p = 1; p <= PERIODS; p++) {
      grid += `<tr><th>${p}</th>`;
      for (const day of DAYS) {
        const here = planned.filter((c) =>
          dayPeriodsOf(c).some((dp) => dp.day === day && dp.period === p));
        const conflict = here.length > 1;
        grid += `<td class="${conflict ? "tce-sp-conflict" : ""}">` + here.map((c) => {
          const g = c.publicGrades || gl[c.classCode] || {};
          const sc = P.computeGradeScore(g, weights);
          const tip = [c.nameJa, c.classCode, c.credits,
            sc != null ? `スコア ${sc.toFixed(2)}` : null,
            (c.memo || "").trim() ? `メモ: ${c.memo.trim()}` : null
          ].filter(Boolean).join("\n");
          return `<div class="tce-sp-block" data-code="${escapeHtml(c.classCode)}" title="${escapeHtml(tip)}">${escapeHtml(c.nameJa || c.classCode)}${(c.memo || "").trim() ? " 📝" : ""}</div>`;
        }).join("") + `</td>`;
      }
      grid += `</tr>`;
    }
    grid += `</tbody></table>`;

    const shown = state.plannedOnly ? planned : list;
    const items = shown.map((c) => {
      const g = c.publicGrades || gl[c.classCode] || {};
      const sc = P.computeGradeScore(g, weights);
      const memo = (c.memo || "").trim();
      return `<div class="tce-sp-course" data-code="${escapeHtml(c.classCode)}" title="クリックでダッシュボードを開く">` +
        `<div class="tce-sp-cname">${escapeHtml(c.nameJa || c.classCode)}</div>` +
        `<div class="tce-sp-cmeta">${escapeHtml(c.classCode || "")}` +
        `${c.credits ? ` / ${escapeHtml(c.credits)}` : ""}` +
        `${sc != null ? ` / スコア ${sc.toFixed(2)}` : ""}</div>` +
        `${memo ? `<div class="tce-sp-cmemo">${escapeHtml(memo)}</div>` : ""}` +
        `</div>`;
    }).join("");

    const panelStyle = `width:${state.panelWidth}px;zoom:${state.fontScale / 100};`;
    root.innerHTML =
      `<div class="tce-sp-panel" style="${panelStyle}">` +
      `<div class="tce-sp-head"><span>TUS Helper (${list.length})</span>` +
      `<span class="tce-sp-head-btns"><button id="tce-sp-collapse" title="縮小">«</button>` +
      `<button id="tce-sp-off" title="非表示（ポップアップから再表示可）">×</button></span></div>` +
      `<div class="tce-sp-sec">ミニ時間割（履修予定）</div>` +
      `<div class="tce-sp-gridwrap">${grid}</div>` +
      `<div class="tce-sp-sec">追加講座 <label class="tce-sp-filter"><input type="checkbox" id="tce-sp-planned-only"${state.plannedOnly ? " checked" : ""}>履修予定のみ</label></div>` +
      `<div class="tce-sp-list">${items || `<div class="tce-sp-empty">追加講座がありません</div>`}</div>` +
      `<div class="tce-sp-foot"><button id="tce-sp-open">ダッシュボードを開く</button></div>` +
      `</div>`;

    root.querySelector("#tce-sp-collapse").addEventListener("click", async (e) => {
      e.stopPropagation();
      await setSidebarState({ expanded: false });
      render();
    });
    root.querySelector("#tce-sp-off").addEventListener("click", async (e) => {
      e.stopPropagation();
      await setSidebarState({ enabled: false });
      render();
    });
    root.querySelector("#tce-sp-open").addEventListener("click", openDashboard);
    root.querySelector("#tce-sp-planned-only").addEventListener("change", async (e) => {
      await setSidebarState({ plannedOnly: e.target.checked });
      render();
    });
    root.querySelectorAll(".tce-sp-block[data-code], .tce-sp-course[data-code]").forEach((el) => {
      el.addEventListener("click", openDashboard);
    });
  }

  function init() {
    render();
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.courses || changes.timetable || changes.gradeLinks || changes.settings) {
          render();
        }
      });
    } catch (e) { /* ignore */ }
    // 定期再描画はしない（storage連動＋操作時再描画のみ）
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
