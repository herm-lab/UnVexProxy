// popup.js
const STORAGE_KEY = 'UnVexProxy_profiles';

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function el(id){ return document.getElementById(id); }

async function loadProfiles() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveProfiles(profiles) {
  await chrome.storage.local.set({ [STORAGE_KEY]: profiles });
}

function renderProfiles(list) {
  const ul = el('profilesList');
  ul.innerHTML = '';
  list.forEach(p => {
    const li = document.createElement('li');
    li.className = 'profile-item';
    const meta = document.createElement('div');
    meta.innerHTML = `<div><strong>${p.host}:${p.port}</strong> <span class="profile-meta">(${p.protocol}${p.username ? ', auth' : ''})</span></div><div class="profile-meta">${p.id}</div>`;
    const actions = document.createElement('div');
    actions.className = 'profile-actions';
    const connectBtn = document.createElement('button');
    connectBtn.className='small-btn';
    connectBtn.textContent='Подключить';
    connectBtn.onclick = () => {
      chrome.runtime.sendMessage({ type:'setProxy', profileId: p.id }, (r) => {
        if (r?.ok) setStatus('Connected: ' + p.host + ':' + p.port);
        else setStatus('Ошибка подключения');
      });
    };
    const delBtn = document.createElement('button');
    delBtn.className='small-btn';
    delBtn.textContent='Удалить';
    delBtn.onclick = async () => {
      const arr = await loadProfiles();
      const filtered = arr.filter(x => x.id !== p.id);
      await saveProfiles(filtered);
      renderProfiles(filtered);
    };
    actions.appendChild(connectBtn);
    actions.appendChild(delBtn);
    li.appendChild(meta);
    li.appendChild(actions);
    ul.appendChild(li);
  });
}

function setStatus(t) {
  el('status').textContent = t;
}

// Save new profile
el('saveBtn').addEventListener('click', async () => {
  const p = {
    id: uid(),
    protocol: el('protocol').value,
    host: el('host').value.trim(),
    port: el('port').value.trim(),
    username: el('username').value.trim(),
    password: el('password').value
  };
  if (!p.host || !p.port) {
    alert('Укажите host и port');
    return;
  }
  const profiles = await loadProfiles();
  profiles.push(p);
  await saveProfiles(profiles);
  renderProfiles(profiles);
  setStatus('Профиль сохранён');
});

// Connect button uses last filled values (ad-hoc connect)
el('connectBtn').addEventListener('click', async () => {
  const p = {
    id: uid(),
    protocol: el('protocol').value,
    host: el('host').value.trim(),
    port: el('port').value.trim(),
    username: el('username').value.trim(),
    password: el('password').value
  };
  if (!p.host || !p.port) { alert('Укажите host и port'); return; }
  // Temporarily save into storage to let background read credentials when authenticating.
  const profiles = await loadProfiles();
  profiles.push(p);
  await saveProfiles(profiles);
  // send message to background to set this profile
  chrome.runtime.sendMessage({ type: 'setProxy', profileId: p.id }, (r) => {
    if (r?.ok) {
      setStatus('Connected: ' + p.host + ':' + p.port);
      renderProfiles(profiles);
    } else {
      setStatus('Ошибка: ' + (r?.error || 'unknown'));
    }
  });
});

// Test proxy
el('testBtn').addEventListener('click', async () => {
  setStatus('Проверка...');
  el('testResult').textContent = '';
  chrome.runtime.sendMessage({ type: 'testProxy' }, (resp) => {
    if (!resp) {
      el('testResult').textContent = 'Нет ответа от background';
      setStatus('Idle');
      return;
    }
    if (resp.ok) {
      el('testResult').textContent = 'IP через прокси: ' + resp.ip;
      setStatus('Proxy active');
    } else {
      el('testResult').textContent = 'Ошибка: ' + resp.error;
      setStatus('Proxy error');
    }
  });
});

// Инициализация
(async function init(){
  const profiles = await loadProfiles();
  renderProfiles(profiles);
  setStatus('Idle');
})();
