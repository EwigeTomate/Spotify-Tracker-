# Spotify Listening Tracker & Analytics

A self-hosted, multi-user web application to track, analyze, and visualize your Spotify listening habits. Features detailed telemetry logging (volume, devices), Gemini 1.5 Flash AI-powered reports, and a full-screen interactive **Spotify Wrapped** story slideshow!

---

## 📸 Screenshots (Vorschau)

Here is a preview of the interface and features using your screenshots:

### 1. Login-Portal ("Wer hört gerade?")
A sleek, Netflix-style profile selection screen that manages access for multiple registered profiles.
![Wer hört gerade Portal](bilde/Screenshot%202026-06-13%20215405.png)

### 2. Main Dashboard & Telemetry Stats
Visualizes quick statistics (total hours, plays, daily averages) and recently played tracks.
![Dashboard & activity statistics](bilde/Screenshot%202026-06-13%20215325.png)

### 3. Top-Charts & Zeitfilter
Displays your most played tracks and artists with interactive time filters (7 days, 30 days, 90 days, All time).
![Top Charts](bilde/Screenshot%202026-06-13%20215354.png)

### 4. Gemini AI-Analysen
Connects with Google Gemini 1.5 Flash using your free AI Studio API Key to generate daily listener habits and music personality analysis.
![AI Reports & Gemini Setup](bilde/Screenshot%202026-06-13%20215416.png)

### 5. Spotify Wrapped Slideshow
An immersive, interactive slide deck story summarizing your listening highlights and custom AI personality.
![Spotify Wrapped Presentation](bilde/Screenshot%202026-06-13%20215434.png)

### 6. Konto wechseln Dropdown
Switch between different logged-in profiles instantly or export your full listening history in JSON format.
![Konto wechseln Dropdown](bilde/Screenshot%202026-06-13%20215426.png)

### 7. Verbindungs-Status
View the current sync state and verify player integration.
![Verbindungs-Status](bilde/Screenshot%202026-06-13%20212723.png)

---

## 🚀 Key Features

*   **Multi-User Portal**: Sleek profile selection screen and top-bar account switcher. Multiple users can concurrently connect accounts.
*   **Active Telemetry Logging**: Background poller records volume, device names, device types, and playback progress every 30 seconds.
*   **Podcast & Video-Podcast Support**: Correctly matches episode details and artwork using custom Spotify Web API fallbacks.
*   **GitHub-Style Activity Calendar**: Interactive 365-day grid visualizing historical playback volume with tooltips and day-by-day track listings.
*   **Google Gemini 1.5 Flash Integration**: Analyzes metrics to formulate witzige insights, headlines, and a custom music character description.
*   **Immersive Story Mode (Wrapped)**: Swipeable or tap-controlled slideshow with auto-advancing progress indicators recapping stats and sharing cards.

---

## 🛠️ Installation & Setup

### 1. Spotify App Configuration
1.  Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2.  Click **Create App** and name your application.
3.  Edit settings and add the following **Redirect URI**:
    ```text
    http://127.0.0.1:3000/api/auth/callback
    ```
4.  Copy the **Client ID** and **Client Secret**.

### 2. Running Locally
1.  Clone this repository to your local machine.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the tracker server:
    ```bash
    npm start
    ```
4.  Open `http://localhost:3000` in your web browser.
5.  Go to **Setup & API**, enter your Client ID/Secret, and save.
6.  Connect your Spotify account!

### 3. Enable AI Analytics
1.  Go to **AI-Analysen** in the library menu.
2.  Insert your free API Key from [Google AI Studio](https://aistudio.google.com/).
3.  Click **Täglichen Bericht generieren** or **Wrapped-Bericht generieren** to let Gemini analyze your listening telemetry.
