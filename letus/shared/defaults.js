/* 共有設定（content script / options ページ両方から読み込むグローバルスクリプト） */
(function (g) {
  'use strict';

  const STORAGE_KEY = 'letusAssist';
  const SCHEMA_VERSION = 8;

  const DEFAULTS = {
    top: {
      // サイトニュースとマイコースを入れ替えるか
      swap: true,
      // 配置モード
      //   'swap'      : サイトニュース と マイコース の位置を丸ごと入れ替える（既定）
      //   'both-main' : 両方メインカラム。マイコース -> サイトニュース の順。2 つの上下も入れ替え可能
      //   'native'    : LETUS 元の配置
      mode: 'swap',

      // メインカラム内での並び順（'both-main' で自由並べ替え可能）
      order: ['mycourses', 'sitenews'],

      // --- マイコース ---
      courseHeaderText: 'マイコース',
      courseFontSize: 22,        // 一覧の文字サイズ(px)
      courseHeaderFontSize: 26,   // 見出しの文字サイズ(px)
      courseTextColor: '#0f766e',
      courseHeaderColor: '#0f766e',
      courseBgColor: 'transparent',
      courseHoverColor: '#0b5f59',
      courseIcon: 'fa-graduation-cap',       // 一覧各項目のアイコン
      courseHeaderIcon: 'fa-book-open',      // 見出しのアイコン
      courseColumns: 2,          // 1〜4 段（56 コースでも縦に伸びないよう既定 2 段）
      courseAccent: '#0f766e',   // アクセント（見出しの上の罫線）
      showDragHandle: true,

      // --- サイトニュース ---
      newsHeaderText: 'サイトニュース',
      // サイドバーに移ったときは折りたためる（横にはみ出さないため）
      newsCollapsed: true,      newsFontSize: 15,
      newsHeaderFontSize: 20,
      newsTextColor: '#333333',
      newsHeaderColor: '#b45309',
      newsIcon: 'fa-bullhorn',
      newsHeaderIcon: 'fa-bullhorn',

      // 保存されるコース順（course ページ URL 配列）
      courseOrder: null,
      // 非表示にしたコース（course ページ URL 配列）。一覧から隠すが順番は保持される
      hiddenCourses: [],
      // コースごとの個別設定 { [courseHref]: { color?, icon?, name? } }
      courseStyles: {}
    },

    todo: {
      defaultService: 'google',        // 'google' | 'microsoft'
      googleTaskList: '@default',      // '@default' または tasklist の id
      titleTemplate: '[LETUS] {course} {name}',
      noteTemplate: '{url}',
      includeUrl: true,
      // 期限が無い課題ときの扱い: 'none'(設定しない) | 'plus1'(翌日) | 'plus3'(3日後) | 'endofweek'
      noDueFallback: 'plus1',
      timeZone: 'Asia/Tokyo',
      msClientId: '',
      msTenant: 'consumers',           // 'consumers'(個人) | 'common'
      msListName: 'Tasks',
      msReminder: true,
      reminderMinutesBefore: 60,
      showBothButtons: true
    },

    ui: {
      editMode: false
    },

    // 提出完了時の演出（パチンコ風）
    celebrate: {
      enabled: true,
      sound: true,
      autoCloseSec: 25,
      confetti: 380,
      // ストロボ（点滅）の強さ: 'off' | 'weak' | 'normal' | 'max'
      //   ※全画面の強い点滅は光過敏性発作の誘因になり得ます。体調に不安がある場合は off に。
      strobe: 'normal',
      // 演出全体の激しさ: 'off' | 'normal' | 'max'
      //   リール速度・リーチ回数・紙吹雪・音量・追加演出を制御（max は標準の約 2 倍）
      intensity: 'normal',
      // 大当たり時の背景（七色）: 'off' | 'normal' | 'max'
      //   回転する放射状の七色。max は高速回転＋色相回転＋逆回転の重ね（明滅はしない）
      rainbow: 'normal'
    },

    // 実績（XP / レベル / 連続提出日数）。ゲーム状態はここに永続化する
    game: {
      xp: 0,
      level: 1,
      streakDays: 0,
      bestStreak: 0,
      lastSubmitDate: '',
      totalSubmits: 0,
      totalFocusMinutes: 0,
      history: []
    }
  };

  function deepMerge(base, patch) {
    if (Array.isArray(patch) || patch === null || typeof patch !== 'object') {
      return patch === undefined ? base : patch;
    }
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const key of Object.keys(patch)) {
      const b = out[key];
      const p = patch[key];
      if (b && typeof b === 'object' && !Array.isArray(b) && p && typeof p === 'object' && !Array.isArray(p)) {
        out[key] = deepMerge(b, p);
      } else if (p !== undefined) {
        out[key] = p;
      }
    }
    return out;
  }

  /**
   * 旧バージョンからの移行。
   * v1 は「マイコースをページ最上部の全幅ヒーローに置く」中途半端な実装で、
   * ユーザーから「反転になっていない（すべての要素の最前列に来てしまう）」と指摘されたため
   * v2 で本位の「入れ替え（swap）」に戻す。旧 hero / swap のどちらも swap に寄せる。
   */
  function migrate(stored) {
    if (!stored || typeof stored !== 'object') return { changed: false, value: null };
    if (stored._v === SCHEMA_VERSION) return { changed: false, value: null };
    if (stored.top && (stored.top.mode === 'hero' || stored.top.mode === 'swap')) {
      stored.top.mode = 'swap';
      delete stored.top.courseMaxWidth;
      stored._v = SCHEMA_VERSION;
      return { changed: true, value: stored };
    }
    if (stored._v === undefined || stored._v < SCHEMA_VERSION) {
      stored._v = SCHEMA_VERSION;
      delete (stored.top || {}).courseMaxWidth;
      return { changed: true, value: stored };
    }
    return { changed: false, value: null };
  }

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (res) => {
        const stored = res && res[STORAGE_KEY];
        const mig = migrate(stored ? JSON.parse(JSON.stringify(stored)) : null);
        if (mig.changed) {
          const obj = {};
          obj[STORAGE_KEY] = mig.value;
          chrome.storage.local.set(obj, () => resolve(deepMerge(DEFAULTS, mig.value)));
        } else {
          resolve(deepMerge(DEFAULTS, stored));
        }
      });
    });
  }

  function setSettings(patch) {
    return new Promise((resolve) => {
      getSettings().then((current) => {
        const next = deepMerge(current, patch);
        const obj = {};
        obj[STORAGE_KEY] = next;
        chrome.storage.local.set(obj, () => resolve(next));
      });
    });
  }

  function resetSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(STORAGE_KEY, () => resolve(DEFAULTS));
    });
  }

  /**
   * top.courseStyles を「丸ごと置換」で保存する。
   * deepMerge では項目の削除ができないため、オブジェクトは全置換が必要。
   */
  function setCourseStyles(map) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (res) => {
        const cur = (res && res[STORAGE_KEY]) || {};
        const next = Object.assign({}, cur);
        next.top = Object.assign({}, cur.top, { courseStyles: map || {} });
        chrome.storage.local.set({ [STORAGE_KEY]: next }, () => resolve(next.top.courseStyles));
      });
    });
  }

  /** コース1件分の個別設定を更新する（patch=null で全解除／{color:null} で色だけ解除） */
  async function patchCourseStyle(href, patch) {
    if (!href) return null;
    const cur = await getSettings();
    const map = Object.assign({}, (cur.top && cur.top.courseStyles) || {});
    if (patch === null) {
      delete map[href];
      return setCourseStyles(map);
    }
    const entry = Object.assign({}, map[href] || {}, patch || {});
    for (const k of Object.keys(entry)) {
      if (entry[k] === null || entry[k] === '' || entry[k] === undefined) delete entry[k];
    }
    if (entry.color || entry.icon) map[href] = entry;
    else delete map[href];
    return setCourseStyles(map);
  }

  g.LA = {
    STORAGE_KEY, DEFAULTS, deepMerge,
    getSettings, setSettings, resetSettings,
    setCourseStyles, patchCourseStyle
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
