/* 日時パース / タイムゾーン変換（content script と options ページ共通のグローバルスクリプト） */
(function (g) {
  'use strict';

  /**
   * LETUS(Moodle) の日本語表記から期限を抽出する。
   * 例: "期限: 2026年 09月 22日(火曜日) 17:00" / "提出期限 2026年9月22日 17:00"
   * 英語ロケール: "Due: Tuesday, 22 September 2026 17:00"
   */
  function parseDueDate(text) {
    if (!text) return null;
    const s = String(text).replace(/\s+/g, ' ').trim();

    // 1) ja: 2026年 09月 22日
    let m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (m) {
      const t = s.match(/(\d{1,2})\s*[:時]\s*(\d{2})/);
      return {
        year: +m[1], month: +m[2], day: +m[3],
        hour: t ? +t[1] : 23, minute: t ? +t[2] : 59,
        raw: s
      };
    }

    // 2) en-GB style: 22 September 2026
    const MONTHS = ['january','february','march','april','may','june','july',
      'august','september','october','november','december'];
    m = s.match(new RegExp('(\\d{1,2})\\s+(' + MONTHS.join('|') + ')\\s+(\\d{4})', 'i'));
    if (m) {
      const t = s.match(/(\d{1,2}):(\d{2})/);
      return {
        year: +m[3], month: MONTHS.indexOf(m[2].toLowerCase()) + 1, day: +m[1],
        hour: t ? +t[1] : 23, minute: t ? +t[2] : 59,
        raw: s
      };
    }

    // 3) ISO / 数字だけ
    m = s.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) {
      const t = s.match(/(\d{1,2}):(\d{2})/);
      return {
        year: +m[1], month: +m[2], day: +m[3],
        hour: t ? +t[1] : 23, minute: t ? +t[2] : 59,
        raw: s
      };
    }
    return null;
  }

  /** 指定 IANA タイムゾーンにおける Offest(ミリ秒)。ゾーンが UTC より先なら正。 */
  function zoneOffsetMs(ts, timeZone) {
    try {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const parts = {};
      for (const p of dtf.formatToParts(new Date(ts))) {
        if (p.type !== 'literal') parts[p.type] = p.value;
      }
      const asUTC = Date.UTC(
        +parts.year, +parts.month - 1, +parts.day,
        (+parts.hour) % 24, +parts.minute, +parts.second
      );
      return asUTC - ts;
    } catch (e) {
      return -new Date().getTimezoneOffset() * 60000;
    }
  }

  /** {year,month,day,hour,minute} + IANA タイムゾーン -> UTC の Date */
  function zonedToDate(parts, timeZone) {
    const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    let ts = wall;
    for (let i = 0; i < 3; i++) {
      const next = wall - zoneOffsetMs(ts, timeZone);
      if (next === ts) break;
      ts = next;
    }
    return new Date(ts);
  }

  /** UTC の Date を、指定タイムゾーンの「壁時計の数字」に変換 */
  function dateToZonedParts(date, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
    const p = {};
    for (const x of dtf.formatToParts(date)) {
      if (x.type !== 'literal') p[x.type] = x.value;
    }
    return {
      year: +p.year, month: +p.month, day: +p.day,
      hour: (+p.hour) % 24, minute: +p.minute
    };
  }

  /** 期限が無い課題用のフォールバック日付（{year,month,day,hour,minute}） */
  function fallbackParts(mode, timeZone) {
    const now = new Date();
    let d = new Date(now.getTime());
    if (mode === 'plus3') d = new Date(now.getTime() + 3 * 86400000);
    else if (mode === 'endofweek') {
      const day = d.getDay();
      d.setDate(d.getDate() + ((7 - day) % 7 || 7));
    } else d = new Date(now.getTime() + 86400000);
    const p = dateToZonedParts(d, timeZone || 'Asia/Tokyo');
    p.hour = 22;
    p.minute = 59;
    return p;
  }

  /** {y,m,d,h,mi} -> Google Tasks が期待する RFC3339 (UTC) */
  function toRfc3339Utc(parts, timeZone) {
    return zonedToDate(parts, timeZone).toISOString();
  }

  /** 日時の表示用 (ロケール) */
  function formatLocal(parts) {
    const p = (n) => String(n).padStart(2, '0');
    return `${parts.year}-${p(parts.month)}-${p(parts.day)} ${p(parts.hour)}:${p(parts.minute)}`;
  }

  g.LA_DATE = {
    parseDueDate, zoneOffsetMs, zonedToDate, dateToZonedParts, fallbackParts,
    toRfc3339Utc, formatLocal
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
