<div align="center">

# SPOTIFY TRACKER

**Self-hosted listening analytics. For people who take their music seriously.**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org)
[![Spotify API](https://img.shields.io/badge/Spotify%20Web%20API-1DB954?style=flat-square&logo=spotify&logoColor=white)](https://developer.spotify.com)
[![Gemini AI](https://img.shields.io/badge/Gemini%201.5%20Flash-4285F4?style=flat-square&logo=google&logoColor=white)](https://aistudio.google.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-ffffff?style=flat-square)](LICENSE)
[![Multi-User](https://img.shields.io/badge/Multi--User-Ready-1DB954?style=flat-square)](#multi-user)

</div>

---

## Overview

Spotify Tracker is a **fully self-hosted** web application that records every song, podcast and audio session you play on Spotify — including device name, volume, and playback progress — and transforms that raw telemetry into beautiful, personalized reports powered by **Google Gemini AI**.

No cloud subscriptions. No data leaving your machine. Just you and your music.

---

## Screenshots

<table>
  <tr>
    <td align="center" width="50%">
      <img src="assets/docs/Screenshot 2026-06-13 215405.png" alt="Login Portal" width="100%"/>
      <br/><sub><b>Multi-User Login Portal</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="assets/docs/Screenshot 2026-06-13 215325.png" alt="Dashboard" width="100%"/>
      <br/><sub><b>Analytics Dashboard</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="assets/docs/Screenshot 2026-06-13 215354.png" alt="Top Charts" width="100%"/>
      <br/><sub><b>Top Charts & Time Filters</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="assets/docs/Screenshot 2026-06-13 215416.png" alt="AI Reports" width="100%"/>
      <br/><sub><b>Gemini AI Reports</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <img src="assets/docs/Screenshot 2026-06-13 215434.png" alt="Wrapped Slideshow" width="100%"/>
      <br/><sub><b>Spotify Wrapped Slideshow</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="assets/docs/Screenshot 2026-06-13 215426.png" alt="Account Switcher" width="100%"/>
      <br/><sub><b>Account Switcher</b></sub>
    </td>
  </tr>
</table>

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| 🎯 | **Real-Time Tracking** | Polls the Spotify Web API every 30 seconds to capture active playback |
| 📊 | **Deep Telemetry** | Logs volume level, device name, device type, and progress per session |
| 🎙️ | **Podcast Support** | Full episode detection — including video podcasts — with artwork fallback |
| 📅 | **365-Day Activity Grid** | GitHub-style contribution calendar showing your daily listening volume |
| 🤖 | **Gemini AI Analytics** | Connects to Google Gemini 1.5 Flash (free tier) to generate daily music personality insights |
| 🎬 | **Spotify Wrapped Story** | Full-screen, swipeable slide deck recapping your year — locally, on demand |
| 👥 | **Multi-User** | Multiple people can connect their Spotify accounts and track independently |
| 💾 | **Full JSON Export** | Download your complete playback history as a structured JSON file |

---

## Architecture

```
spotify-tracker/
├── server.js          # Express server, OAuth flow, REST API
├── db.js              # SQLite schema, migrations, CRUD helpers
├── spotify.js         # Spotify Web API wrapper (multi-user, auto-refresh)
├── collector.js       # Background poller — history sync & telemetry snapshots
├── public/
│   ├── index.html     # Single-page app shell
│   ├── css/style.css  # Design system (OLED dark, CSS variables)
│   └── js/app.js      # Frontend logic, routing, Wrapped slideshow engine
└── assets/docs/       # Screenshots and documentation assets
```

---

## Quickstart

### 1 — Spotify Developer Setup

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and create a new app.
2. Under **Redirect URIs**, add:
   ```
   http://127.0.0.1:3000/api/auth/callback
   ```
3. Copy your **Client ID** and **Client Secret**.

### 2 — Run the Server

```bash
# Clone the repository
git clone https://github.com/EwigeTomate/Spotify-Tracker-.git
cd Spotify-Tracker-

# Install dependencies
npm install

# Start the tracker
npm start
```

Open **http://localhost:3000** in your browser.

### 3 — Connect Your Account

1. Navigate to **Setup & API** in the sidebar.
2. Enter your Spotify **Client ID** and **Client Secret**, then save.
3. Click **Mit Spotify verbinden** — you will be redirected through the OAuth flow.
4. Done. Tracking starts immediately in the background.

### 4 — Enable AI Reports *(optional)*

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/).
2. Open **AI-Analysen** in the library sidebar.
3. Paste your key and click **Täglichen Bericht generieren**.

---

## Multi-User

Multiple users can connect simultaneously. Each session is tracked independently with a dedicated user profile, separated history, and independent AI reports. Switch between accounts using the **account switcher** in the top bar.

---

## Tech Stack

- **Runtime** — Node.js + Express
- **Database** — SQLite (via `better-sqlite3`)
- **Spotify Integration** — Spotify Web API (OAuth 2.0, auto token refresh)
- **AI** — Google Gemini 1.5 Flash (free tier via `@google/generative-ai`)
- **Frontend** — Vanilla HTML, CSS (custom design system), JavaScript

---

## License

MIT © [EwigeTomate](https://github.com/EwigeTomate)
