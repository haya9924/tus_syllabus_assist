(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }

  function parseCredits(text) {
    if (text == null) return 0;
    const m = String(text).replace(/[\s,]/g, "").match(/(\d+(?:\.\d+)?)/);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    return isNaN(v) ? 0 : v;
  }

  function refresh() {
    chrome.storage.local.get(["courses", "timetable", "gradeLinks"], (data) => {
      const courses = data.courses || {};
      const tt = data.timetable || {};
      const gl = data.gradeLinks || {};
      const planned = Object.values(courses).filter((c) => tt[c.classCode] && tt[c.classCode].planned);
      const total = planned.reduce((s, c) => s + parseCredits(c.credits), 0);
      $("tce-count").textContent = String(Object.keys(courses).length);
      $("tce-planned").textContent = String(planned.length);
      $("tce-credits").textContent = total.toFixed(1);
      $("tce-linked").textContent = String(Object.keys(gl).length);
    });
  }

  $("tce-open-dashboard").addEventListener("click", () => {
    const url = chrome.runtime.getURL("dashboard/dashboard.html");
    chrome.tabs.create({ url }, () => window.close());
  });

  $("tce-open-class").addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs.length) return;
      const tab = tabs[0];
      const url = tab && tab.url ? tab.url : "https://class.admin.tus.ac.jp/";
      chrome.tabs.create({ url }, () => window.close());
    });
  });

  function refreshSidebarToggle() {
    chrome.storage.local.get(["settings"], (data) => {
      const s = (data && data.settings && data.settings.sidebar) || {};
      $("tce-sidebar-toggle").checked = s.enabled !== false;
    });
  }

  $("tce-sidebar-toggle").addEventListener("change", (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.get(["settings"], (data) => {
      const settings = (data && data.settings) || {};
      settings.sidebar = Object.assign({}, settings.sidebar, { enabled });
      chrome.storage.local.set({ settings });
    });
  });

  chrome.storage.onChanged.addListener(refresh);
  refresh();
  refreshSidebarToggle();
})();
