// Guard against double-injection (popup.js may inject this programmatically)
if (window.__gmailAutoSenderInjected) {
  // Already loaded — do nothing to avoid duplicate listeners
} else {
window.__gmailAutoSenderInjected = true;

// Mailsuite marks the visible Send button with class "mt-send".
// Gmail also renders a hidden 0px button with the same selectors — skip those.
const SEND_BTN_SELECTORS = [
  'div.mt-send[role="button"]',
  'div[data-tooltip^="Send"][role="button"]',
  'div[aria-label^="Send"][role="button"]',
  'div.T-I.aoO[role="button"]',
];

const COMPOSE_BODY_SELECTORS = [
  'div[aria-label="Message Body"]',
  'div[g_editable="true"]',
  'div.Am.Al.editable',
];

function isVisible(el) {
  const s = window.getComputedStyle(el);
  return s.pointerEvents !== 'none'
    && s.display !== 'none'
    && s.visibility !== 'hidden'
    && el.offsetWidth > 0
    && el.offsetHeight > 0;
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

// Poll until the send button appears in the DOM (compose may render after page load)
function waitForSendButton(timeoutMs) {
  return new Promise((resolve) => {
    const btn = findSendButton();
    if (btn) { resolve(btn); return; }

    const start = Date.now();
    const iv = setInterval(() => {
      const btn = findSendButton();
      if (btn) { clearInterval(iv); resolve(btn); }
      else if (Date.now() - start >= timeoutMs) { clearInterval(iv); resolve(null); }
    }, 300);
  });
}

function waitForTrackerPixel(bodyEl, timeoutMs) {
  return new Promise((resolve) => {
    bodyEl.click();
    bodyEl.focus();
    const start = Date.now();
    const iv = setInterval(() => {
      if (bodyEl.querySelector('img[src*="mailtrack"], img[src*="cloudHQ"], #mt-signature img')) {
        clearInterval(iv); resolve(true);
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(iv); resolve(false);
      }
    }, 200);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ alive: true });
    return true;
  }

  if (message.action !== 'autoSend') return;

  // Wait up to 8s for compose window to render
  waitForSendButton(8000).then((sendBtn) => {
    if (!sendBtn) {
      // Diagnostic: report what selectors found (even if hidden)
      const anyBtn = document.querySelector('div.T-I.aoO[role="button"]');
      const debug = anyBtn
        ? `Found btn but invisible: offsetW=${anyBtn.offsetWidth} ptrEvents=${window.getComputedStyle(anyBtn).pointerEvents}`
        : 'No matching button in DOM at all';
      sendResponse({ success: false, message: `No compose window — ${debug}` });
      return;
    }

    const timeoutMs = message.trackerTimeoutMs || 5000;
    const bodyEl = findComposeBody();
    const waitPixel = bodyEl
      ? waitForTrackerPixel(bodyEl, timeoutMs)
      : Promise.resolve(false);

    waitPixel.then((pixelFound) => {
      try {
        // Gmail ignores synthetic .click() — use Ctrl+Enter keyboard shortcut instead
        const composeBody = bodyEl || findComposeBody();
        if (composeBody) {
          composeBody.focus();
          composeBody.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13,
            ctrlKey: true, bubbles: true, cancelable: true
          }));
          sendResponse({ success: true, pixelFound });
        } else {
          // Fallback: try clicking the button directly with a real MouseEvent
          sendBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          sendBtn.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, view: window }));
          sendBtn.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, view: window }));
          sendResponse({ success: true, pixelFound });
        }
      } catch (err) {
        sendResponse({ success: false, message: err.message });
      }
    });
  });

  return true; // async response
});

} // end guard: window.__gmailAutoSenderInjected
