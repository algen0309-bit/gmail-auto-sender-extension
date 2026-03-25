const QUEUE_KEY = 'sendQueue';

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomDelay(minSec, maxSec) {
  return Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
}

async function ensureContentScript(tabId) {
  const alive = await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, (res) => {
      resolve(!chrome.runtime.lastError && res?.alive === true);
    });
  });
  if (alive) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    return true;
  } catch (e) {
    return false;
  }
}

async function sendToTab(tabId, trackerTimeoutMs) {
  const injected = await ensureContentScript(tabId);
  if (!injected) return { success: false, message: 'could not inject script' };

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'autoSend', trackerTimeoutMs }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, message: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, message: 'no response' });
      }
    });
  });
}

async function notify(id, title, message) {
  const data = await chrome.storage.local.get('notifications');
  if (data.notifications === false) return;
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icon48.png',
    title,
    message,
  });
}

// ── Queue processor ───────────────────────────────────────────────────────────

async function processNextTab() {
  const data = await chrome.storage.local.get(QUEUE_KEY);
  const queue = data[QUEUE_KEY];
  if (!queue || queue.status !== 'running') return;

  const { tabIds, current, minSec, maxSec, trackerTimeoutMs } = queue;
  let { results } = queue;

  if (current >= tabIds.length) {
    await finishQueue(queue);
    return;
  }

  // Update badge: remaining count
  const remaining = tabIds.length - current;
  chrome.action.setBadgeText({ text: String(remaining) });
  chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });

  const tabId = tabIds[current];
  let tabTitle = `Tab ${tabId}`;
  try {
    const tab = await chrome.tabs.get(tabId);
    tabTitle = tab.title?.replace(' - Gmail', '').trim() || tabTitle;
  } catch (e) {
    results = [...results, { title: tabTitle, success: false, message: 'Tab was closed' }];
    await advanceQueue(queue, results);
    return;
  }

  const result = await sendToTab(tabId, trackerTimeoutMs);
  result.title = tabTitle;
  results = [...results, result];

  notify(
    `send_${current}`,
    result.success ? 'Email Sent' : 'Send Failed',
    tabTitle
  );

  await advanceQueue({ ...queue, results }, results);
}

async function advanceQueue(queue, results) {
  const { tabIds, current, minSec, maxSec } = queue;
  const nextIdx = current + 1;

  if (nextIdx >= tabIds.length) {
    await finishQueue({ ...queue, current: nextIdx, results });
    return;
  }

  const delaySec = randomDelay(minSec, maxSec);
  const nextAt = Date.now() + delaySec * 1000;

  await chrome.storage.local.set({
    [QUEUE_KEY]: { ...queue, current: nextIdx, results, status: 'running', nextAt },
  });

  chrome.alarms.create('sendNext', { delayInMinutes: delaySec / 60 });
}

async function finishQueue(queue) {
  const { results, tabIds } = queue;
  await chrome.storage.local.set({
    [QUEUE_KEY]: { ...queue, status: 'done', results },
  });
  chrome.action.setBadgeText({ text: '' });
  const sent = results.filter((r) => r.success).length;
  notify('done', 'Gmail Auto Sender — Done', `Sent ${sent} of ${tabIds.length} emails.`);
}

// ── Event listeners ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'sendNext') processNextTab();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'startQueue') {
    chrome.alarms.clear('sendNext');
    const queue = {
      status: 'running',
      tabIds: message.tabIds,
      current: 0,
      minSec: message.minSec,
      maxSec: message.maxSec,
      trackerTimeoutMs: message.trackerTimeoutMs,
      results: [],
      startedAt: Date.now(),
      nextAt: null,
    };
    chrome.storage.local.set({ [QUEUE_KEY]: queue }, () => {
      processNextTab();
      sendResponse({ started: true });
    });
    return true;
  }

  if (message.action === 'cancelQueue') {
    chrome.alarms.clear('sendNext');
    chrome.storage.local.remove(QUEUE_KEY);
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ cancelled: true });
    return true;
  }
});
