// background.js
// Service worker (MV3). Управляет proxy.settings и обрабатывает onAuthRequired.

const STORAGE_KEY = 'UnVexProxy_profiles';
let currentProfileId = null;

// Установить PAC-скрипт, который направляет всё через указанный прокси
function buildPacForProfile(p) {
  // p = {protocol: "http"|"socks5", host, port}
  // PAC: возвращаем сначала выбранный прокси, а затем DIRECT
  const proxyToken = (p.protocol === 'socks5')
    ? `SOCKS5 ${p.host}:${p.port}`
    : `PROXY ${p.host}:${p.port}`;
  const pac = `
    function FindProxyForURL(url, host) {
      // bypass for local:
      if (host === 'localhost' || host === '127.0.0.1') return 'DIRECT';
      return "${proxyToken}; DIRECT";
    }
  `;
  return pac;
}

async function setProxy(profileId) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const profiles = data[STORAGE_KEY] || [];
  const profile = profiles.find(p => p.id === profileId);
  if (!profile) {
    console.warn('Profile not found', profileId);
    // отключаем прокси
    chrome.proxy.settings.clear({}, () => {});
    currentProfileId = null;
    return;
  }

  const pacScript = buildPacForProfile(profile);
  const config = {
    mode: "pac_script",
    pacScript: { data: pacScript }
  };

  chrome.proxy.settings.set(
    { value: config, scope: 'regular' },
    () => {
      console.log('Proxy set to', profile);
      currentProfileId = profileId;
    }
  );
}

// Отключить прокси (вернуть direct)
function clearProxy() {
  chrome.proxy.settings.clear({}, () => {
    currentProfileId = null;
    console.log('Proxy cleared');
  });
}

// Получить активный профиль (если установлен)
async function getCurrentProfile() {
  if (!currentProfileId) return null;
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const profiles = data[STORAGE_KEY] || [];
  return profiles.find(p => p.id === currentProfileId) || null;
}

// Обработка onAuthRequired для прокси-аутентификации.
// extraInfoSpec 'asyncBlocking' позволяет ответить асинхронно.
chrome.webRequest.onAuthRequired.addListener(
  async (details, callback) => {
    try {
      // Обрабатываем только proxy-аутентификацию
      if (!details.isProxy) {
        // не прокси — не трогаем
        callback({});
        return;
      }

      const profile = await getCurrentProfile();
      if (!profile || !profile.username || !profile.password) {
        // если нет сохранённых кредов, вернем пустой ответ — тогда браузер может показать диалог.
        callback({});
        return;
      }

      // Подставляем сохранённые креды
      callback({ authCredentials: { username: profile.username, password: profile.password } });
    } catch (err) {
      console.error('Auth handler error', err);
      callback({});
    }
  },
  { urls: ["<all_urls>"] },
  ["asyncBlocking"]
);

// Тест работоспособности прокси: делаем fetch к внешнему API (ipify) и возвращаем IP/ошибку.
// Этот запрос пойдёт через системный прокси (если мы задали chrome.proxy.settings).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'testProxy') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    fetch('https://api.ipify.org?format=json', { signal: controller.signal })
      .then(resp => resp.json())
      .then(json => {
        clearTimeout(timeout);
        sendResponse({ ok: true, ip: json.ip });
      })
      .catch(err => {
        clearTimeout(timeout);
        sendResponse({ ok: false, error: err.message || String(err) });
      });
    // indicate we will call sendResponse asynchronously
    return true;
  }

  if (msg?.type === 'setProxy') {
    setProxy(msg.profileId).then(() => sendResponse({ ok: true })).catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg?.type === 'clearProxy') {
    clearProxy();
    sendResponse({ ok: true });
    return false;
  }
});

// Утилиты для создания/CRUD профилей
chrome.runtime.onInstalled.addListener(() => {
  console.log('UnVexProxy installed');
});

// Простая helper-функция: гарантируем, что profiles существуют.
async function ensureProfilesArray() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  }
}
ensureProfilesArray();
