class SidePanelController {
  constructor() {
    this.data = [];
    this.filteredData = [];
    this.searchQuery = '';
    this.sortColumn = 'totalCost';
    this.sortDirection = 'desc';
    this.activeTab = 'summary';
    this.theme = 'auto'; // auto, light, dark

    this.init();
  }

  async init() {
    this.setupMessageListener();
    this.loadTheme();
    this.attachEventListeners();
    this.setDefaultDates();
    await this.loadData();
  }

  setupMessageListener() {
    // Listen for date range change notifications from service worker
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Claude Extension] Received message:', message.action);

      if (message.action === 'RELOAD_DATE_RANGE') {
        console.log('[Claude Extension] Received date range update:', message.dateRange);
        if (message.dateRange) {
          document.getElementById('date-from').value = message.dateRange.startDate;
          document.getElementById('date-to').value = message.dateRange.endDate;
        }
        sendResponse({ success: true });
      }

      if (message.action === 'DATA_FETCH_STARTED') {
        console.log('[Claude Extension] Data fetch started, showing loading indicator');
        this.showLoadingIndicator();
        sendResponse({ success: true });
      }

      if (message.action === 'AUTO_REFRESH_DATA') {
        console.log('[Claude Extension] Auto-refreshing with new data');
        // Hide loading indicator and reload data
        this.hideLoadingIndicator();
        this.loadData().then(() => {
          console.log('[Claude Extension] Auto-refresh complete');
        });
        sendResponse({ success: true });
      }
      return true;
    });
  }

  loadTheme() {
    chrome.storage.local.get(['theme'], (result) => {
      this.theme = result.theme || 'auto';
      this.applyTheme();
      this.updateThemeButton();
    });
  }

  applyTheme() {
    const body = document.body;
    body.classList.remove('theme-light', 'theme-dark');

    if (this.theme === 'auto') {
      // Use system preference
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

  showLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
      indicator.style.display = 'flex';
      console.log('[Claude Extension] Loading indicator shown');
    } else {
      console.error('[Claude Extension] Loading indicator element not found');
    }
  }

  hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
      indicator.style.display = 'none';
      console.log('[Claude Extension] Loading indicator hidden');
    }
  }

  attachEventListeners() {
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => this.cycleTheme());

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => this.refreshData());

    // Search input - real-time filter
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.applyLocalFilters();
    });

    // Date pickers - auto-apply on change
    document.getElementById('date-from').addEventListener('change', () => {
      console.log('[Claude Extension] Date from changed, auto-applying filters');
      this.applyFilters();
    });

    document.getElementById('date-to').addEventListener('change', () => {
      console.log('[Claude Extension] Date to changed, auto-applying filters');
      this.applyFilters();
    });

    // Sort headers
    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });

    // Listen for system theme changes when in auto mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.theme === 'auto') {
        this.applyTheme();
      }
    });
  }

  setDefaultDates() {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    document.getElementById('date-to').value = today.toISOString().split('T')[0];
    document.getElementById('date-from').value = firstOfMonth.toISOString().split('T')[0];
  }

  async loadData() {
    this.showLoading();

    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_PROCESSED_DATA' });

      if (response.data && response.data.length > 0) {
        this.data = response.data;
        this.filteredData = [...this.data];

        // Update date inputs if date range is stored
        if (response.dateRange) {
          console.log('[Claude Extension] Loading date range:', response.dateRange);
          document.getElementById('date-from').value = response.dateRange.startDate;
          document.getElementById('date-to').value = response.dateRange.endDate;
        } else {
          console.log('[Claude Extension] No date range stored, using defaults');
        }

        this.render();
        this.updateFooter(response.lastUpdated);
      } else {
        this.showEmptyState();
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      this.showEmptyState('Error loading data');
    }
  }

  populateFilters() {
    // Removed - no longer using model/token/usage/geo filters
  }

  populateSelect(id, values) {
    // Removed - no longer using model/token/usage/geo filters
  }

  applyFilters() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;

    console.log('[Claude Extension] Applying filters:', { dateFrom, dateTo });

    // Show loading indicator while filtering
    this.showLoadingIndicator();

    chrome.runtime.sendMessage({
      action: 'GET_FILTERED_DATA',
      filters: { dateFrom, dateTo }
    }, (response) => {
      console.log('[Claude Extension] Filter response received:', response?.data?.length, 'users');
      this.filteredData = response.data || [];
      this.applyLocalFilters();

      // Hide loading after a short delay to ensure visibility
      setTimeout(() => {
        this.hideLoadingIndicator();
      }, 300);
    });
  }

  applyLocalFilters() {
    let filtered = this.filteredData;

    // Apply search query
    if (this.searchQuery) {
      filtered = filtered.filter(user =>
        user.username.toLowerCase().includes(this.searchQuery)
      );
    }

    // Store temporarily for rendering
    const tempFiltered = this.filteredData;
    this.filteredData = filtered;
    this.render();
    this.filteredData = tempFiltered;
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

      if (typeof aVal === 'string') {
        return aVal.localeCompare(bVal) * multiplier;
      }
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

      // Click entire row to toggle details
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        this.toggleUserDetails(user.username, row);
      });

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

    // If details row already exists, remove it
    if (existingDetails && existingDetails.classList.contains('details-row-expanded')) {
      existingDetails.remove();
      return;
    }

    // Close any other open details
    document.querySelectorAll('.details-row-expanded').forEach(el => el.remove());

    // Use filteredData to reflect current filters
    const user = this.filteredData.find(u => u.username === username);
    if (!user) return;

    // Sort dates chronologically
    const sortedDates = Object.entries(user.breakdown.byDate)
      .sort((a, b) => a[0].localeCompare(b[0]));

    // Create details row with cost per day table
    const detailsRow = document.createElement('tr');
    detailsRow.classList.add('details-row-expanded');

    detailsRow.innerHTML = `
      <td colspan="4" class="details-cell">
        <div class="details-content-inline">
          <div class="details-section full-width">
            <h4>Cost Per Day</h4>
            <table class="cost-per-day-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cost</th>
                </tr>
              </thead>
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

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
  }

  async refreshData() {
    console.log('[Claude Extension] Refresh button clicked');

    // Show loading indicator
    this.showLoadingIndicator();

    // Reload date range from storage first
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_PROCESSED_DATA' });
      if (response.dateRange) {
        console.log('[Claude Extension] Refreshing with date range:', response.dateRange);
        document.getElementById('date-from').value = response.dateRange.startDate;
        document.getElementById('date-to').value = response.dateRange.endDate;
      }
    } catch (error) {
      console.error('[Claude Extension] Failed to reload date range:', error);
    }

    // Apply current filters when refreshing (this will trigger the filter logic)
    this.applyFilters();
  }

  showLoading() {
    document.getElementById('table-body').innerHTML = `
      <tr><td colspan="5" class="loading">Loading...</td></tr>
    `;
  }

  showEmptyState(message = 'No data available. Visit platform.claude.com to capture usage data.') {
    document.getElementById('table-body').innerHTML = `
      <tr><td colspan="5" class="empty-state">
        <p>${message}</p>
      </td></tr>
    `;
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
