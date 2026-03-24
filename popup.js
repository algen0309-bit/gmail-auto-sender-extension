const sendBtn = document.getElementById('sendBtn');
const statusList = document.getElementById('status');

function addStatusItem(label, state) {
  const li = document.createElement('li');
  const icons = { wait: '⏳', ok: '✅', err: '❌' };
  li.innerHTML = `<span>${icons[state]}</span><span>${label}</span>`;
  statusList.appendChild(li);
  return li;
}

function updateStatusItem(li, label, state) {
  const icons = { wait: '⏳', ok: '✅', err: '❌' };
  li.innerHTML = `<span>${icons[state]}</span><span>${label}</span>`;
}

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

  const promises = tabs.map((tab) => {
    const shortTitle = tab.title?.replace(' - Gmail', '').trim() || `Tab ${tab.id}`;
    const li = addStatusItem(`${shortTitle} — sending…`, 'wait');

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: 'autoSend' }, (response) => {
        if (chrome.runtime.lastError) {
          updateStatusItem(li, `${shortTitle} — no compose window`, 'err');
        } else if (response?.success) {
          updateStatusItem(li, `${shortTitle} — sent!`, 'ok');
        } else {
          updateStatusItem(li, `${shortTitle} — ${response?.message || 'failed'}`, 'err');
        }
        resolve();
      });
    });
  });

  await Promise.all(promises);
  sendBtn.disabled = false;
  sendBtn.textContent = 'Send All Open Compose Tabs';
});
