/* Microsoft To Do 連携（OAuth 2.0 認可コード + PKCE + Microsoft Graph） */

import '../shared/dateutil.js';

const DATE = globalThis.LA_DATE;
const AUTH_KEY = 'letusMsAuth';
const SESSION_KEY = 'letusMsPkce';

const SCOPES = 'openid profile offline_access User.Read Tasks.ReadWrite';

function p2(n) {
  return String(n).padStart(2, '0');
}

const WIN_TZ = {
  'Asia/Tokyo': 'Tokyo Standard Time',
  'Asia/Seoul': 'Korea Standard Time',
  'Asia/Shanghai': 'China Standard Time',
  'Asia/Singapore': 'Singapore Standard Time',
  'Asia/Taipei': 'Taipei Standard Time',
  'Asia/Bangkok': 'SE Asia Standard Time',
  'Asia/Jakarta': 'SE Asia Standard Time',
  'Asia/Kolkata': 'India Standard Time',
  'Asia/Dubai': 'Arabian Standard Time',
  'Europe/London': 'GMT Standard Time',
  'Europe/Paris': 'Romance Standard Time',
  'Europe/Berlin': 'W. Europe Standard Time',
  'Europe/Moscow': 'Russian Standard Time',
  'America/New_York': 'Eastern Standard Time',
  'America/Chicago': 'Central Standard Time',
  'America/Denver': 'Mountain Standard Time',
  'America/Los_Angeles': 'Pacific Standard Time',
  'Australia/Sydney': 'AUS Eastern Standard Time',
  'UTC': 'UTC'
};

function base64url(buf) {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return base64url(b);
}

function tenant(tenantId) {
  return tenantId === 'common' ? 'common' : 'consumers';
}

function authBase(t) {
  return 'https://login.microsoftonline.com/' + tenant(t) + '/oauth2/v2.0/';
}

export function winTimeZone(iana) {
  if (!iana) return 'Tokyo Standard Time';
  if (WIN_TZ[iana]) return WIN_TZ[iana];
  return iana; // Graph は IANA 名も受け付ける
}

/* ------------------------------------------------------------- storage */

export function getAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.get(AUTH_KEY, (r) => resolve((r && r[AUTH_KEY]) || null));
  });
}

export function clearAuth() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(AUTH_KEY, () => resolve(true));
  });
}

function saveAuth(data) {
  return new Promise((resolve) => {
    const o = {};
    o[AUTH_KEY] = data;
    chrome.storage.local.set(o, () => resolve(data));
  });
}

export function isConnected() {
  return getAuth().then((a) => !!(a && a.refreshToken));
}

/* --------------------------------------------------------------- OAuth */

function redirectUri() {
  return 'https://' + chrome.runtime.id + '.chromiumapp.org/';
}

async function createPkce() {
  const verifier = randomString(64);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(digest) };
}

async function tokenRequest(params) {
  const t = params.__tenant;
  const body = Object.assign({}, params);
  delete body.__tenant;
  const res = await fetch(authBase(t) + 'token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const desc = (json.error_description || json.error || ('HTTP ' + res.status));
    throw new Error('Microsoft 認証エラー: ' + desc);
  }
  return json;
}

/** 対話的にサインイン（設定ページから呼ぶ） */
export async function connect(clientId, tenantId) {
  if (!clientId) throw new Error('Azure アプリのクライアントIDが未設定です。');
  const t = tenantId || 'consumers';
  const { verifier, challenge } = await createPkce();
  const state = randomString(16);

  const s = {};
  s[SESSION_KEY] = { verifier, state, tenant: t };
  await new Promise((r) => chrome.storage.session.set(s, r));

  const url = authBase(t) + 'authorize?' + new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    response_mode: 'query',
    scope: SCOPES,
    state: state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  }).toString();

  const redirect = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (r) => {
      const err = chrome.runtime.lastError;
      if (err) { reject(new Error('認証フローを開始できませんでした: ' + err.message)); return; }
      resolve(r || '');
    });
  });

  if (!redirect) throw new Error('認証がキャンセルされました。');
  const q = new URL(redirect).searchParams;
  if (q.get('error')) {
    throw new Error('認証エラー: ' + (q.get('error_description') || q.get('error')));
  }
  if (q.get('state') !== state) throw new Error('認証の整合性チェックに失敗しました。');

  const session = (await new Promise((r) => chrome.storage.session.get(SESSION_KEY, (x) => r(x[SESSION_KEY]))));
  if (!session) throw new Error('PKCE 情報が失効しました。もう一度お試しください。');

  const body = {
    client_id: clientId,
    grant_type: 'authorization_code',
    code: q.get('code'),
    redirect_uri: redirectUri(),
    code_verifier: session.verifier,
    scope: SCOPES,
    __tenant: session.tenant
  };
  const tok = await tokenRequest(body);
  const data = {
    clientId,
    tenant: t,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + ((tok.expires_in || 3600) - 120) * 1000
  };
  await saveAuth(data);
  return data;
}

async function accessToken() {
  const auth = await getAuth();
  if (!auth || !auth.refreshToken) {
    throw new Error('Microsoft To Do が未接続です。拡張機能の設定で「接続」してください。');
  }
  if (auth.accessToken && Date.now() < auth.expiresAt) return auth.accessToken;

  const body = {
    client_id: auth.clientId,
    grant_type: 'refresh_token',
    refresh_token: auth.refreshToken,
    scope: SCOPES,
    __tenant: auth.tenant
  };
  const tok = await tokenRequest(body);
  const next = {
    ...auth,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token || auth.refreshToken,
    expiresAt: Date.now() + ((tok.expires_in || 3600) - 120) * 1000
  };
  await saveAuth(next);
  return next.accessToken;
}

async function graph(path, options) {
  const token = await accessToken();
  const res = await fetch('https://graph.microsoft.com/v1.0' + path, {
    ...(options || {}),
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...((options && options.headers) || {})
    }
  });
  if (res.status === 401) {
    await clearAuth();
    throw new Error('Microsoft の認証が失効しました。再接続してください。');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Microsoft Graph エラー (' + res.status + '): ' + text.slice(0, 300));
  }
  if (res.status === 204) return null;
  return res.json();
}

/* ----------------------------------------------------------------- API */

export async function listLists() {
  const json = await graph('/me/todo/lists?$top=100');
  return (json && json.value) || [];
}

async function resolveListId(listName) {
  const lists = await listLists();
  if (!lists.length) throw new Error('To Do リストが見つかりません。');
  const want = (listName || 'Tasks').trim().toLowerCase();
  const hit = lists.find((l) => (l.displayName || '').trim().toLowerCase() === want);
  if (hit) return hit.id;
  const fallback = lists.find((l) => l.isOwner);
  return (fallback || lists[0]).id;
}

export async function addTask(opts) {
  const { title, note, dueParts, timeZone, listName, reminder, reminderMinutes } = opts;
  const listId = await resolveListId(listName);
  const iana = timeZone || 'Asia/Tokyo';
  const tz = winTimeZone(iana);
  const body = {
    title: String(title || '(無題)').slice(0, 255),
    body: { content: String(note || ''), contentType: 'text' },
    importance: 'normal'
  };
  if (dueParts) {
    body.dueDateTime = {
      dateTime: `${dueParts.year}-${p2(dueParts.month)}-${p2(dueParts.day)}T${p2(dueParts.hour)}:${p2(dueParts.minute)}:00`,
      timeZone: tz
    };
    if (reminder) {
      // 期限の「絶対時刻」から reminderMinutes 分戻す（タイムゾーン考慮）
      const dueInstant = DATE.zonedToDate(dueParts, iana);
      const rem = new Date(dueInstant.getTime() - (reminderMinutes || 60) * 60000);
      body.reminderDateTime = {
        dateTime: `${rem.getUTCFullYear()}-${p2(rem.getUTCMonth() + 1)}-${p2(rem.getUTCDate())}T${p2(rem.getUTCHours())}:${p2(rem.getUTCMinutes())}:00`,
        timeZone: 'UTC'
      };
      body.isReminderOn = true;
    }
  }
  const created = await graph('/me/todo/lists/' + encodeURIComponent(listId) + '/tasks', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return { id: created && created.id, title: created && created.title, listId };
}
