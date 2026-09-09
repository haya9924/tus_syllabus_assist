// TUS CLASS Helper - Content Script
// 検索結果行 / シラバス拡大 / 成績公開行 にボタンを注入

(function () {
  "use strict";
  const P = window.TCE && window.TCE.parser;
  if (!P) return;

  const HOST = location.hostname;
  if (!/(\.|^)tus\.ac\.jp$/.test(HOST) && !/\.admin\.tus\.ac\.jp$/.test(HOST) && !/class\.admin\.tus\.ac\.jp$/.test(HOST)) {
    // 対象ホストでなければ何もしない（manifestで絞っているが念のため）
    if (!HOST.includes("tus.ac.jp")) return;
  }

  // ---- Toast ----
  let toastEl = null;
  let toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "tce-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("tce-toast-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("tce-toast-show");
    }, 2200);
  }

  // ---- 1. テーブル特定ヘルパー ----
  // 追加はシラバス詳細ダイアログからのみ行う方針（一覧画面からは不完全な情報しか取れないため）。
  // 一覧画面では成績リンク・スコア列のみを提供する。
  function tableOf(tbody) {
    if (!tbody) return null;
    if (tbody.id === "funcForm:table") return tbody;
    return tbody.closest("#funcForm\\:table") || document.getElementById("funcForm:table");
  }

  // ---- 2. シラバス拡大ダイアログに追加ボタン ----
  // 対象: #pkx02301:dialog 表示時 / #pkx02301:ch:table
  // 方針: 成績照会ページで開いた詳細には追加ボタンを出さない（追加はシラバス照会側の詳細からのみ）
  function injectSyllabusActionButton() {
    if (isPublicGradeTable()) return;
    const dialog = document.getElementById("pkx02301:dialog");
    if (!dialog) return;
    const table = dialog.querySelector("#pkx02301\\:ch\\:table");
    if (!table) return; // まだロード中
    const actionSpan = dialog.querySelector(".print .btnNewLocation1");
    if (!actionSpan) return;

    const parsed = P.parseSyllabusTable(table);
    const classCode = parsed.classCode || "";

    // 科目切替（AJAX再描画で中身だけ変わる）に対応: 既存ボタンとコードが違えば作り直す。
    // 存在確認〜挿入までを同期的に行う（非同期待ちを挟むとObserver再発火で二重化するため）。
    const existing = actionSpan.querySelector("button.tce-syllabus-action");
    if (existing) {
      if (!classCode || existing.dataset.code === classCode) return;
      existing.remove();
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tce-syllabus-action";
    btn.dataset.code = classCode;
    btn.textContent = "+ 追加";
    btn.title = "このシラバスを拡張機能に追加";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = P.parseSyllabusTable(table);
      if (!t.classCode) {
        toast("授業コードが取得できませんでした");
        return;
      }
      const [courses, gradeRows, links, weights] = await Promise.all([
        P.getCourses(), P.getGradeRows(), P.getGradeLinks(), P.getScoreWeights()
      ]);
      const existing = courses[t.classCode];
      // 未接続の明示保存成績があれば同時リンクする（追加ボタン一発で完了させる）
      const linkedKeys = new Set();
      Object.values(links).forEach((l) => {
        if (l && l.sourceRow && l.sourceRow.classCode) linkedKeys.add(l.sourceRow.classCode);
      });
      const row = gradeRows[t.classCode];
      const unlinkedRow = (row && row.pinned && !linkedKeys.has(row.classCode)) ? row : null;
      const g = unlinkedRow ? (unlinkedRow.grades || {}) : null;
      // 統一追加ではリンクも同時実行するため、両側タグを付ける（saveCourse側で和集合マージ）
      t.sources = g ? ["syllabus", "grade"] : ["syllabus"];
      if (g) {
        const score = unlinkedRow.score != null ? unlinkedRow.score : P.computeGradeScore(g, weights);
        await P.saveGradeLink(t.classCode, Object.assign({}, g, {
          score, sourceRow: { classCode: unlinkedRow.classCode, nameJa: unlinkedRow.nameJa }
        }));
        t.publicGrades = g;
      } else if (existing && existing.publicGrades) {
        // 既存があれば search 由来の公開成績を保持してマージ
        t.publicGrades = existing.publicGrades;
      }
      t.addedVia = "syllabus";
      const ok = await P.saveCourse(t);
      if (ok) {
        btn.classList.add("tce-added");
        btn.textContent = `追加済み✓ (${t.classCode})`;
        btn.disabled = true;
        // 注意書きは不要になるため即時除去（storage連動でも消える）
        const noteEl = actionSpan.querySelector("span.tce-mini-note");
        if (noteEl) noteEl.remove();
        toast(g
          ? `${t.nameJa || t.classCode} のシラバスを追加し、成績をリンクしました`
          : `${t.nameJa || t.classCode} のシラバスを追加しました`);
      }
    });

    // 挿入は同期的に行う（ここで非同期待ちを挟むと二重化の原因になる）
    const fusen = actionSpan.querySelector("#pkx02301\\:ch\\:j_idt367");
    if (fusen) actionSpan.insertBefore(btn, fusen);
    else actionSpan.appendChild(btn);

    // 保存状態の反映だけ非同期で行う（ボタンの重複挿入は起きない）
    updateDialogState(actionSpan, table, btn, classCode, parsed);
  }

  // ダイアログ内の追加ボタン状態・注意書き・リンクボタンを最新化（冪等）。
  // 注意書き：成績側にデータがありシラバス側が未完了の場合に表示。
  // リンクボタン：一致（未接続の明示保存成績あり）の場合のみ表示し、候補モーダルを開く。
  function updateDialogState(actionSpan, table, btn, classCode, parsed) {
    Promise.all([P.getCourses(), P.getGradeRows(), P.getGradeLinks()]).then(([courses, gradeRows, links]) => {
      if (!btn.isConnected || !actionSpan.isConnected) return;
      // 解決待ちの間に別科目へ切り替わっていたら作り直しに任せる
      const currentCode = (P.parseSyllabusTable(table).classCode || "");
      if (currentCode !== classCode) {
        injectSyllabusActionButton();
        return;
      }
      const ex = classCode ? courses[classCode] : null;
      const exSources = P.getSources(ex);
      const syllabusDone = !!ex && (exSources.length === 0 || exSources.includes("syllabus"));
      const pinnedRows = classCode
        ? Object.values(gradeRows).filter((r) => r && r.classCode === classCode && r.pinned)
        : [];
      const linkedKeys = new Set();
      Object.values(links).forEach((l) => {
        if (l && l.sourceRow && l.sourceRow.classCode) linkedKeys.add(l.sourceRow.classCode);
      });
      const unlinkedPinned = pinnedRows.filter((r) => !linkedKeys.has(r.classCode));
      const gradeDone = exSources.includes("grade") || pinnedRows.length > 0;
      // 追加ボタンの状態（絶対指定で冪等に）
      btn.classList.remove("tce-added");
      btn.disabled = false;
      if (syllabusDone) {
        btn.classList.add("tce-added");
        btn.textContent = `追加済み✓ (${classCode})`;
        btn.title = "";
        btn.disabled = true;
      } else if (ex) {
        btn.textContent = "+ 追加";
        btn.title = "成績分布側で追加済みです。このシラバス詳細も追加します（未接続の成績があれば同時にリンク）";
      } else {
        btn.textContent = "+ 追加";
        btn.title = "このシラバスを拡張機能に追加（未接続の成績があれば同時にリンク）";
      }
      // 注意書き・リンクボタンは毎回作り直す（ダイアログ再描画で消えるため）
      actionSpan.querySelectorAll("span.tce-mini-note, button.tce-dialog-link").forEach((el) => el.remove());
      if (classCode && gradeDone && !syllabusDone) {
        const note = document.createElement("span");
        note.className = "tce-mini-note";
        note.textContent = "成績分布側ですでに追加されています";
        if (btn.nextSibling) actionSpan.insertBefore(note, btn.nextSibling);
        else actionSpan.appendChild(note);
      }
      if (classCode && unlinkedPinned.length) {
        const linkBtn = document.createElement("button");
        linkBtn.type = "button";
        linkBtn.className = "tce-dialog-link";
        linkBtn.dataset.code = classCode;
        linkBtn.textContent = "成績をリンク";
        linkBtn.title = "保存した成績データをこの授業に紐付けます（シラバス詳細も同時に保存）";
        linkBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const label = (ex && ex.nameJa) ||
            (unlinkedPinned[0] && unlinkedPinned[0].nameJa) ||
            (parsed && parsed.nameJa) || classCode;
          openGradeCandidatePicker(linkBtn, table, classCode, label);
        });
        actionSpan.appendChild(linkBtn);
      }
    });
  }

  function watchSyllabusDialog() {
    const tryInject = () => {
      injectSyllabusActionButton();
    };
    tryInject();
    // ダイアログ出現・AJAX再描画（別科目を開くと中身だけ差し替わる）を監視
    const obs = new MutationObserver(() => tryInject());
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    // 保存内容の変更後にダイアログ表示を最新化
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (!(changes.courses || changes.gradeRows || changes.gradeLinks)) return;
        const dialog = document.getElementById("pkx02301:dialog");
        if (!dialog) return;
        const table = dialog.querySelector("#pkx02301\\:ch\\:table");
        const actionSpan = dialog.querySelector(".print .btnNewLocation1");
        if (!table || !actionSpan) return;
        const btn = actionSpan.querySelector("button.tce-syllabus-action");
        if (!btn || !btn.dataset.code) {
          injectSyllabusActionButton();
          return;
        }
        const parsed = P.parseSyllabusTable(table);
        updateDialogState(actionSpan, table, btn, btn.dataset.code, parsed);
      });
    } catch (e) { /* ignore */ }
  }

  // ---- 3. 成績評価公開授業照会の行に「リンク」ボタン + スコア表示・ソート ----
  // 対象: #funcForm:table_data (検索結果と同じテーブル)
  // 見出しに S評価 があれば成績表と判定（h2「成績評価公開授業照会」とのOR）
  function isPublicGradeTable() {
    const h = document.querySelector("h2");
    if (h && /成績評価公開授業照会/.test(h.textContent)) return true;
    const tbl = document.getElementById("funcForm:table");
    if (tbl && P.isGradeHeaders(P.getTableHeaders(tbl))) return true;
    return false;
  }

  function readGradeCells(tds) {
    return {
      count: P.parsePercent(tds[6].textContent),
      s: P.parsePercent(tds[7].textContent),
      a: P.parsePercent(tds[8].textContent),
      b: P.parsePercent(tds[9].textContent),
      c: P.parsePercent(tds[10].textContent),
      d: P.parsePercent(tds[11].textContent)
    };
  }

  // ---- 一覧行の保存済み注意表示 ----
  // 追加ボタンは出さない（一覧からは不完全な情報しか取れないため）。
  // 授業コードで成績分布側とシラバス側の同一性を確認し、保存済みでも
  // 当該側が未完了の場合のみ、ボタンより一回り小さい注意書きを出す。
  function injectSavedNotes(tbody, side) {
    if (!tbody) return;
    const rows = tbody.querySelectorAll("tr[data-ri]");
    if (!rows.length) return;
    const table = tableOf(tbody);
    const headers = P.getTableHeaders(table);
    const isGrade = P.isGradeHeaders(headers);
    Promise.all([P.getCourses(), P.getGradeRows()]).then(([courses, gradeRows]) => {
      rows.forEach((tr) => {
        const anchor = P.findNameAnchor(tr);
        if (!anchor) return;
        const course = isGrade ? P.parseSearchRow(tr) : P.parseSyllabusSearchRow(tr, headers);
        if (!course || !course.classCode) return;
        const code = course.classCode;
        const cell = anchor.closest("td") || anchor.parentElement;
        const existingNote = cell.querySelector("span.tce-mini-note");
        const savedCourse = courses[code];
        // 「＋成績追加」の明示保存（pinned）も成績側の登録とみなす。
        // ※courses を見ないと、一覧からは授業を作らない方針のため注意書きが出ない不具合があった
        const pinnedRow = gradeRows[code] && gradeRows[code].pinned ? gradeRows[code] : null;
        if (!savedCourse && !pinnedRow) {
          if (existingNote) existingNote.remove();
          return;
        }
        const sources = P.getSources(savedCourse);
        if (savedCourse && sources.length === 0) {
          // 側不明の旧データ: 従来通り何も出さない
          if (existingNote) existingNote.remove();
          return;
        }
        const syllabusDone = sources.includes("syllabus");
        const gradeDone = sources.includes("grade") || !!pinnedRow;
        const showNote = side === "syllabus" ? (gradeDone && !syllabusDone) : (syllabusDone && !gradeDone);
        if (!showNote) {
          if (existingNote) existingNote.remove();
          return;
        }
        if (existingNote) return;
        // 一覧の注意書きは文字表示のみ。リンク操作は詳細ダイアログ・ダッシュボードで行う
        const note = document.createElement("span");
        note.className = "tce-mini-note";
        note.textContent = side === "grade"
          ? "シラバス側ですでに追加されています"
          : "成績分布側ですでに追加されています";
        cell.appendChild(note);
      });
    });
  }

  function watchSavedNotes() {
    // シラバス照会など成績表以外の一覧を対象（成績表は injectGradeLinkButtons 側で処理）
    const tryInit = () => {
      document.querySelectorAll("#funcForm\\:table_data").forEach((tbody) => {
        const table = tableOf(tbody);
        if (table && P.isGradeHeaders(P.getTableHeaders(table))) return;
        injectSavedNotes(tbody, "syllabus");
      });
    };
    tryInit();
    const obs = new MutationObserver(() => tryInit());
    obs.observe(document.body, { childList: true, subtree: true });
    // PrimeFacesの描画タイミングの取りこぼしに備えて定期再スキャン（冪等なので安全）
    setInterval(() => { try { tryInit(); } catch (e) { /* ignore */ } }, 2000);
    // 別タブでの追加・削除にも追従（成績データの明示追加も対象）
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && (changes.courses || changes.gradeRows)) tryInit();
      });
    } catch (e) { /* ignore */ }
  }

  // 成績一覧の行ボタンは状態で切り替える（保存済み→リンク／未保存→成績追加のみ）。
  // 状態キー tr.dataset.tceAction が変わったときだけ作り直す（Observerループ防止）。
  function refreshGradeRowButton(tr, cell, st) {
    const key = st.kind + ":" + (st.linked ? "1" : "0");
    if (tr.dataset.tceAction === key) return;
    tr.dataset.tceAction = key;
    cell.querySelectorAll("button.tce-btn").forEach((b) => b.remove());
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.marginLeft = "4px";
    if (st.kind === "link") {
      btn.className = "tce-btn tce-link" + (st.linked ? " tce-linked" : "");
      btn.textContent = st.linked ? "成績リンク済" : "成績をリンク";
      btn.title = st.linked
        ? "クリックでリンク先の選択・編集"
        : "この行の成績分布を保存済み授業に手動で紐付けます";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLinkPicker(btn, { classCode: st.classCode, nameJa: st.nameJa, grades: st.grades });
      });
    } else if (st.kind === "add") {
      btn.className = "tce-btn tce-grade-add";
      btn.textContent = "＋成績追加";
      btn.title = "この行の成績分布を成績リンク用に保存します（シラバス比較には追加しません）";
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const weights = await P.getScoreWeights();
        const score = P.computeGradeScore(st.grades, weights);
        await P.saveGradeRows({
          [st.classCode]: {
            classCode: st.classCode, nameJa: st.nameJa, grades: st.grades, score,
            yearSemester: st.yearSemester, pinned: true, pinnedAt: Date.now(), scrapedAt: Date.now()
          }
        });
        refreshGradeRowButton(tr, cell, Object.assign({}, st, { kind: "added" }));
        toast(`${st.nameJa || st.classCode} の成績を保存しました`);
      });
    } else {
      // added: 明示追加済み（シラバス比較には追加しない）
      btn.className = "tce-btn tce-added";
      btn.textContent = "成績保存済み";
      btn.title = "成績リンク用に保存済みです。ダッシュボードの成績タブから紐付けできます";
      btn.disabled = true;
    }
    cell.appendChild(btn);
  }

  function injectGradeLinkButtons(tbody) {
    if (!tbody) return;
    if (!isPublicGradeTable()) return;
    const table = tableOf(tbody);
    if (table && !P.isGradeHeaders(P.getTableHeaders(table))) return;
    const rows = tbody.querySelectorAll("tr[data-ri]");
    if (!rows.length) return;
    Promise.all([P.getGradeLinks(), P.getScoreWeights(), P.getCourses(), P.getGradeRows()]).then(([links, weights, courses, savedRows]) => {
      const gradeRows = {};
      let hasNewRows = false;
      rows.forEach((tr) => {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 12) return;
        const classCode = tds[2].textContent.trim();
        const nameJa = (tds[3].querySelector("a") || tds[3]).textContent.trim();
        if (!classCode) return;
        const grades = readGradeCells(tds);
        const score = P.computeGradeScore(grades, weights);
        // 同一値の再書き込みは MutationObserver を再発火させるためガードする
        const scoreStr = score == null ? "" : String(score);
        if (tr.dataset.tceScore !== scoreStr) tr.dataset.tceScore = scoreStr;
        // スコア列のセルを設置・更新（成績評価状況の横の列）
        let scoreCell = tr.querySelector("td.tce-score-cell");
        if (!scoreCell) {
          scoreCell = document.createElement("td");
          scoreCell.className = "tce-score-cell";
          scoreCell.title = "成績分布からの算出スコア（S=5/A=4/B=3/C=2/D=0、設定で変更可）";
          tr.appendChild(scoreCell);
        }
        const wantScore = score == null ? "-" : score.toFixed(2);
        if (scoreCell.textContent !== wantScore) scoreCell.textContent = wantScore;
        // ダッシュボードの接続先一覧用に候補を保存（表示中の文言だけを使う）
        gradeRows[classCode] = {
          classCode, nameJa, grades, score,
          yearSemester: tds[1].textContent.trim(),
          scrapedAt: Date.now()
        };
        ensureScoreColumn(table, tbody);
        const cell = tds[3];
        if (courses[classCode]) {
          // シラバス参照ですでに追加済み → リンクボタン
          refreshGradeRowButton(tr, cell, {
            kind: "link", linked: !!links[classCode],
            classCode, nameJa, grades
          });
        } else if (savedRows[classCode] && savedRows[classCode].pinned) {
          // 成績リンク用に明示追加済み（シラバス比較には追加しない）
          refreshGradeRowButton(tr, cell, { kind: "added", linked: false });
        } else {
          // 未保存 → 成績リンク用のみ追加
          refreshGradeRowButton(tr, cell, {
            kind: "add", linked: false,
            classCode, nameJa, grades,
            yearSemester: tds[1].textContent.trim()
          });
        }
        if (!tr.dataset.tceLinkInjected) {
          hasNewRows = true;
          tr.dataset.tceLinkInjected = "1";
        }
      });
      // 新規行があるときだけ保存（定期再スキャンでの書き込みループ防止）
      if (hasNewRows && Object.keys(gradeRows).length) P.saveGradeRows(gradeRows);
      ensureGradeSortBar(table, tbody);
      injectSavedNotes(tbody, "grade");
    });
  }

  // スコア順ソート（表示中の行だけ）。元の順序は WeakMap に保持
  const originalOrderMap = new WeakMap();
  const scoreSortedMap = new WeakMap();
  function rowScore(tr) {
    if (!tr.dataset.tceScore) return -Infinity;
    const v = parseFloat(tr.dataset.tceScore);
    return isNaN(v) ? -Infinity : v;
  }
  function snapshotOrder(tbody) {
    if (!originalOrderMap.has(tbody)) {
      originalOrderMap.set(tbody, Array.from(tbody.querySelectorAll("tr[data-ri]")));
    }
  }
  function sortScoreDesc(tbody) {
    if (!tbody) return;
    snapshotOrder(tbody);
    const arr = Array.from(tbody.querySelectorAll("tr[data-ri]"));
    arr.sort((a, b) => rowScore(b) - rowScore(a));
    arr.forEach((tr) => tbody.appendChild(tr));
    scoreSortedMap.set(tbody, true);
  }
  function restoreOrder(tbody) {
    if (!tbody) return;
    const orig = originalOrderMap.get(tbody);
    if (orig) orig.forEach((tr) => tbody.appendChild(tr));
    scoreSortedMap.set(tbody, false);
  }
  function toggleScoreSort(tbody) {
    if (scoreSortedMap.get(tbody)) {
      restoreOrder(tbody);
      toast("元の順序に戻しました");
    } else {
      sortScoreDesc(tbody);
      toast("スコアの高い順に並べ替えました");
    }
  }

  // 成績評価状況の横にスコア列（th/td）を追加する
  function ensureScoreColumn(table, tbody) {
    if (!table) return;
    const thead = table.querySelector("thead");
    if (!thead) return;
    const headRows = thead.querySelectorAll("tr");
    if (!headRows.length) return;
    if (thead.querySelector("th.tce-score-head")) return;
    const firstRow = headRows[0];
    const ths = firstRow.querySelectorAll("th");
    let anchorTh = null;
    ths.forEach((th) => {
      if (th.getAttribute("colspan") === "5" || /成績評価状況/.test(th.textContent)) anchorTh = th;
    });
    const scoreTh = document.createElement("th");
    scoreTh.className = "tce-score-head";
    scoreTh.setAttribute("rowspan", "2");
    scoreTh.textContent = "スコア";
    scoreTh.title = "成績分布からの算出スコア（S=5/A=4/B=3/C=2/D=0）。クリックで降順ソート⇔元に戻す";
    scoreTh.style.cursor = "pointer";
    scoreTh.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleScoreSort(tbody);
    });
    if (anchorTh && anchorTh.nextSibling) firstRow.insertBefore(scoreTh, anchorTh.nextSibling);
    else firstRow.appendChild(scoreTh);
  }

  // 成績表の上にソートバーを設置（表示中の行だけをスコア降順/元順序で並べ替え）
  function ensureGradeSortBar(table, tbody) {
    if (!table || !tbody) return;
    if (table.parentElement.querySelector(":scope > .tce-sortbar")) return;
    const bar = document.createElement("div");
    bar.className = "tce-sortbar";
    const label = document.createElement("span");
    label.className = "tce-sortbar-label";
    label.textContent = "TUS Helper: 表示中の行を";
    const btnDesc = document.createElement("button");
    btnDesc.type = "button";
    btnDesc.className = "tce-btn";
    btnDesc.textContent = "スコア降順に並べ替え";
    const btnOrig = document.createElement("button");
    btnOrig.type = "button";
    btnOrig.className = "tce-btn tce-link";
    btnOrig.textContent = "元の順序に戻す";
    const note = document.createElement("span");
    note.className = "tce-sortbar-note";
    note.textContent = "※現在表示中のページ内のみ（スコア列ヘッダーのクリックでも切替可）";
    btnDesc.addEventListener("click", (e) => {
      e.preventDefault();
      sortScoreDesc(tbody);
      toast("スコアの高い順に並べ替えました");
    });
    btnOrig.addEventListener("click", (e) => {
      e.preventDefault();
      restoreOrder(tbody);
    });
    bar.appendChild(label);
    bar.appendChild(btnDesc);
    bar.appendChild(btnOrig);
    bar.appendChild(note);
    table.parentElement.insertBefore(bar, table);
  }

  function watchPublicGradeTable() {
    const tryInit = () => {
      if (!isPublicGradeTable()) return;
      document.querySelectorAll("#funcForm\\:table_data").forEach(injectGradeLinkButtons);
    };
    tryInit();
    const obs = new MutationObserver(() => tryInit());
    obs.observe(document.body, { childList: true, subtree: true });
    setInterval(() => { try { tryInit(); } catch (e) { /* ignore */ } }, 2000);
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && (changes.courses || changes.gradeLinks || changes.gradeRows)) tryInit();
      });
    } catch (e) { /* ignore */ }
    document.querySelectorAll("#funcForm\\:table").forEach((tbl) => {
      const o2 = new MutationObserver(() => {
        const tbody = tbl.querySelector("#funcForm\\:table_data");
        if (tbody) injectGradeLinkButtons(tbody);
      });
      o2.observe(tbl, { childList: true, subtree: true });
    });
  }

  // ---- 共通: リンク先選択ピッカー ----
  // 方針: 追加はシラバス詳細ダイアログからのみ（一覧からは不完全な情報しか取れないため）。
  // ここでは保存済み授業への紐付けだけ行い、新規作成はしない。
  function openLinkPicker(anchorBtn, opts) {
    closePicker();
    const picker = document.createElement("div");
    picker.className = "tce-picker";
    picker.id = "tce-picker";
    const rect = anchorBtn.getBoundingClientRect();
    picker.style.top = (window.scrollY + rect.bottom + 4) + "px";
    picker.style.left = (window.scrollX + rect.left) + "px";

    const h = document.createElement("h4");
    h.textContent = `「${opts.nameJa}」に紐づける保存済み授業を選択`;
    picker.appendChild(h);

    const search = document.createElement("input");
    search.className = "tce-picker-search";
    search.placeholder = "授業コード・科目名で絞り込み";
    picker.appendChild(search);

    const ul = document.createElement("ul");
    picker.appendChild(ul);

    const actionRow = document.createElement("div");
    actionRow.className = "tce-picker-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "閉じる";
    cancelBtn.addEventListener("click", closePicker);
    actionRow.appendChild(cancelBtn);
    picker.appendChild(actionRow);

    document.body.appendChild(picker);

    async function linkTo(classCode) {
      const weights = await P.getScoreWeights();
      const score = P.computeGradeScore(opts.grades, weights);
      await P.saveGradeLink(classCode, Object.assign({}, opts.grades, { score, sourceRow: { classCode: opts.classCode, nameJa: opts.nameJa } }));
      await P.saveGradeRows({ [opts.classCode]: { classCode: opts.classCode, nameJa: opts.nameJa, grades: opts.grades, score, scrapedAt: Date.now() } });
      // リンク先コースにも成績を統合
      await P.saveCourse({ classCode, publicGrades: opts.grades, sources: ["grade"] });
      anchorBtn.classList.add("tce-linked");
      anchorBtn.classList.remove("tce-link");
      anchorBtn.textContent = "成績リンク済";
      // 当該側が完了したので注意書きがあれば消す
      const row = anchorBtn.closest("tr");
      const noteEl = row && row.querySelector("span.tce-mini-note");
      if (noteEl) noteEl.remove();
      toast(`${opts.nameJa} → ${classCode} に成績分布を保存しました`);
      closePicker();
    }

    function render(list) {
      ul.innerHTML = "";
      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "tce-empty";
        empty.textContent = "保存済みの授業がありません。先にシラバス詳細画面で追加してください。";
        ul.appendChild(empty);
        return;
      }
      list.forEach((c) => {
        const li = document.createElement("li");
        const meta = [c.classCode, c.yearSemester, c.dayPeriodText].filter(Boolean).join(" / ");
        const incomplete = P.isSyllabusComplete(c) ? "" : "（詳細未取得）";
        li.innerHTML = `<div>${escapeHtml(c.nameJa || c.classCode)}${escapeHtml(incomplete)}</div><div class="tce-picker-meta">${escapeHtml(meta)}</div>`;
        li.title = "クリックでこの授業に紐付けます";
        li.addEventListener("click", () => linkTo(c.classCode));
        ul.appendChild(li);
      });
    }

    P.getCourses().then((courses) => {
      render(Object.values(courses));
    });

    search.addEventListener("input", () => {
      const q = search.value.toLowerCase().trim();
      P.getCourses().then((courses) => {
        const all = Object.values(courses);
        render(q
          ? all.filter((c) => (c.nameJa || "").toLowerCase().includes(q) || (c.classCode || "").toLowerCase().includes(q))
          : all);
      });
    });

    // 外側クリックで閉じる
    setTimeout(() => {
      document.addEventListener("mousedown", outsideClickClose, true);
    }, 0);
  }

  // シラバス詳細ダイアログのリンクボタンから開く成績候補モーダル。
  // 成績照会で追加した候補（分布・スコア付き）を出し、選択で
  // シラバス詳細の全項目保存と同時にその候補をリンクする。
  function openGradeCandidatePicker(anchorEl, table, classCode, nameJa) {
    closePicker();
    const picker = document.createElement("div");
    picker.className = "tce-picker";
    picker.id = "tce-picker";
    const rect = anchorEl.getBoundingClientRect();
    picker.style.top = (window.scrollY + rect.bottom + 4) + "px";
    picker.style.left = (window.scrollX + rect.left) + "px";

    const h = document.createElement("h4");
    h.textContent = `「${nameJa}」の成績データ候補`;
    picker.appendChild(h);

    const ul = document.createElement("ul");
    picker.appendChild(ul);

    const actionRow = document.createElement("div");
    actionRow.className = "tce-picker-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "閉じる";
    cancelBtn.addEventListener("click", closePicker);
    actionRow.appendChild(cancelBtn);
    picker.appendChild(actionRow);

    document.body.appendChild(picker);

    function fmtGrades(g) {
      g = g || {};
      const f = (v) => (v == null ? "-" : v);
      return `S:${f(g.s)}% A:${f(g.a)}% B:${f(g.b)}% C:${f(g.c)}% D:${f(g.d)}%${g.count != null ? ` (n=${g.count})` : ""}`;
    }

    async function doLink(item) {
      // 選択時点で詳細を再取得（別科目へ切り替わっていたら中止）
      const t = P.parseSyllabusTable(table);
      if (!t.classCode || t.classCode !== classCode) {
        toast("表示中のシラバスが切り替わりました");
        closePicker();
        return;
      }
      const weights = await P.getScoreWeights();
      const g = item.grades || {};
      const score = item.score != null ? item.score : P.computeGradeScore(g, weights);
      await P.saveGradeLink(classCode, Object.assign({}, g, {
        score, sourceRow: { classCode: item.classCode, nameJa: item.nameJa }
      }));
      const existing = (await P.getCourses())[classCode];
      if (existing && existing.publicGrades && !(g.s != null || g.a != null || g.b != null || g.c != null || g.d != null)) {
        t.publicGrades = existing.publicGrades;
      } else {
        t.publicGrades = g;
      }
      t.addedVia = "syllabus";
      t.sources = ["syllabus", "grade"];
      const ok = await P.saveCourse(t);
      if (ok) {
        toast(`${t.nameJa || t.classCode} のシラバスを追加し、成績をリンクしました`);
      }
      closePicker();
    }

    Promise.all([P.getGradeRows(), P.getCourses(), P.getGradeLinks(), P.getScoreWeights()]).then(([gradeRows, courses, links, weights]) => {
      if (!document.getElementById("tce-picker")) return;
      const linkedKeys = new Set();
      Object.values(links).forEach((l) => {
        if (l && l.sourceRow && l.sourceRow.classCode) linkedKeys.add(l.sourceRow.classCode);
      });
      const items = [];
      Object.values(gradeRows).forEach((r) => {
        if (r && r.classCode === classCode && r.pinned && !linkedKeys.has(r.classCode)) items.push(r);
      });
      const c = courses[classCode];
      if (c && c.publicGrades && !items.some((it) => it.classCode === classCode) && !links[classCode]) {
        items.push({ classCode, nameJa: c.nameJa, grades: c.publicGrades, score: null, fromCourse: true });
      }
      ul.innerHTML = "";
      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "tce-empty";
        empty.textContent = "リンク可能な成績データがありません。成績照会の一覧で「＋成績追加」を押してください。";
        ul.appendChild(empty);
        return;
      }
      items.forEach((item) => {
        const g = item.grades || {};
        const sc = item.score != null ? item.score : P.computeGradeScore(g, weights);
        const li = document.createElement("li");
        const meta = [item.classCode, item.yearSemester].filter(Boolean).join(" / ");
        li.innerHTML = `<div>${escapeHtml(item.nameJa || item.classCode)}</div>` +
          (meta ? `<div class="tce-picker-meta">${escapeHtml(meta)}</div>` : "") +
          `<div class="tce-picker-grades">${escapeHtml(fmtGrades(g))}${sc != null ? ` / スコア ${sc.toFixed(2)}` : ""}</div>`;
        const linkBtn = document.createElement("button");
        linkBtn.type = "button";
        linkBtn.textContent = "リンク";
        linkBtn.addEventListener("click", (e) => { e.stopPropagation(); doLink(item); });
        li.appendChild(linkBtn);
        ul.appendChild(li);
      });
    });

    setTimeout(() => {
      document.addEventListener("mousedown", outsideClickClose, true);
    }, 0);
  }

  function outsideClickClose(e) {
    const p = document.getElementById("tce-picker");
    if (p && !p.contains(e.target)) closePicker();
  }
  function closePicker() {
    const p = document.getElementById("tce-picker");
    if (p) p.remove();
    document.removeEventListener("mousedown", outsideClickClose, true);
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- Init ----
  function init() {
    watchSyllabusDialog();
    watchPublicGradeTable();
    watchSavedNotes();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
