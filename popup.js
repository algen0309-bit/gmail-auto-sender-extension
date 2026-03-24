const sendBtn = document.getElementById('sendBtn');
const statusList = document.getElementById('status');
const delaySlider = document.getElementById('delaySlider');
const delayValue = document.getElementById('delayValue');

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

async function sendToTab(tab) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, { action: 'autoSend' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, message: 'no compose window' });
      } else {
        resolve(response || { success: false, message: 'no response' });
      }
    });
  });
}

// --- Slider ---

delaySlider.addEventListener('input', () => {
  delayValue.textContent = formatDelay(Number(delaySlider.value));
  chrome.storage.local.set({ delaySeconds: Number(delaySlider.value) });
});

// Restore saved delay on popup open
chrome.storage.local.get('delaySeconds', (data) => {
  if (data.delaySeconds) {
    delaySlider.value = data.delaySeconds;
    delayValue.textContent = formatDelay(data.delaySeconds);
  }
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

  const delaySeconds = Number(delaySlider.value);

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    const shortTitle = tab.title?.replace(' - Gmail', '').trim() || `Tab ${tab.id}`;
    const li = addStatusItem(`${shortTitle} — sending…`, 'wait');

    const result = await sendToTab(tab);

    if (result.success) {
      updateStatusItem(li, `${shortTitle} — sent!`, 'ok');
    } else {
      updateStatusItem(li, `${shortTitle} — ${result.message}`, 'err');
    }

    // Countdown between emails (skip after the last one)
    if (i < tabs.length - 1) {
      const countdownLi = addStatusItem(`Next in ${formatDelay(delaySeconds)}…`, 'countdown');

      for (let t = delaySeconds; t > 0; t--) {
        updateStatusItem(countdownLi, `Next in ${formatDelay(t)}…`, 'countdown');
        await sleep(1000);
      }

      countdownLi.remove();
    }
  }

  sendBtn.disabled = false;
  sendBtn.textContent = 'Send All Open Compose Tabs';
});
