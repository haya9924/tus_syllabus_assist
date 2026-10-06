/* Font Awesome アイコン候補（LETUS が読み込んでいる FA と同じクラスをそのまま使う） */
(function (g) {
  'use strict';

  const ICONS = [
    { group: '講義・学問', items: [
      'fa-graduation-cap', 'fa-book-open', 'fa-book', 'fa-bookmark',
      'fa-university', 'fa-school', 'fa-flask', 'fa-vial', 'fa-microscope',
      'fa-atom', 'fa-calculator', 'fa-globe', 'fa-globe-asia', 'fa-language',
      'fa-pen-ruler', 'fa-ruler-combined', 'fa-compass-drafting', 'fa-brain',
      'fa-lightbulb', 'fa-puzzle-piece', 'fa-chalkboard-user', 'fa-chalkboard',
      'fa-square-root-variable', 'fa-sigma', 'fa-function'
    ]},
    { group: 'サイトニュース', items: [
      'fa-bullhorn', 'fa-bell', 'fa-bell-ring', 'fa-newspaper', 'fa-rss',
      'fa-envelope-open-text', 'fa-megaphone', 'fa-flag', 'fa-star',
      'fa-circle-info', 'fa-circle-exclamation', 'fa-triangle-exclamation',
      'fa-thumbtack', 'fa-comment', 'fa-comments', 'fa-users', 'fa-user-group'
    ]},
    { group: '状態', items: [
      'fa-check', 'fa-check-double', 'fa-circle-check', 'fa-circle-exclamation',
      'fa-circle-question', 'fa-circle-xmark', 'fa-hourglass-half',
      'fa-spinner', 'fa-fire', 'fa-snowflake'
    ]},
    { group: '学事・その他', items: [
      'fa-calendar', 'fa-calendar-days', 'fa-calendar-check', 'fa-clock',
      'fa-tasks', 'fa-list-check', 'fa-clipboard-list', 'fa-file-lines',
      'fa-file-pdf', 'fa-house', 'fa-building-columns', 'fa-briefcase',
      'fa-bus', 'fa-train', 'fa-bicycle', 'fa-person', 'fa-user-graduate',
      'fa-flask-vial', 'fa-code', 'fa-database', 'fa-wifi', 'fa-gear',
      'fa-gauge-high', 'fa-ranking-star', 'fa-trophy', 'fa-certificate',
      'fa-folder-open', 'fa-book-bookmark', 'fa-tags', 'fa-layer-group',
      'fa-diagram-project', 'fa-network-wired', 'fa-chart-line'
    ]}
  ];

  const FLAT = ICONS.reduce((acc, grp) => acc.concat(grp.items), []);

  g.LA_ICONS = ICONS;
  g.LA_ICON_FLAT = FLAT;
})(typeof globalThis !== 'undefined' ? globalThis : window);
