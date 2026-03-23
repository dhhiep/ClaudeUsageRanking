class SidePanelController {
  constructor() {
    this.data = [];
    this.filteredData = [];
    this.searchQuery = '';
    this.sortColumn = 'totalCost';
    this.sortDirection = 'desc';
    this.theme = 'auto';
    this.useCache = true;
    this.alwaysRefreshToday = true;

    this.init();
  }

  async init() {
    this.setupMessageListener();
    this.attachEventListeners();
    this.setupNavigatePrompt();
    await this.loadSettings(); // loads theme + restores dates/search, sets defaults if none saved
    await this.checkActivation();
  }

  // Check if IDs are stored — if yes, fetch data; if no, show setup prompt
  async checkActivation() {
    try {
      const { hasIds } = await chrome.runtime.sendMessage({ action: 'CHECK_IDS' });
      const prompt = document.getElementById('navigate-prompt');
      const container = document.querySelector('.container');

      if (!hasIds) {
        prompt.style.display = 'flex';
        container.style.display = 'none';
        document.getElementById('current-url-display').textContent = 'IDs not captured yet';
      } else {
        prompt.style.display = 'none';
        container.style.display = 'flex';
        await this.fetchData();
      }
    } catch (error) {
      console.error('[Claude Extension] checkActivation failed:', error);
    }
  }

  setupNavigatePrompt() {
    const navigateBtn = document.getElementById('navigate-btn');
    if (navigateBtn) {
      navigateBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'OPEN_CLAUDE_PLATFORM' });
      });
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'TAB_CHANGED') {
        this.checkActivation();
        sendResponse({ success: true });
      }

      // Sync when user changes date filter on Claude platform
      if (message.action === 'PLATFORM_DATE_CHANGED') {
        const { startDate, endDate } = message.dateRange;
        document.getElementById('date-from').value = startDate;
        document.getElementById('date-to').value = endDate;
        this.syncPresetFromDates();
        this.fetchData();
        sendResponse({ success: true });
      }
      return true;
    });
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['theme', 'alwaysRefreshToday', 'savedSearch', 'savedDateFrom', 'savedDateTo', 'savedPreset'], (result) => {
        this.theme = result.theme || 'auto';
        this.alwaysRefreshToday = result.alwaysRefreshToday !== false; // default true
        this.applyTheme();
        this.updateThemeButton();
        this.updateCacheUI();

        // Restore search query
        if (result.savedSearch) {
          this.searchQuery = result.savedSearch;
          document.getElementById('search-input').value = result.savedSearch;
        }

        // Restore date range if saved, otherwise apply default preset
        if (result.savedDateFrom && result.savedDateTo) {
          document.getElementById('date-from').value = result.savedDateFrom;
          document.getElementById('date-to').value = result.savedDateTo;
          document.getElementById('date-preset').value = result.savedPreset || 'custom';
        } else {
          this.applyPreset('mtd');
        }

        resolve();
      });
    });
  }

  applyTheme() {
    const body = document.body;
    body.classList.remove('theme-light', 'theme-dark');
    if (this.theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
    } else {
      body.classList.add(`theme-${this.theme}`);
    }
  }

  updateThemeButton() {
    const btn = document.getElementById('theme-toggle');
    const icons = { auto: '🌓', light: '☀️', dark: '🌙' };
    btn.textContent = icons[this.theme];
    btn.title = `Theme: ${this.theme} (click to cycle)`;
  }

  cycleTheme() {
    const themes = ['auto', 'light', 'dark'];
    const currentIndex = themes.indexOf(this.theme);
    this.theme = themes[(currentIndex + 1) % themes.length];
    chrome.storage.local.set({ theme: this.theme });
    this.applyTheme();
    this.updateThemeButton();
  }

  toggleCacheDropdown() {
    const dropdown = document.getElementById('cache-dropdown');
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);
  }

  closeCacheDropdown() {
    document.getElementById('cache-dropdown').classList.remove('open');
  }

  toggleCache() {
    this.useCache = !this.useCache;
    this.updateCacheUI();
  }

  toggleAlwaysRefreshToday() {
    this.alwaysRefreshToday = !this.alwaysRefreshToday;
    chrome.storage.local.set({ alwaysRefreshToday: this.alwaysRefreshToday });
    this.updateCacheUI();
    this.closeCacheDropdown();
  }

  async clearCache() {
    await chrome.storage.local.remove(['usageCosts', 'cachedDates']);
    this.closeCacheDropdown();
    this.showToast('Cache cleared', 'info', 2000);
  }

  updateCacheUI() {
    const btn = document.getElementById('cache-toggle');
    btn.textContent = this.useCache ? '💾' : '⚡';
    btn.title = `Cache: ${this.useCache ? 'on' : 'off'}`;
    const toggleOption = document.getElementById('cache-toggle-option');
    toggleOption.innerHTML = `
      <span class="dropdown-icon">${this.useCache ? '✓' : ''}</span>
      <span>Cache ${this.useCache ? 'enabled' : 'disabled'}</span>
    `;
    const refreshTodayOption = document.getElementById('cache-refresh-today-option');
    refreshTodayOption.innerHTML = `
      <span class="dropdown-icon">${this.alwaysRefreshToday ? '✓' : ''}</span>
      <span>Always refresh today</span>
    `;
  }

  showLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.style.display = 'flex';
  }

  hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.style.display = 'none';
  }

  attachEventListeners() {
    document.getElementById('cache-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCacheDropdown();
    });
    document.getElementById('cache-toggle-option').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleCache();
    });
    document.getElementById('cache-refresh-today-option').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleAlwaysRefreshToday();
    });
    document.getElementById('cache-clear-option').addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearCache();
    });
    // Click outside closes dropdown
    document.addEventListener('click', () => this.closeCacheDropdown());
    document.getElementById('theme-toggle').addEventListener('click', () => this.cycleTheme());
    document.getElementById('refresh-btn').addEventListener('click', () => this.fetchData());

    // Search input — real-time local filter + persist
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      chrome.storage.local.set({ savedSearch: this.searchQuery });
      this.applyLocalFilters();
    });

    // Date preset dropdown
    document.getElementById('date-preset').addEventListener('change', (e) => {
      if (e.target.value !== 'custom') {
        this.applyPreset(e.target.value);
        this.saveDateSettings();
        this.fetchData();
      }
    });

    // Date pickers — trigger fetch, auto-detect preset, persist
    document.getElementById('date-from').addEventListener('change', () => {
      this.syncPresetFromDates();
      this.saveDateSettings();
      this.fetchData();
    });
    document.getElementById('date-to').addEventListener('change', () => {
      this.syncPresetFromDates();
      this.saveDateSettings();
      this.fetchData();
    });

    // Sort headers
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });

    // System theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.theme === 'auto') this.applyTheme();
    });
  }

  setDefaultDates() {
    this.applyPreset('mtd');
  }

  // Calculate UTC date strings for a preset
  getPresetDates(preset) {
    // Use UTC "today" to match Claude platform's date bucketing
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const todayStr = this.formatDateValue(new Date(Date.UTC(y, m, d)));

    const utcDate = (year, month, day) => this.formatDateValue(new Date(Date.UTC(year, month, day)));
    const daysAgo = (n) => utcDate(y, m, d - n);

    switch (preset) {
      case 'today':
        return { from: todayStr, to: todayStr };
      case 'yesterday':
        return { from: daysAgo(1), to: daysAgo(1) };
      case 'last_7_days':
        return { from: daysAgo(6), to: todayStr };
      case 'last_30_days':
        return { from: daysAgo(29), to: todayStr };
      case 'last_60_days':
        return { from: daysAgo(59), to: todayStr };
      case 'last_90_days':
        return { from: daysAgo(89), to: todayStr };
      case 'last_month':
        return { from: utcDate(y, m - 1, 1), to: utcDate(y, m, 0) };
      case 'mtd':
      default:
        return { from: utcDate(y, m, 1), to: todayStr };
    }
  }

  // Apply preset: set date inputs and dropdown
  applyPreset(preset) {
    const { from, to } = this.getPresetDates(preset);
    document.getElementById('date-from').value = from;
    document.getElementById('date-to').value = to;
    document.getElementById('date-preset').value = preset;
  }

  // Auto-detect if current date inputs match a known preset
  syncPresetFromDates() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    const presets = ['mtd', 'today', 'yesterday', 'last_7_days', 'last_30_days', 'last_60_days', 'last_90_days', 'last_month'];

    for (const preset of presets) {
      const { from, to } = this.getPresetDates(preset);
      if (dateFrom === from && dateTo === to) {
        document.getElementById('date-preset').value = preset;
        return;
      }
    }
    document.getElementById('date-preset').value = 'custom';
  }

  saveDateSettings() {
    chrome.storage.local.set({
      savedDateFrom: document.getElementById('date-from').value,
      savedDateTo: document.getElementById('date-to').value,
      savedPreset: document.getElementById('date-preset').value,
    });
  }

  formatDateValue(date) {
    return date.toISOString().split('T')[0];
  }

  // Main data fetch — sends date range to service worker which does smart incremental fetch
  async fetchData() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    if (!dateFrom || !dateTo) return;

    this.showLoadingIndicator();
    this.showLoading();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'FETCH_DATE_RANGE',
        dateFrom,
        dateTo,
        useCache: this.useCache,
        alwaysRefreshToday: this.alwaysRefreshToday
      });

      if (response.error) {
        this.showToast(response.message || response.error, 'error');
        return;
      }

      if (response.data && response.data.length > 0) {
        this.data = response.data;
        this.applyLocalFilters(); // re-apply search query on fresh data
        this.updateFooter(response.lastUpdated);
      } else {
        this.showEmptyState();
      }
    } catch (error) {
      console.error('[Claude Extension] fetchData failed:', error);
      this.showToast('Failed to fetch data', 'error');
    } finally {
      this.hideLoadingIndicator();
    }
  }

  applyLocalFilters() {
    let filtered = [...this.data];

    if (this.searchQuery) {
      filtered = filtered.filter(user =>
        user.username.toLowerCase().includes(this.searchQuery)
      );
    }

    this.filteredData = filtered;
    this.render();
  }

  handleSort(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'totalCost' ? 'desc' : 'asc';
    }

    this.filteredData.sort((a, b) => {
      let aVal = a[column];
      let bVal = b[column];
      const multiplier = this.sortDirection === 'asc' ? 1 : -1;
      if (typeof aVal === 'string') return aVal.localeCompare(bVal) * multiplier;
      return (aVal - bVal) * multiplier;
    });

    this.render();
    this.updateSortIndicators();
  }

  updateSortIndicators() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === this.sortColumn) {
        th.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  render() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    this.filteredData.forEach((user, index) => {
      const topModel = this.getTopModel(user);
      const row = document.createElement('tr');

      row.innerHTML = `
        <td class="rank-cell">${index + 1}</td>
        <td>${this.escapeHtml(user.username)}</td>
        <td class="cost-cell">$${(user.totalCost / 100).toFixed(2)}</td>
        <td>${this.escapeHtml(topModel)}</td>
      `;

      row.style.cursor = 'pointer';
      row.addEventListener('click', () => this.toggleUserDetails(user.username, row));
      tbody.appendChild(row);
    });

    this.updateStats();
    this.updateSortIndicators();
  }

  getTopModel(user) {
    const models = user.breakdown.byModel;
    let topModel = 'N/A';
    let maxCost = 0;
    for (const [model, cost] of Object.entries(models)) {
      if (cost > maxCost) {
        maxCost = cost;
        topModel = model.replace(' Usage', '');
      }
    }
    return topModel;
  }

  updateStats() {
    const totalCost = this.filteredData.reduce((sum, u) => sum + u.totalCost, 0);
    document.getElementById('total-cost').textContent = `$${(totalCost / 100).toFixed(2)}`;
    document.getElementById('user-count').textContent = `${this.filteredData.length}`;
  }

  updateFooter(lastUpdated) {
    if (lastUpdated) {
      const date = new Date(lastUpdated);
      document.getElementById('last-updated').textContent = date.toLocaleTimeString();
    }
  }

  toggleUserDetails(username, row) {
    const existingDetails = row.nextElementSibling;
    if (existingDetails && existingDetails.classList.contains('details-row-expanded')) {
      existingDetails.remove();
      return;
    }

    document.querySelectorAll('.details-row-expanded').forEach(el => el.remove());

    const user = this.filteredData.find(u => u.username === username);
    if (!user) return;

    const sortedDates = Object.entries(user.breakdown.byDate)
      .sort((a, b) => a[0].localeCompare(b[0]));

    const detailsRow = document.createElement('tr');
    detailsRow.classList.add('details-row-expanded');

    detailsRow.innerHTML = `
      <td colspan="4" class="details-cell">
        <div class="details-content-inline">
          <div class="details-section full-width">
            <h4>Cost Per Day</h4>
            <table class="cost-per-day-table">
              <thead><tr><th>Date</th><th>Cost</th></tr></thead>
              <tbody>
                ${sortedDates.map(([date, cost]) => `
                  <tr>
                    <td>${this.formatDate(date)}</td>
                    <td class="cost-cell">$${(cost / 100).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <div class="details-section">
            <h4>By Model</h4>
            ${Object.entries(user.breakdown.byModel)
              .sort((a, b) => b[1] - a[1])
              .map(([m, c]) => `
                <div class="details-row">
                  <span class="label">${this.escapeHtml(m.replace(' Usage', ''))}</span>
                  <span class="value">$${(c / 100).toFixed(2)}</span>
                </div>
              `).join('')}
          </div>

          <div class="details-section">
            <h4>By Token Type</h4>
            ${Object.entries(user.breakdown.byTokenType)
              .sort((a, b) => b[1] - a[1])
              .map(([t, c]) => `
                <div class="details-row">
                  <span class="label">${this.escapeHtml(t)}</span>
                  <span class="value">$${(c / 100).toFixed(2)}</span>
                </div>
              `).join('')}
          </div>

          <div class="details-section">
            <h4>By Usage Type</h4>
            ${Object.entries(user.breakdown.byUsageType)
              .sort((a, b) => b[1] - a[1])
              .map(([u, c]) => `
                <div class="details-row">
                  <span class="label">${this.escapeHtml(u)}</span>
                  <span class="value">$${(c / 100).toFixed(2)}</span>
                </div>
              `).join('')}
          </div>
        </div>
      </td>
    `;

    row.after(detailsRow);
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  showLoading() {
    document.getElementById('table-body').innerHTML = `
      <tr><td colspan="4" class="loading">Loading...</td></tr>
    `;
  }

  showEmptyState(message = 'No data available. Visit platform.claude.com to capture usage data.') {
    document.getElementById('table-body').innerHTML = `
      <tr><td colspan="4" class="empty-state"><p>${message}</p></td></tr>
    `;
  }

  showToast(message, type = 'error', duration = 5000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new SidePanelController();
});
