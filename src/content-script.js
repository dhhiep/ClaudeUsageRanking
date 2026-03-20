// Inject script into page context for ID extraction
(function() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected-script.js');
  script.onload = function() { this.remove(); };
  (document.head || document.documentElement).appendChild(script);

  function isExtensionContextValid() {
    try {
      return chrome.runtime?.id !== undefined;
    } catch (e) {
      return false;
    }
  }

  // Relay org/workspace IDs from injected script to service worker
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!isExtensionContextValid()) return;

    if (event.data?.type === 'CLAUDE_IDS_CAPTURED') {
      chrome.runtime.sendMessage({
        action: 'STORE_IDS',
        ...event.data.payload
      }).catch(() => {});
    }

    // Relay URL changes to service worker (user changed date filter on platform)
    if (event.data?.type === 'CLAUDE_URL_CHANGED') {
      chrome.runtime.sendMessage({
        action: 'PLATFORM_URL_CHANGED',
        url: event.data.payload.url
      }).catch(() => {});
    }
  });

  console.log('[Claude Extension] Content script loaded');
})();
