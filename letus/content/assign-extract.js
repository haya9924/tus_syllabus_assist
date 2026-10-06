/* LETUS Assist - 課題ページからの情報抽出（assign.js と celebrate.js で共用） */
(function (g) {
  'use strict';

  const D = document;
  const DATE = g.LA_DATE;

  function id() {
    const m = location.search.match(/[?&]id=(\d+)/);
    return m ? m[1] : '';
  }

  function isAssignPage() {
    if (location.pathname.indexOf('/mod/assign/') === 0) return true;
    return !!D.querySelector('.submissionstatustable, .activity-information, [data-modtype="assign"]');
  }

  function activityName() {
    const info = D.querySelector('[data-region="activity-information"]');
    if (info && info.dataset.activityname) return info.dataset.activityname.trim();
    const crumb = D.querySelector('.breadcrumb-item [aria-current="page"]');
    if (crumb) return crumb.textContent.trim();
    const h = D.querySelector('#region-main h2, #region-main h1');
    return h ? h.textContent.trim() : D.title.replace(/\s*\|.*$/, '').trim();
  }

  function courseName() {
    const links = D.querySelectorAll('.breadcrumb-item a[href*="course/view.php"]');
    for (const a of links) {
      const t = (a.getAttribute('title') || a.textContent || '').trim();
      if (t) return t;
    }
    const header = D.querySelector('#course-header a[href*="course/view.php"]');
    return header ? (header.getAttribute('title') || header.textContent).trim() : '';
  }

  function sectionName() {
    const n = D.querySelector('.breadcrumb-item [data-section-name-for]');
    if (n) return n.textContent.trim();
    const a = D.querySelector('.breadcrumb-item a[href*="course/section.php"]');
    return a ? a.textContent.trim() : '';
  }

  const DUE_LABEL = /期限|締切|due|deadline/i;

  function dueText() {
    const dates = D.querySelector('[data-region="activity-dates"], .activity-dates');
    if (dates) {
      const kids = Array.from(dates.children);
      for (const n of kids) {
        const label = (n.querySelector('strong') ? n.querySelector('strong').textContent : '').trim();
        const value = n.textContent.replace(label, '').trim();
        if (/期限|due|deadline/i.test(label) || DUE_LABEL.test(value)) {
          const p = DATE.parseDueDate(value);
          if (p) return { text: value, parts: p, source: 'activity-dates' };
        }
      }
      for (const n of kids) {
        const value = n.textContent.trim();
        const p = DATE.parseDueDate(value);
        if (p) return { text: value, parts: p, source: 'activity-dates' };
      }
    }
    for (const th of D.querySelectorAll('th')) {
      const label = th.textContent.trim();
      if (!DUE_LABEL.test(label)) continue;
      const td = th.nextElementSibling;
      if (!td) continue;
      const p = DATE.parseDueDate(td.textContent);
      if (p) return { text: td.textContent.trim(), parts: p, source: 'table' };
    }
    return null;
  }

  /** 開始日時（activity-dates の「開始:」） */
  function startParts() {
    const dates = D.querySelector('[data-region="activity-dates"], .activity-dates');
    if (!dates) return null;
    for (const n of Array.from(dates.children)) {
      const label = (n.querySelector('strong') ? n.querySelector('strong').textContent : '').trim();
      if (/開始|start|opened/i.test(label)) {
        const p = DATE.parseDueDate(n.textContent.replace(label, '').trim());
        if (p) return p;
      }
    }
    return null;
  }

  /**
   * 提出ステータス。
   *  'submitted' | 'notsubmitted' | null
   */
  function status() {
    const table = D.querySelector('.submissionstatustable');
    if (table) {
      if (table.querySelector('.submissionstatussubmitted')) return 'submitted';
      const first = table.querySelector('td');
      if (first) {
        const t = first.textContent.trim();
        if (/提出済/.test(t) || /submitted/i.test(t)) return 'submitted';
        if (/未提出/.test(t) || /not submitted/i.test(t)) return 'notsubmitted';
      }
    }
    // 「提出を追加する」リンク or 提出フォームがあれば未提出
    if (D.querySelector('#id_submitbutton, input[name="submitbutton"], a[href*="action=editsubmission"]')) {
      return 'notsubmitted';
    }
    return null;
  }

  /** 全情報をまとめて取得 */
  function info() {
    const due = dueText();
    return {
      id: id(),
      name: activityName(),
      course: courseName(),
      section: sectionName(),
      dueParts: due ? due.parts : null,
      dueText: due ? due.text : '',
      startParts: startParts(),
      status: status(),
      url: location.href
    };
  }

  g.LA_ASSIGN = {
    id, isAssignPage,
    activityName, courseName, sectionName,
    dueText, startParts, status, info
  };
})(window);
