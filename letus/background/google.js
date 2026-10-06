/* Google Tasks 連携（chrome.identity.getAuthToken + Tasks API） */

const API = 'https://tasks.googleapis.com/tasks/v1/lists';

export function clientId() {
  try {
    const m = chrome.runtime.getManifest();
    return (m.oauth2 && m.oauth2.client_id) || '';
  } catch (e) {
    return '';
  }
}

export function isConfigured() {
  const id = clientId();
  return !!id && id.indexOf('REPLACE_WITH') === -1;
}

function getToken(interactive) {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      reject(new Error('manifest.json の oauth2.client_id が未設定です。README の手順で Google の OAuth クライアントIDを設定してください。'));
      return;
    }
    chrome.identity.getAuthToken({ interactive: !!interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error('Google 認証に失敗しました: ' + err.message));
        return;
      }
      if (!token) { reject(new Error('Google の認証トークンが取得できませんでした。')); return; }
      resolve(token);
    });
  });
}

export function removeToken() {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) chrome.identity.removeCachedAuthToken({ token }, () => resolve(true));
      else resolve(true);
    });
  });
}

export async function addTask(opts) {
  const { title, note, dueUtc, taskList } = opts;
  const list = taskList || '@default';
  const token = await getToken(false);
  const body = { title: String(title || '(無題)').slice(0, 500) };
  if (note) body.notes = String(note).slice(0, 2000);
  if (dueUtc) body.due = dueUtc;

  const res = await fetch(
    API + '/' + encodeURIComponent(list) + '/tasks',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  if (res.status === 401) {
    await removeToken();
    throw new Error('Google の認証が失効しました。もう一度ボタンを押してください。');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Google Tasks API エラー (' + res.status + '): ' + text.slice(0, 300));
  }
  const json = await res.json();
  return {
    id: json.id,
    title: json.title,
    due: json.due || null,
    link: json.selfLink || null
  };
}
