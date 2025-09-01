const STORAGE_KEY = 'fancyProxy_profiles';
let currentProfile = null;

function buildPacForProfile(p) {
  const proxyToken =
    p.protocol === 'socks5'
      ? `SOCKS5 ${p.host}:${p.port}`
      : `PROXY ${p.host}:${p.port}`;
  return `
    function FindProxyForURL(url, host) {
      if (host === 'localhost' || host === '127.0.0.1') return 'DIRECT';
      return "${proxyToken}; DIRECT";
    }
  `;
}

async function applyProxy(profile) {
  const pac = buildPacForProfile(profile);
  await chrome.proxy.settings.set({
    value: { mode: 'pac_script', pacScript: { data: pac } },
    scope: 'regular',
  });
  currentProfile = profile;
  console.log('[background] Proxy applied for profile:', profile);
}

async function removeProxy() {
  await chrome.proxy.settings.clear({ scope: 'regular' });
  console.log('[background] Proxy cleared');
  currentProfile = null;
}

chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!currentProfile || !details.isProxy) return callback({});
    callback({
      authCredentials: {
        username: currentProfile.username || '',
        password: currentProfile.password || '',
      },
    });
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking']
);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case 'connect':
      applyProxy(msg.profile)
        .then(() => sendResponse({ ok: true }))
        .catch((err) => {
          removeProxy().finally(() => sendResponse({ ok: false, error: err.message }));
        });
      return true;

    case 'clear':
      removeProxy().then(() => sendResponse({ ok: true }));
      return true;

    case 'test':
      fetch('https://api.ipify.org?format=json')
        .then((r) => r.json())
        .then((json) => sendResponse({ ok: true, ip: json.ip }))
        .catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;

    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
      return false;
  }
});

(async () => {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  if (!stored[STORAGE_KEY]) {
    await chrome.storage.local.set({ [STORAGE_KEY]: [] });
  }
})();
