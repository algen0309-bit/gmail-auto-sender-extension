// Selectors for Gmail compose send button
// Note: Gmail renders two overlapping send buttons — the first is hidden (0px, pointer-events:none).
// Mailsuite adds class "mt-send" to the visible one, so we target that first.
const SEND_BTN_SELECTORS = [
  'div.mt-send[role="button"]',
  'div[data-tooltip^="Send"]',
  'div[aria-label^="Send"]',
  'div.T-I.J-J5-Ji.aoO[role="button"]',
];

// Selectors for the compose body (contenteditable area)
const COMPOSE_BODY_SELECTORS = [
  'div[aria-label="Message Body"]',
  'div[g_editable="true"]',
  'div.Am.Al.editable',
];

function isVisible(el) {
  const style = window.getComputedStyle(el);
  return style.pointerEvents !== 'none' && el.offsetWidth > 0 && el.offsetHeight > 0;
}

function findSendButton() {
  for (const sel of SEND_BTN_SELECTORS) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      if (isVisible(el)) return el;
    }
  }
  return null;
}

function findComposeBody() {
  for (const sel of COMPOSE_BODY_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

// Focus the compose body to trigger Mailsuite's pixel injection,
// then poll until a tracking <img> appears or the timeout is reached.
function waitForTrackerPixel(bodyEl, timeoutMs) {
  return new Promise((resolve) => {
    // Focusing the body signals to Mailsuite that the compose is active
    bodyEl.click();
    bodyEl.focus();

    const start = Date.now();

    const interval = setInterval(() => {
      if (bodyEl.querySelector('img')) {
        clearInterval(interval);
        resolve(true); // pixel found
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve(false); // timed out — send anyway
      }
    }, 200);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'autoSend') return;

  const sendBtn = findSendButton();
  if (!sendBtn) {
    sendResponse({ success: false, message: 'No compose window found' });
    return true;
  }

  const timeoutMs = message.trackerTimeoutMs || 5000;
  const bodyEl = findComposeBody();

  const waitPromise = bodyEl
    ? waitForTrackerPixel(bodyEl, timeoutMs)
    : Promise.resolve(false);

  waitPromise.then((pixelFound) => {
    try {
      sendBtn.click();
      sendResponse({ success: true, pixelFound });
    } catch (err) {
      sendResponse({ success: false, message: err.message });
    }
  });

  // Keep message channel open for async response
  return true;
});
