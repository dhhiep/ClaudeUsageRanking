# Claude Usage Ranking

A Chrome extension that tracks and ranks Claude API usage costs per user within your organization's workspace. View costs by user, model, token type, and date — all from a convenient side panel.

## Why

The Claude Console shows aggregate usage, but doesn't rank individual users by cost. This extension directly calls the Claude usage API and presents a ranked leaderboard so you can quickly see who's spending what.

## Features

- **User cost ranking** — sorted leaderboard of all users by total spend
- **Date range presets** — Month to Date, Today, Yesterday, Last 7/30 Days, Last Month, or Custom
- **Per-user breakdown** — click a user to see cost per day, model, token type, and usage type
- **Direct API fetching** — calls Claude API directly using your session, independent of the platform page
- **Incremental caching** — only fetches missing dates, always refreshes today (UTC)
- **Cache toggle** — switch between cached (fast) and fresh (always re-fetch) modes
- **Platform sync** — changing the date filter on Claude platform auto-syncs to the side panel
- **Dark/light/auto theme** — matches your system preference or toggle manually
- **Side panel UI** — stays open alongside any page after first activation

## How It Works

1. Visit the Claude Console cost page once (`platform.claude.com/.../cost`) to activate
2. The extension captures your org/workspace IDs from the first API call
3. After activation, the extension directly calls the usage API using your session cookie
4. Data is cached per-date — past dates are stored permanently, today always re-fetches
5. Results are displayed in a Chrome side panel with search, sort, presets, and date filtering

## Install

### From source (developer mode)

1. Clone this repo:
   ```bash
   git clone https://github.com/cs-ventures/cc-ranking.git
   ```

2. Open Chrome and go to `chrome://extensions/`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked** and select the `src/` folder

5. Navigate to [platform.claude.com](https://platform.claude.com) and open the cost page (one-time activation)

6. Click the extension icon to open the side panel — data fetches automatically

### Updating

Pull latest changes and click the reload button on `chrome://extensions/`.

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Cache usage data and settings locally |
| `cookies` | Authenticate API calls with session cookie |
| `sidePanel` | Display ranking UI |
| `tabs` | Detect active tab for platform sync |
| `host_permissions: platform.claude.com` | Direct API calls and ID capture |

## Project Structure

```
src/
├── manifest.json            # Extension manifest v3
├── service-worker.js        # API fetching, caching, data processing
├── content-script.js        # Bridge: relays IDs and URL changes to service worker
├── injected-script.js       # Captures org/workspace IDs, monitors URL changes
├── icons/                   # Extension icons
├── lib/
│   ├── data-processor.js    # Usage data processing utilities
│   ├── storage-manager.js   # Chrome storage helpers
│   └── username-extractor.js # Extract usernames from API key names
└── sidepanel/
    ├── sidepanel.html       # Side panel markup
    ├── sidepanel.css        # Styling with dark/light theme
    └── sidepanel.js         # UI controller with preset date ranges
```

## License

MIT
