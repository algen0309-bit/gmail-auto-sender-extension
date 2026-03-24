// Selectors for Gmail compose send button (MV3 / 2025 Gmail DOM)
const SEND_BTN_SELECTORS = [
  'div[data-tooltip^="Send"]',
  'div[aria-label^="Send"]',
  'div.T-I.J-J5-Ji.aoO[role="button"]',
];

// How long to wait (ms) for Mailtrack.io to inject its tracking pixel
const MAILTRACK_DELAY_MS = 1500;

function findSendButton() {
  for (const sel of SEND_BTN_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'autoSend') return;

  const sendBtn = findSendButton();

  if (!sendBtn) {
    sendResponse({ success: false, message: 'No compose window found' });
    return true;
  }

  // Wait for Mailtrack.io to inject its tracking pixel before clicking Send
  setTimeout(() => {
    try {
      sendBtn.click();
      sendResponse({ success: true, message: 'Sent' });
    } catch (err) {
      sendResponse({ success: false, message: err.message });
    }
  }, MAILTRACK_DELAY_MS);

  // Return true to keep the message channel open for the async response
  return true;
});
