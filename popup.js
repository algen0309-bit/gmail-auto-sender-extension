const sendBtn    = document.getElementById('sendBtn');
const cancelBtn  = document.getElementById('cancelBtn');
const statusList = document.getElementById('status');
const minSlider  = document.getElementById('minSlider');
const maxSlider  = document.getElementById('maxSlider');
const minValue   = document.getElementById('minValue');
const maxValue   = document.getElementById('maxValue');
const trackerSlider  = document.getElementById('trackerSlider');
const trackerValue   = document.getElementById('trackerValue');
const notifyToggle   = document.getElementById('notifyToggle');

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDelay(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function addItem(label, state) {
  const icons = { wait: '⏳', ok: '✅', err: '❌', info: 'ℹ️' };
  const li = document.createElement('li');
  li.innerHTML = `<span>${icons[state] || ''}</span><span>${label}</span>`;
  statusList.appendChild(li);
  return li;
}

// ── Sliders ───────────────────────────────────────────────────────────────────

function enforceMinMax() {
  let min = Number(minSlider.value);
  let max = Number(maxSlider.value);
  if (min > max) { [minSlider.value, maxSlider.value] = [max, min]; [min, max] = [max, min]; }
  minValue.textContent = formatDelay(min);
  maxValue.textContent = formatDelay(max);
  chrome.storage.local.set({ minDelay: min, maxDelay: max });
}

minSlider.addEventListener('input', enforceMinMax);
maxSlider.addEventListener('input', enforceMinMax);
trackerSlider.addEventListener('input', () => {
  const v = Number(trackerSlider.value);
  trackerValue.textContent = `${v}s`;
  chrome.storage.local.set({ trackerTimeout: v });
});

// Restore saved settings
chrome.storage.local.get(['minDelay', 'maxDelay', 'trackerTimeout', 'notifications'], (data) => {
  if (data.minDelay)      { minSlider.value = data.minDelay; minValue.textContent = formatDelay(data.minDelay); }
  if (data.maxDelay)      { maxSlider.value = data.maxDelay; maxValue.textContent = formatDelay(data.maxDelay); }
  if (data.trackerTimeout){ trackerSlider.value = data.trackerTimeout; trackerValue.textContent = `${data.trackerTimeout}s`; }
  // default true; only false when explicitly saved as false
  notifyToggle.checked = data.notifications !== false;
});

notifyToggle.addEventListener('change', () => {
  chrome.storage.local.set({ notifications: notifyToggle.checked });
});

// ── Status display ────────────────────────────────────────────────────────────

function renderQueue(queue) {
  statusList.innerHTML = '';

  if (!queue) {
    setIdle();
    return;
  }

  const { status, results = [], tabIds = [], nextAt } = queue;

  // Completed results
  for (const r of results) {
    if (r.success) {
      const tracked = r.pixelFound ? ' (tracked)' : ' (no pixel)';
      addItem(`${r.title} — sent!${tracked}`, 'ok');
    } else {
      addItem(`${r.title} — ${r.message}`, 'err');
    }
  }

  if (status === 'running') {
    const remaining = tabIds.length - results.length;
    if (remaining > 0) {
      addItem(`${remaining} tab(s) remaining…`, 'wait');
      if (nextAt) {
        const secsLeft = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
        if (secsLeft > 0) addItem(`Next in ${formatDelay(secsLeft)}`, 'info');
      }
    }
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending in background…';
    cancelBtn.style.display = 'block';
  } else {
    setIdle();
    cancelBtn.style.display = 'none';
  }
}

function setIdle() {
  sendBtn.disabled = false;
  sendBtn.textContent = 'Send All Open Compose Tabs';
  cancelBtn.style.display = 'none';
}

// Check queue state when popup opens
chrome.storage.local.get('sendQueue', (data) => renderQueue(data.sendQueue || null));

// ── Send button ───────────────────────────────────────────────────────────────

sendBtn.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: '*://mail.google.com/*' });
  if (tabs.length === 0) {
    statusList.innerHTML = '';
    addItem('No Gmail tabs found.', 'err');
    return;
  }

  const minSec = Number(minSlider.value);
  const maxSec = Number(maxSlider.value);
  const trackerTimeoutMs = Number(trackerSlider.value) * 1000;

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending in background…';
  cancelBtn.style.display = 'block';
  statusList.innerHTML = '';
  addItem(`Starting — ${tabs.length} tab(s) queued`, 'wait');

  chrome.runtime.sendMessage({
    action: 'startQueue',
    tabIds: tabs.map((t) => t.id),
    minSec,
    maxSec,
    trackerTimeoutMs,
    notifications: notifyToggle.checked,
  });
});

// ── Cancel button ─────────────────────────────────────────────────────────────

cancelBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'cancelQueue' }, () => {
    statusList.innerHTML = '';
    addItem('Cancelled.', 'info');
    setIdle();
  });
});
