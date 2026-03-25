const sendBtn = document.getElementById('sendBtn');
const statusList = document.getElementById('status');
const minSlider = document.getElementById('minSlider');
const maxSlider = document.getElementById('maxSlider');
const minValue = document.getElementById('minValue');
const maxValue = document.getElementById('maxValue');
const trackerSlider = document.getElementById('trackerSlider');
const trackerValue = document.getElementById('trackerValue');

// --- Helpers ---

function formatDelay(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minSec, maxSec) {
  return Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
}

function addStatusItem(label, state) {
  const icons = { wait: '⏳', ok: '✅', err: '❌', countdown: '⏱️' };
  const li = document.createElement('li');
  li.innerHTML = `<span>${icons[state]}</span><span>${label}</span>`;
  statusList.appendChild(li);
  return li;
}

function updateStatusItem(li, label, state) {
  const icons = { wait: '⏳', ok: '✅', err: '❌', countdown: '⏱️' };
  li.innerHTML = `<span>${icons[state]}</span><span>${label}</span>`;
}

async function ensureContentScript(tabId) {
  // Check if content script is already running
  const alive = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, (res) => {
      resolve(!chrome.runtime.lastError && res?.alive === true);
    });
  });
  if (alive) return true;
  // Inject it programmatically (handles tabs opened before extension loaded)
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (e) {
    return false;
  }
}

async function sendToTab(tab, trackerTimeoutMs) {
  const injected = await ensureContentScript(tab.id);
  if (!injected) return { success: false, message: 'could not inject script' };

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'autoSend', trackerTimeoutMs }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, message: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, message: 'no response' });
      }
    });
  });
}

// --- Sliders ---

function enforceMinMax() {
  let min = Number(minSlider.value);
  let max = Number(maxSlider.value);
  // Keep min <= max
  if (min > max) {
    [minSlider.value, maxSlider.value] = [max, min];
    [min, max] = [max, min];
  }
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

// Restore saved values on popup open
chrome.storage.local.get(['minDelay', 'maxDelay', 'trackerTimeout'], (data) => {
  if (data.minDelay) { minSlider.value = data.minDelay; minValue.textContent = formatDelay(data.minDelay); }
  if (data.maxDelay) { maxSlider.value = data.maxDelay; maxValue.textContent = formatDelay(data.maxDelay); }
  if (data.trackerTimeout) { trackerSlider.value = data.trackerTimeout; trackerValue.textContent = `${data.trackerTimeout}s`; }
});

// --- Send ---

sendBtn.addEventListener('click', async () => {
  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  statusList.innerHTML = '';

  const tabs = await chrome.tabs.query({ url: '*://mail.google.com/*' });

  if (tabs.length === 0) {
    addStatusItem('No Gmail tabs found.', 'err');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send All Open Compose Tabs';
    return;
  }

  const minSec = Number(minSlider.value);
  const maxSec = Number(maxSlider.value);
  const trackerTimeoutMs = Number(trackerSlider.value) * 1000;

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const shortTitle = tab.title?.replace(' - Gmail', '').trim() || `Tab ${tab.id}`;
    const li = addStatusItem(`${shortTitle} — waiting for tracker…`, 'wait');

    const result = await sendToTab(tab, trackerTimeoutMs);

    if (result.success) {
      const tracked = result.pixelFound ? ' (tracked)' : ' (no pixel)';
      updateStatusItem(li, `${shortTitle} — sent!${tracked}`, 'ok');
    } else {
      updateStatusItem(li, `${shortTitle} — ${result.message}`, 'err');
    }

    // Random countdown between emails (skip after the last one)
    if (i < tabs.length - 1) {
      const delaySec = randomDelay(minSec, maxSec);
      const countdownLi = addStatusItem(`Next in ${formatDelay(delaySec)}…`, 'countdown');

      for (let t = delaySec; t > 0; t--) {
        updateStatusItem(countdownLi, `Next in ${formatDelay(t)}…`, 'countdown');
        await sleep(1000);
      }

      countdownLi.remove();
    }
  }

  sendBtn.disabled = false;
  sendBtn.textContent = 'Send All Open Compose Tabs';
});
