// Enable side panel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[Claude Extension] Failed to set panel behavior:', error));

// --- Date helpers ---

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// Add N days to a date string, return new date string
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

// Generate array of date strings from start to end (inclusive)
function getDateRange(startDate, endDate) {
  const dates = [];
  let current = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// Parse date range from Claude platform URL query param ?range=
function parsePlatformUrlRange(url) {
  try {
    const params = new URL(url).searchParams;
    const range = params.get('range');
    if (!range) return null;

    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
    const utc = (yr, mo, dy) => formatDate(new Date(Date.UTC(yr, mo, dy)));
    const todayStr = utc(y, m, d);

    // Custom range: 2026-02-01~2026-03-04
    if (range.includes('~')) {
      const [startDate, endDate] = range.split('~');
      return { startDate, endDate };
    }

    switch (range) {
      case 'last_7_days': return { startDate: utc(y, m, d - 6), endDate: todayStr };
      case 'last_30_days': return { startDate: utc(y, m, d - 29), endDate: todayStr };
      case 'last_month': return { startDate: utc(y, m - 1, 1), endDate: utc(y, m, 0) };
      case 'mtd': return { startDate: utc(y, m, 1), endDate: todayStr };
      case 'ytd': return { startDate: utc(y, 0, 1), endDate: todayStr };
      default: return null;
    }
  } catch { return null; }
}

// --- Username extraction ---

function extractUsername(keyName) {
  if (!keyName || typeof keyName !== 'string') return null;
  const parts = keyName.split('_');
  if (parts.length < 5 || parts[0] !== 'claude' || parts[1] !== 'code' || parts[2] !== 'key') return null;
  return parts.slice(3, -1).join('_');
}

function buildKeyUserMap(apiKeys) {
  const map = new Map();
  for (const key of apiKeys) {
    const username = extractUsername(key.name);
    if (username) map.set(key.id, username);
  }
  return map;
}

// --- Data processing ---

function processUsageCosts(usageCosts, apiKeys) {
  const keyUserMap = buildKeyUserMap(apiKeys);
  const userCosts = new Map();

  for (const [date, records] of Object.entries(usageCosts)) {
    for (const record of records) {
      const username = keyUserMap.get(record.key_id);
      if (!username) continue;

      if (!userCosts.has(username)) {
        userCosts.set(username, {
          username,
          totalCost: 0,
          breakdown: { byModel: {}, byTokenType: {}, byUsageType: {}, byInferenceGeo: {}, byDate: {} }
        });
      }

      const userCost = userCosts.get(username);
      const cost = record.total || 0;
      userCost.totalCost += cost;

      const model = record.model_name || 'Unknown';
      userCost.breakdown.byModel[model] = (userCost.breakdown.byModel[model] || 0) + cost;

      const tokenType = record.token_type || 'Unknown';
      userCost.breakdown.byTokenType[tokenType] = (userCost.breakdown.byTokenType[tokenType] || 0) + cost;

      const usageType = record.usage_type || 'Unknown';
      userCost.breakdown.byUsageType[usageType] = (userCost.breakdown.byUsageType[usageType] || 0) + cost;

      const geo = record.inference_geo || 'Unknown';
      userCost.breakdown.byInferenceGeo[geo] = (userCost.breakdown.byInferenceGeo[geo] || 0) + cost;

      userCost.breakdown.byDate[date] = (userCost.breakdown.byDate[date] || 0) + cost;
    }
  }

  return Array.from(userCosts.values());
}

function generateRanking(userCosts) {
  return [...userCosts]
    .sort((a, b) => b.totalCost - a.totalCost)
    .map((user, index) => ({ rank: index + 1, ...user }));
}

// --- Direct API fetching ---

// Parse API error response: { type: "error", error: { message: "..." } }
async function parseApiError(res) {
  try {
    const body = await res.json();
    if (body?.error?.message) return body.error.message;
  } catch {}
  return `API error: ${res.status}`;
}

async function fetchApiKeys(orgId, wsId) {
  const url = `https://platform.claude.com/api/console/organizations/${orgId}/workspaces/${wsId}/api_keys`;
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) throw new Error(await parseApiError(res));
  return res.json();
}

// startDate inclusive, endDate inclusive (API's ending_before is exclusive, so we +1 day)
async function fetchUsageCost(orgId, wsId, startDate, endDate) {
  const endBefore = addDays(endDate, 1);
  const url = `https://platform.claude.com/api/organizations/${orgId}/workspaces/${wsId}/usage_cost?starting_on=${startDate}&ending_before=${endBefore}&group_by=api_key_id`;
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok) throw new Error(await parseApiError(res));
  const data = await res.json();
  return data.costs || data;
}

// --- Incremental cache logic ---

// Find missing date ranges that need fetching
function getMissingDateRanges(requestedStart, requestedEnd, cachedDates, today) {
  const requested = getDateRange(requestedStart, requestedEnd);
  const cachedSet = new Set(cachedDates);
  const missing = requested.filter(d => d === today || !cachedSet.has(d));

  if (missing.length === 0) return [];

  // Merge consecutive dates into ranges for fewer API calls
  const ranges = [];
  let rangeStart = missing[0];
  let prev = missing[0];

  for (let i = 1; i < missing.length; i++) {
    const expected = addDays(prev, 1);
    if (missing[i] !== expected) {
      ranges.push({ startDate: rangeStart, endDate: prev });
      rangeStart = missing[i];
    }
    prev = missing[i];
  }
  ranges.push({ startDate: rangeStart, endDate: prev });

  return ranges;
}

// Main fetch orchestrator: fetch missing dates, merge into cache, return processed data
// useCache=true: only fetch missing dates; useCache=false: fetch entire range fresh
async function fetchAndMergeData(dateFrom, dateTo, useCache = true) {
  const storage = await chrome.storage.local.get(['orgId', 'workspaceId', 'apiKeys', 'apiKeysLastUpdated', 'usageCosts', 'cachedDates']);
  const { orgId, workspaceId } = storage;

  if (!orgId || !workspaceId) {
    return { error: 'NO_IDS', data: [], message: 'Visit Claude platform once to activate' };
  }

  // Refresh API keys if missing or older than 1 hour
  let apiKeys = storage.apiKeys || [];
  const keysAge = Date.now() - (storage.apiKeysLastUpdated || 0);
  if (!apiKeys.length || keysAge > 3600000) {
    try {
      apiKeys = await fetchApiKeys(orgId, workspaceId);
      await chrome.storage.local.set({ apiKeys, apiKeysLastUpdated: Date.now() });
      console.log(`[Claude Extension] Refreshed API keys: ${apiKeys.length} keys`);
    } catch (error) {
      if (error.message === 'SESSION_EXPIRED') {
        return { error: 'SESSION_EXPIRED', data: [], message: 'Session expired. Please login to Claude platform.' };
      }
      // Use cached keys if available
      if (!apiKeys.length) throw error;
      console.log('[Claude Extension] Using cached API keys');
    }
  }

  const existingCosts = useCache ? (storage.usageCosts || {}) : {};
  const cachedDates = useCache ? (storage.cachedDates || []) : [];
  const today = getTodayStr();

  // Calculate missing date ranges (when cache off, cachedDates is empty so everything is "missing")
  const missingRanges = getMissingDateRanges(dateFrom, dateTo, cachedDates, today);
  console.log(`[Claude Extension] Cache=${useCache}, missing ranges:`, missingRanges);

  // Fetch missing ranges
  let newCosts = {};
  for (const range of missingRanges) {
    try {
      const costs = await fetchUsageCost(orgId, workspaceId, range.startDate, range.endDate);
      // Merge fetched costs
      for (const [date, records] of Object.entries(costs)) {
        newCosts[date] = records;
      }
    } catch (error) {
      if (error.message === 'SESSION_EXPIRED') {
        return { error: 'SESSION_EXPIRED', data: [], message: 'Session expired. Please login to Claude platform.' };
      }
      console.error(`[Claude Extension] Failed to fetch ${range.startDate} to ${range.endDate}:`, error);
      return { error: 'API_ERROR', data: [], message: error.message };
    }
  }

  // Merge new costs into existing cache
  const mergedCosts = { ...existingCosts, ...newCosts };

  // Update cachedDates: add newly fetched past dates (not today)
  const newCachedDates = new Set(cachedDates);
  for (const date of Object.keys(newCosts)) {
    if (date !== today) {
      newCachedDates.add(date);
    }
  }

  // Save merged cache
  await chrome.storage.local.set({
    usageCosts: mergedCosts,
    cachedDates: [...newCachedDates].sort(),
    lastUpdated: Date.now()
  });

  // Process only the requested date range from the merged cache
  const filteredCosts = {};
  for (const [date, records] of Object.entries(mergedCosts)) {
    if (date >= dateFrom && date <= dateTo) {
      filteredCosts[date] = records;
    }
  }

  const userCosts = processUsageCosts(filteredCosts, apiKeys);
  const ranking = generateRanking(userCosts);

  return { data: ranking, lastUpdated: Date.now() };
}

// --- Message handlers ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Phase 1: Store org/workspace IDs from intercepted URLs
  if (message.action === 'STORE_IDS') {
    chrome.storage.local.set({
      orgId: message.orgId,
      workspaceId: message.workspaceId
    }).then(() => {
      console.log(`[Claude Extension] Stored IDs: org=${message.orgId}, ws=${message.workspaceId}`);
      sendResponse({ success: true });
    });
    return true;
  }

  // Phase 4: Side panel requests data for a date range (triggers smart fetch)
  if (message.action === 'FETCH_DATE_RANGE') {
    fetchAndMergeData(message.dateFrom, message.dateTo, message.useCache).then(sendResponse).catch(error => {
      console.error('[Claude Extension] FETCH_DATE_RANGE error:', error);
      sendResponse({ error: error.message, data: [] });
    });
    return true;
  }

  // Platform URL changed — parse date range and notify side panel to refresh
  if (message.action === 'PLATFORM_URL_CHANGED') {
    const dateRange = parsePlatformUrlRange(message.url);
    if (dateRange) {
      chrome.runtime.sendMessage({
        action: 'PLATFORM_DATE_CHANGED',
        dateRange
      }).catch(() => {});
    }
    sendResponse({ success: true });
    return true;
  }

  // Check if IDs are stored (for side panel to decide what to show)
  if (message.action === 'CHECK_IDS') {
    chrome.storage.local.get(['orgId', 'workspaceId']).then(result => {
      sendResponse({ hasIds: !!(result.orgId && result.workspaceId) });
    });
    return true;
  }

  if (message.action === 'GET_CURRENT_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ url: tabs[0]?.url || '' });
    });
    return true;
  }

  if (message.action === 'OPEN_CLAUDE_PLATFORM') {
    chrome.tabs.create({ url: 'https://platform.claude.com/workspaces/default/cost' });
    sendResponse({ success: true });
    return true;
  }
});

// Notify side panel when active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    chrome.runtime.sendMessage({ action: 'TAB_CHANGED', url: tab.url || '' }).catch(() => {});
  } catch (error) {
    // Tab might not exist yet
  }
});

// Notify side panel when tab URL updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id === tabId) {
        chrome.runtime.sendMessage({ action: 'TAB_CHANGED', url: tab.url || '' }).catch(() => {});
      }
    });
  }
});

console.log('[Claude Extension] Service worker initialized');
