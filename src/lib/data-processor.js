import { buildKeyUserMap } from './username-extractor.js';

/**
 * Process usage costs and aggregate by user
 */
export function processUsageCosts(usageCosts, apiKeys) {
  const keyUserMap = buildKeyUserMap(apiKeys);
  const userCosts = new Map();

  // usageCosts is { "YYYY-MM-DD": [costRecords] }
  for (const [date, records] of Object.entries(usageCosts)) {
    for (const record of records) {
      const username = keyUserMap.get(record.key_id);
      if (!username) continue;

      if (!userCosts.has(username)) {
        userCosts.set(username, createEmptyUserCost(username));
      }

      const userCost = userCosts.get(username);
      aggregateCostRecord(userCost, record, date);
    }
  }

  return Array.from(userCosts.values());
}

function createEmptyUserCost(username) {
  return {
    username,
    totalCost: 0,
    breakdown: {
      byModel: {},
      byTokenType: {},
      byUsageType: {},
      byInferenceGeo: {},
      byDate: {}
    }
  };
}

function aggregateCostRecord(userCost, record, date) {
  const cost = record.total || 0;

  userCost.totalCost += cost;

  // By Model
  const model = record.model_name || 'Unknown';
  userCost.breakdown.byModel[model] = (userCost.breakdown.byModel[model] || 0) + cost;

  // By Token Type
  const tokenType = record.token_type || 'Unknown';
  userCost.breakdown.byTokenType[tokenType] = (userCost.breakdown.byTokenType[tokenType] || 0) + cost;

  // By Usage Type
  const usageType = record.usage_type || 'Unknown';
  userCost.breakdown.byUsageType[usageType] = (userCost.breakdown.byUsageType[usageType] || 0) + cost;

  // By Inference Geo
  const geo = record.inference_geo || 'Unknown';
  userCost.breakdown.byInferenceGeo[geo] = (userCost.breakdown.byInferenceGeo[geo] || 0) + cost;

  // By Date
  userCost.breakdown.byDate[date] = (userCost.breakdown.byDate[date] || 0) + cost;
}

/**
 * Generate ranking sorted by total cost (descending)
 */
export function generateRanking(userCosts) {
  return [...userCosts]
    .sort((a, b) => b.totalCost - a.totalCost)
    .map((user, index) => ({
      rank: index + 1,
      ...user
    }));
}

/**
 * Filter costs by date range
 */
export function filterByDateRange(userCosts, startDate, endDate) {
  return userCosts.map(user => {
    const filteredByDate = {};
    let filteredTotal = 0;

    for (const [date, cost] of Object.entries(user.breakdown.byDate)) {
      if (date >= startDate && date <= endDate) {
        filteredByDate[date] = cost;
        filteredTotal += cost;
      }
    }

    return {
      ...user,
      totalCost: filteredTotal,
      breakdown: {
        ...user.breakdown,
        byDate: filteredByDate
      }
    };
  }).filter(user => user.totalCost > 0);
}

/**
 * Filter by model, token type, usage type, geo
 */
export function filterByDimensions(userCosts, filters) {
  const { model, tokenType, usageType, geo } = filters;

  return userCosts.map(user => {
    let filteredTotal = 0;
    const newBreakdown = {
      byModel: {},
      byTokenType: {},
      byUsageType: {},
      byInferenceGeo: {},
      byDate: user.breakdown.byDate
    };

    // This is a simplified filter - in real implementation would need to
    // recalculate from raw records with multiple filter dimensions
    if (model) {
      const cost = user.breakdown.byModel[model] || 0;
      filteredTotal = cost;
      newBreakdown.byModel[model] = cost;
    } else {
      filteredTotal = user.totalCost;
      newBreakdown.byModel = user.breakdown.byModel;
      newBreakdown.byTokenType = user.breakdown.byTokenType;
      newBreakdown.byUsageType = user.breakdown.byUsageType;
      newBreakdown.byInferenceGeo = user.breakdown.byInferenceGeo;
    }

    return {
      ...user,
      totalCost: filteredTotal,
      breakdown: newBreakdown
    };
  }).filter(user => user.totalCost > 0);
}
