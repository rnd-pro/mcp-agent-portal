

/* global chrome */

const SERVER_URL = 'http://localhost:3333';
const DEFAULT_FETCH_TIMEOUT_MS = 10000;

function logBridgeError(context) {
  return (error) => {
    console.warn(`[GrokBridge] ${context}:`, error.message || error);
  };
}

function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(timeoutMs),
  });
}


let pendingDownloads = new Map();


let capturedRequests = [];


chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Side panel setup error:', error));


chrome.webRequest.onBeforeRequest.addListener(
  (details) => {

    if (!details.url.includes('/api/') && !details.url.includes('imagine')) return;

    let requestData = {
      timestamp: Date.now(),
      method: details.method,
      url: details.url,
      type: details.type,
      tabId: details.tabId,
    };


    if (details.requestBody) {
      if (details.requestBody.raw) {

        let decoder = new TextDecoder();
        let body = details.requestBody.raw
          .map((part) => {
            if (part.bytes) return decoder.decode(part.bytes);
            return '';
          })
          .join('');
        requestData.body = body.substring(0, 5000);
      } else if (details.requestBody.formData) {
        requestData.formData = details.requestBody.formData;
      }
    }

    capturedRequests.push(requestData);
    console.log('[GrokBridge] Captured request:', details.method, details.url);


    if (capturedRequests.length > 50) capturedRequests.shift();


    fetchWithTimeout(`${SERVER_URL}/network/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    }).catch(logBridgeError('Failed to send captured request'));
  },
  { urls: ['*://grok.com/*', '*://*.grok.com/*'] },
  ['requestBody'],
);


chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details.url.includes('/api/') && !details.url.includes('imagine')) return;

    let responseData = {
      timestamp: Date.now(),
      url: details.url,
      statusCode: details.statusCode,
      headers: {},
    };


    for (const header of details.responseHeaders || []) {
      let name = header.name.toLowerCase();
      if (['content-type', 'content-length', 'x-request-id', 'cf-ray'].includes(name)) {
        responseData.headers[name] = header.value;
      }
    }


    fetchWithTimeout(`${SERVER_URL}/network/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responseData),
    }).catch(logBridgeError('Failed to send captured response'));
  },
  { urls: ['*://grok.com/*', '*://*.grok.com/*'] },
  ['responseHeaders'],
);


chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state?.current === 'complete') {

    chrome.downloads.search({ id: delta.id }, (results) => {
      if (results && results.length > 0) {
        let download = results[0];
        console.log('[GrokBridge] Download complete:', download.filename);


        fetchWithTimeout(`${SERVER_URL}/downloads/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: delta.id,
            filename: download.filename,
            fileSize: download.fileSize,
            mime: download.mime,
            url: download.url?.substring(0, 100),
          }),
        }).catch((err) => console.error('Failed to notify server:', err));
      }
    });
  }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'logEvent') {
    chrome.runtime.sendMessage(request).catch(logBridgeError('Failed to forward log event'));
  }


  if (request.action === 'getCapturedRequests') {
    sendResponse({ requests: capturedRequests });
    return;
  }


  if (request.action === 'downloadFile') {
    chrome.downloads.download(
      {
        url: request.url,
        filename: request.filename,
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          pendingDownloads.set(downloadId, { started: Date.now() });
          sendResponse({ success: true, downloadId });
        }
      },
    );
    return true;
  }

  if (request.action === 'exportCookies') {

    chrome.cookies.getAll({ url: 'https://grok.com' }, async (urlCookies) => {

      let domainCookies = await chrome.cookies.getAll({ domain: 'grok.com' });
      let dotCookies = await chrome.cookies.getAll({ domain: '.grok.com' });

      let allCookies = [...urlCookies, ...domainCookies, ...dotCookies];


      let seen = new Set();
      let unique = allCookies.filter((c) => {
        let key = `${c.name}:${c.domain}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });


      console.log(
        `[GrokBridge] Exporting ${unique.length} cookies:`,
        unique.map((c) => c.name).join(', '),
      );


      fetchWithTimeout(`${SERVER_URL}/cookies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unique),
      })
        .then(() => {
          sendResponse({ success: true, count: unique.length, names: unique.map((c) => c.name) });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
    });
    return true;
  }
});

console.log('Grok Bridge v6 background loaded - Network capture enabled');
