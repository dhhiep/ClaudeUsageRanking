const STORAGE_KEYS = {
  API_KEYS: 'apiKeys',
  USAGE_COSTS: 'usageCosts',
  PROCESSED_DATA: 'processedData',
  LAST_UPDATED: 'lastUpdated'
};

export async function getApiKeys() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEYS);
  return result[STORAGE_KEYS.API_KEYS] || [];
}

export async function getUsageCosts() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.USAGE_COSTS);
  return result[STORAGE_KEYS.USAGE_COSTS] || {};
}

export async function saveProcessedData(data) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROCESSED_DATA]: data,
    [STORAGE_KEYS.LAST_UPDATED]: Date.now()
  });
}

export async function getProcessedData() {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.PROCESSED_DATA,
    STORAGE_KEYS.LAST_UPDATED
  ]);
  return {
    data: result[STORAGE_KEYS.PROCESSED_DATA] || [],
    lastUpdated: result[STORAGE_KEYS.LAST_UPDATED] || null
  };
}

export async function clearAllData() {
  await chrome.storage.local.clear();
}
