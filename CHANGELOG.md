# 📋 Changelog

All notable changes to Claude Usage Ranking extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-02

### ✨ Added
- 🔄 Auto-reload dropdown replacing the static refresh button — options: Refresh now, Off, Every 5s / 15s / 30s / 60s / 5min
- 💡 Visual active state (blue icon) on reload button when auto-reload is enabled
- 💾 Auto-reload interval persisted across sessions

## [1.0.2] - 2026-03-23

### 🎨 Improved
- 🔍 Add padding to username filter input for better UX
- 📊 Right-align Total Cost header with values for consistency
- 🏆 Highlight top 3 ranks (red) and top 4-10 (orange) for visual distinction

### 🐛 Fixed
- 🧹 Remove duplicate CSS rule for search input

## [1.0.1] - 2026-03-23

### ✨ Added
- 📦 Release script for automated builds (`scripts/release.sh`)
- 📅 60-day and 90-day date range presets for more flexible filtering

### 🔄 Changed
- 💾 Persist search and date range settings across sessions
- 🏷️ Updated manifest version to 1.0.1

### 🐛 Fixed
- 🔧 Settings now persist correctly when switching between tabs

## [1.0.0] - 2026-03-23

### ✨ Added
- 🚀 Initial release of Claude Usage Ranking extension
- 📊 View usage statistics and rankings for Claude conversations
- 🔍 Search functionality for filtering conversations
- 📅 Date range filtering with preset options (7, 14, 30 days)
- 📈 Token usage visualization
- 📤 Export data capability
