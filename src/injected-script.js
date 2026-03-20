// Runs in page context — extracts org/workspace IDs from API calls
(function() {
  const ID_PATTERNS = [
    /\/api\/console\/organizations\/([^/]+)\/workspaces\/([^/]+)\//,
    /\/api\/organizations\/([^/]+)\/workspaces\/([^/]+)\//
  ];

  let idsCaptured = false;

  const originalFetch = window.fetch;

  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);

    // Only need to capture IDs once
    if (idsCaptured) return response;

    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    for (const pattern of ID_PATTERNS) {
      const match = url.match(pattern);
      if (match) {
        idsCaptured = true;
        const orgId = match[1];
        const workspaceId = match[2];
        console.log(`[Claude Extension] Captured IDs: org=${orgId}, ws=${workspaceId}`);
        window.postMessage({
          type: 'CLAUDE_IDS_CAPTURED',
          payload: { orgId, workspaceId }
        }, '*');
        break;
      }
    }

    return response;
  };

  // Monitor URL changes — notify side panel when user changes date filter on Claude platform
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      window.postMessage({ type: 'CLAUDE_URL_CHANGED', payload: { url: lastUrl } }, '*');
    }
  }, 500);

  console.log('[Claude Extension] ID capture active');
})();
