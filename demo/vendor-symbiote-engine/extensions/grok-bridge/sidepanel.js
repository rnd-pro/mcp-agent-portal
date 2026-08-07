

const SERVER_URL = 'http://localhost:3333';
let eventsDiv = document.getElementById('events');
let statusDot = document.getElementById('statusDot');
let statusText = document.getElementById('statusText');

let events = [];

function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  return fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Check server and page connection
 */
async function checkStatus() {
  try {
    let res = await fetchWithTimeout(`${SERVER_URL}/health`, {}, 3000);
    let data = await res.json();
    statusDot.className = 'status-dot connected';
    statusText.textContent = `Bridge connected (${data.pendingCommands || 0} pending)`;
  } catch {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Bridge disconnected';
  }
}

/**
 * Add event to display
 */
function addEvent(event) {
  events.unshift(event);
  if (events.length > 50) events.pop();
  renderEvents();
}

/**
 * Render events list
 * @returns {void}
 */
function renderEvents() {
  eventsDiv.replaceChildren();

  if (events.length === 0) {
    let empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Waiting for events...';
    eventsDiv.append(empty);
    return;
  }

  let fragment = document.createDocumentFragment();
  for (let e of events) {
    let item = document.createElement('div');
    item.className = 'event';

    let time = document.createElement('span');
    time.className = 'event-time';
    time.textContent = new Date(e.time).toLocaleTimeString();

    let type = document.createElement('span');
    type.className = `event-type ${e.type}`;
    type.textContent = e.type;

    let data = document.createElement('span');
    data.className = 'event-data';
    data.textContent = e.data;

    item.append(time, type, data);
    fragment.append(item);
  }
  eventsDiv.append(fragment);
}


chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'logEvent') {
    addEvent(request.event);
  }
  return true;
});


async function fetchExistingEvents() {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'getEventLog' }, (response) => {
        if (response?.events) {
          events = response.events;
          renderEvents();
        }
      });
    }
  } catch {

  }
}


checkStatus();
fetchExistingEvents();
setInterval(checkStatus, 3000);


let exportBtn = document.getElementById('exportCookies');
let cookieStatus = document.getElementById('cookieStatus');

exportBtn.addEventListener('click', async () => {
  exportBtn.disabled = true;
  exportBtn.textContent = '⏳ Exporting...';
  cookieStatus.textContent = '';

  try {
    let response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'exportCookies' }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res);
        }
      });
    });

    if (response?.success) {
      cookieStatus.style.color = '#00d4aa';
      cookieStatus.textContent = `✅ Exported ${response.count} cookies`;
      addEvent({
        time: new Date().toISOString(),
        type: 'result',
        data: `Exported ${response.count} cookies`,
      });
    } else {
      throw new Error(response?.error || 'Unknown error');
    }
  } catch (err) {
    cookieStatus.style.color = '#ff4757';
    cookieStatus.textContent = `❌ ${err.message}`;
    addEvent({ time: new Date().toISOString(), type: 'error', data: err.message });
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = '🍪 Export Cookies';
  }
});


let generateBtn = document.getElementById('generateBtn');
let promptInput = document.getElementById('promptInput');
let aspectRatio = document.getElementById('aspectRatio');
let generateStatus = document.getElementById('generateStatus');
let resultContainer = document.getElementById('resultContainer');
let resultImage = document.getElementById('resultImage');
let resultLink = document.getElementById('resultLink');

generateBtn.addEventListener('click', async () => {
  let prompt = promptInput.value.trim();
  if (!prompt) {
    generateStatus.style.color = '#ff4757';
    generateStatus.textContent = 'Please enter a prompt';
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ Generating...';
  generateStatus.style.color = '#666';
  generateStatus.textContent = 'Sending to browser...';
  resultContainer.style.display = 'none';

  try {

    let res = await fetchWithTimeout(`${SERVER_URL}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generateImage',
        params: {
          prompt,
          options: { aspectRatio: aspectRatio.value },
        },
      }),
    }, 10000);

    if (!res.ok) throw new Error('Failed to send command');
    let { id } = await res.json();

    generateStatus.textContent = `Command sent (${id}), waiting...`;
    addEvent({ time: new Date().toISOString(), type: 'command', data: `Generate: ${prompt}` });


    let startTime = Date.now();
    let timeout = 70000;

    while (Date.now() - startTime < timeout) {
      await new Promise((r) => setTimeout(r, 1000));

      let resultRes = await fetchWithTimeout(`${SERVER_URL}/result/${id}`, {}, 5000);
      if (!resultRes.ok) continue;

      let data = await resultRes.json();

      if (data.result) {

        generateStatus.style.color = '#00d4aa';
        generateStatus.textContent = `✅ Generated!`;

        resultImage.src = data.result.imageUrl;
        resultLink.href = data.result.imageUrl;
        resultContainer.style.display = 'block';

        addEvent({
          time: new Date().toISOString(),
          type: 'result',
          data: `Image: ${data.result.jobId}`,
        });
        return;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      generateStatus.textContent = `Generating... (${Math.round((Date.now() - startTime) / 1000)}s)`;
    }

    throw new Error('Timeout waiting for result');
  } catch (err) {
    generateStatus.style.color = '#ff4757';
    generateStatus.textContent = `❌ ${err.message}`;
    addEvent({ time: new Date().toISOString(), type: 'error', data: err.message });
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = '🚀 Generate';
  }
});


promptInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !generateBtn.disabled) {
    generateBtn.click();
  }
});


let showZonesBtn = document.getElementById('showZonesBtn');
let zonesVisible = false;

showZonesBtn.addEventListener('click', async () => {
  showZonesBtn.disabled = true;

  try {
    if (zonesVisible) {

      let res = await fetchWithTimeout(`${SERVER_URL}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hideZones', params: {} }),
      }, 10000);
      if (res.ok) {
        showZonesBtn.textContent = '🎯 Show Zones';
        showZonesBtn.style.background = '#ff6b6b';
        zonesVisible = false;
        addEvent({ time: new Date().toISOString(), type: 'info', data: 'Zones hidden' });
      }
    } else {

      let res = await fetchWithTimeout(`${SERVER_URL}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'showClickableZones', params: {} }),
      }, 10000);
      if (res.ok) {
        let { id } = await res.json();


        await new Promise((r) => setTimeout(r, 1000));
        let resultRes = await fetchWithTimeout(`${SERVER_URL}/result/${id}`, {}, 5000);
        let data = await resultRes.json();

        if (data.result?.zones) {
          showZonesBtn.textContent = '🚫 Hide Zones';
          showZonesBtn.style.background = '#666';
          zonesVisible = true;
          addEvent({
            time: new Date().toISOString(),
            type: 'result',
            data: `Showing ${data.result.total} zones`,
          });


          document.getElementById('layerButtons').style.display = 'flex';
        }
      }
    }
  } catch (err) {
    addEvent({ time: new Date().toISOString(), type: 'error', data: err.message });
  } finally {
    showZonesBtn.disabled = false;
  }
});


document.querySelectorAll('.layer-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    let layer = btn.dataset.layer;
    try {
      let res = await fetchWithTimeout(`${SERVER_URL}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'showClickableZones', params: { layer } }),
      }, 10000);
      if (res.ok) {
        let { id } = await res.json();
        await new Promise((r) => setTimeout(r, 1000));
        let resultRes = await fetchWithTimeout(`${SERVER_URL}/result/${id}`, {}, 5000);
        let data = await resultRes.json();
        if (data.result?.zones) {
          addEvent({
            time: new Date().toISOString(),
            type: 'result',
            data: `Showing ${data.result.total} ${layer} zones`,
          });
        }
      }
    } catch (err) {
      addEvent({ time: new Date().toISOString(), type: 'error', data: err.message });
    }
  });
});
