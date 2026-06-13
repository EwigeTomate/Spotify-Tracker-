require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const spotify = require('./spotify');
const collector = require('./collector');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multi-user request context middleware
app.use((req, res, next) => {
  req.spotifyUserId = req.headers['x-spotify-user-id'] || req.query.user_id || null;
  next();
});

// Helper to get Redirect URI dynamically
function getRedirectUri(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  let host = req.headers['x-forwarded-host'] || req.get('host') || '127.0.0.1:3000';
  if (host.includes('localhost')) {
    host = host.replace('localhost', '127.0.0.1');
  }
  return `${protocol}://${host}/api/auth/callback`;
}

// ----------------------------------------------------
// Authentication & Users API
// ----------------------------------------------------

// Get configuration and login status
app.get('/api/auth/status', async (req, res) => {
  try {
    const userId = req.spotifyUserId;
    const creds = await spotify.getCredentials(userId);
    const isConfigured = !!(creds.client_id && creds.client_secret);
    const isLoggedIn = !!creds.refresh_token;

    const geminiKey = await db.getConfig('gemini_api_key');
    const isGeminiConfigured = !!geminiKey;

    res.json({
      isConfigured,
      isLoggedIn,
      clientId: creds.client_id ? `${creds.client_id.substring(0, 4)}...${creds.client_id.substring(creds.client_id.length - 4)}` : null,
      isGeminiConfigured
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Configure client ID, Secret, and Gemini API key
app.post('/api/config', async (req, res) => {
  const { client_id, client_secret, gemini_api_key } = req.body;

  try {
    if (client_id && !client_id.includes('...')) {
      await db.setConfig('client_id', client_id.trim());
    }
    if (client_secret && client_secret !== '••••••••••••••••••••') {
      await db.setConfig('client_secret', client_secret.trim());
    }
    if (gemini_api_key !== undefined) {
      if (gemini_api_key === '' || !gemini_api_key.includes('••••••••')) {
        await db.setConfig('gemini_api_key', gemini_api_key.trim());
      }
    }
    res.json({ success: true, message: 'Einstellungen erfolgreich gespeichert!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login redirect to Spotify
app.get('/api/auth/login', async (req, res) => {
  try {
    const creds = await spotify.getCredentials();
    if (!creds.client_id) {
      return res.status(400).send('Spotify Client ID not configured. Please configure it in Settings first.');
    }
    const redirectUri = getRedirectUri(req);
    const authUrl = spotify.getAuthUrl(creds.client_id, redirectUri);
    res.redirect(authUrl);
  } catch (err) {
    res.status(500).send(`Authentication error: ${err.message}`);
  }
});

// OAuth Callback handler
app.get('/api/auth/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect('/?auth_error=missing_code');
  }

  try {
    const redirectUri = getRedirectUri(req);
    const tokenResult = await spotify.exchangeCode(code, redirectUri);
    const activeUserId = tokenResult.spotify_user_id;

    // Migrate default user history to this specific User ID
    await db.updateDefaultUserHistory(activeUserId);

    // Sync play history immediately
    collector.triggerSync();

    // Redirect to frontend, carrying logged-in User ID
    res.redirect(`/?auth_success=true&login_user_id=${activeUserId}`);
  } catch (err) {
    console.error('Callback error:', err.message);
    res.redirect(`/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

// List all connected Spotify users
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.getUsers();
    const sanitised = users.map(u => ({
      spotify_user_id: u.spotify_user_id,
      display_name: u.display_name,
      avatar_url: u.avatar_url
    }));
    res.json(sanitised);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect/Logout a specific user
app.post('/api/auth/logout-user', async (req, res) => {
  try {
    const { spotify_user_id } = req.body;
    if (!spotify_user_id) {
      return res.status(400).json({ error: 'User ID is required.' });
    }
    await db.deleteUser(spotify_user_id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Data & Tracking API
// ----------------------------------------------------

// Fetch what is currently playing for the active user context
app.get('/api/now-playing', async (req, res) => {
  try {
    const currentlyPlaying = await spotify.getCurrentlyPlaying(req.spotifyUserId);
    res.json(currentlyPlaying);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch user profile info
app.get('/api/user/profile', async (req, res) => {
  try {
    const profile = await spotify.getUserProfile(req.spotifyUserId);
    if (!profile) {
      return res.status(404).json({ error: 'No profile found or not authenticated.' });
    }
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force sync play history
app.post('/api/sync', async (req, res) => {
  try {
    await collector.triggerSync();
    res.json({ success: true, message: 'Sync triggered successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch activity grid (plays per day)
app.get('/api/activity-grid', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 365;
    const grid = await db.getActivityGrid(req.spotifyUserId, days);
    res.json(grid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch play history list (paginated)
app.get('/api/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const history = await db.getHistory(req.spotifyUserId, limit, offset);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch detailed tracks for a specific local date
app.get('/api/date-details', async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD).' });
  }

  try {
    const plays = await db.getPlaysForDate(req.spotifyUserId, date);
    res.json(plays);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export detailed listening history as a downloadable JSON file
app.get('/api/export', async (req, res) => {
  const userId = req.spotifyUserId;
  if (!userId) {
    return res.status(400).send('Not authorized. User ID header or query parameter is required.');
  }

  try {
    const plays = await db.getHistory(userId, 100000, 0);
    const detailedLogs = await db.getDetailedPlaybackLogs(userId, 100000);
    
    const exportData = {
      spotify_user_id: userId,
      exported_at: new Date().toISOString(),
      play_history: plays,
      detailed_playback_logs: detailedLogs
    };

    res.setHeader('Content-disposition', `attachment; filename=spotify_history_export_${userId}.json`);
    res.setHeader('Content-type', 'application/json');
    res.write(JSON.stringify(exportData, null, 2));
    res.end();
  } catch (err) {
    res.status(500).send(`Export failed: ${err.message}`);
  }
});

// Fetch stats overview
app.get('/api/stats', async (req, res) => {
  try {
    const userId = req.spotifyUserId;
    const timeRange = req.query.timeRange || '30d';
    const statsData = await db.getStats(userId, timeRange);

    // Map timeRange to Spotify time_range
    let spotifyRange = 'medium_term';
    if (timeRange === '7d' || timeRange === '30d') spotifyRange = 'short_term';
    else if (timeRange === '90d') spotifyRange = 'medium_term';
    else if (timeRange === 'all') spotifyRange = 'long_term';

    let topTracks = null;
    let topArtists = null;

    // Fetch from Spotify API to get rich artist avatars
    try {
      topTracks = await spotify.getTopTracks(userId, spotifyRange, 10);
      topArtists = await spotify.getTopArtists(userId, spotifyRange, 10);
    } catch (apiErr) {
      console.warn('[Stats] Failed to fetch top charts from Spotify API, using DB fallback:', apiErr.message);
    }

    if (!topTracks || topTracks.length === 0) {
      topTracks = statsData.topTracks.map(t => ({
        title: t.title,
        artists: t.artists,
        image_url: t.image_url,
        play_count: t.play_count,
        duration_ms: t.duration_ms
      }));
    }

    if (!topArtists || topArtists.length === 0) {
      const artistMap = {};
      for (const row of statsData.rawArtistStats) {
        const artists = row.artists.split(',').map(a => a.trim());
        for (const artist of artists) {
          if (!artistMap[artist]) {
            artistMap[artist] = { name: artist, play_count: 0, duration_ms: 0 };
          }
          artistMap[artist].play_count += row.play_count;
          artistMap[artist].duration_ms += row.duration_ms;
        }
      }
      topArtists = Object.values(artistMap)
        .sort((a, b) => b.play_count - a.play_count)
        .slice(0, 10)
        .map(a => ({
          name: a.name,
          image_url: '',
          play_count: a.play_count,
          duration_ms: a.duration_ms
        }));
    }

    res.json({
      summary: statsData.summary,
      topTracks,
      topArtists,
      hourlyStats: statsData.hourlyStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// Gemini AI Reports API
// ----------------------------------------------------

app.get('/api/reports', async (req, res) => {
  try {
    const reports = await db.getAiReports(req.spotifyUserId);
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/generate', async (req, res) => {
  const userId = req.spotifyUserId;
  const { type } = req.body; // 'daily' or 'wrapped'

  if (!userId) {
    return res.status(400).json({ error: 'Not authenticated with Spotify user context.' });
  }

  try {
    const apiKey = await db.getConfig('gemini_api_key');
    if (!apiKey) {
      return res.status(400).json({ error: 'Es wurde kein Gemini API Key in den Einstellungen hinterlegt.' });
    }

    const stats = await db.getStats(userId, type === 'wrapped' ? 'all' : '30d');
    const history = await db.getHistory(userId, 50, 0);
    const detailedLogs = await db.getDetailedPlaybackLogs(userId, 100);

    if (stats.summary.total_plays === 0) {
      return res.status(400).json({ error: 'Keine Spieldaten zum Analysieren vorhanden.' });
    }

    const topSongsText = stats.topTracks.slice(0, 5).map((t, idx) => `${idx + 1}. ${t.title} von ${t.artists} (${t.play_count || 1}x gehört)`).join('\n');
    const topArtistsText = stats.topArtists.slice(0, 5).map((a, idx) => `${idx + 1}. ${a.name} (${a.play_count || 1}x gehört)`).join('\n');
    const hourlyText = stats.hourlyStats.map(h => `${h.hour}:00 Uhr: ${h.count} Songs`).join('\n');

    // Aggregate devices and average volume
    const devices = {};
    let totalVol = 0;
    let volCount = 0;
    detailedLogs.forEach(log => {
      if (log.device_name) {
        devices[log.device_name] = (devices[log.device_name] || 0) + 1;
      }
      if (log.volume_percent !== undefined && log.volume_percent > 0) {
        totalVol += log.volume_percent;
        volCount++;
      }
    });
    const topDevice = Object.keys(devices).sort((a,b) => devices[b] - devices[a])[0] || 'Unbekanntes Gerät';
    const avgVol = volCount > 0 ? Math.round(totalVol / volCount) : 45;

    const promptText = `
Du bist ein humorvoller, geistreicher Musikjournalist und Analyst. Analysiere das Hörverhalten des Benutzers basierend auf den folgenden echten Daten aus seiner Spotify-Historie und erstelle einen detaillierten, kreativen Bericht im Markdown-Format.

PROFIL:
- Benutzer: ${userId}
- Berichtstyp: ${type === 'wrapped' ? 'Jahresrückblick (Spotify Wrapped Style)' : 'Tägliche bzw. monatliche Höranalyse'}

HÖRSTATISTIKEN:
- Insgesamt gehört: ${stats.summary.total_plays} Titel
- Gesamte Hörzeit: ${Math.round(stats.summary.total_duration_ms / (1000 * 60))} Minuten
- Lieblingsgerät: ${topDevice}
- Mittlere Lautstärke: ${avgVol}%

TOP 5 SONGS:
${topSongsText}

TOP 5 KÜNSTLER:
${topArtistsText}

ZEITVERTEILUNG DER HÖR-SESSIONS:
${hourlyText}

DEINE ANFORDERUNGEN:
1. Erstelle eine packende, witzige Schlagzeile (Überschrift).
2. Analysiere seine Top Songs & Künstler mit Humor. Mache freundliche, humorvolle Schlüsse über seine Gefühlswelt, Lebensstil oder Persönlichkeit.
3. Beziehe auch das Lieblingsgerät und die Lautstärke ein (z.B. "Volles Rohr auf den Kopfhörern...").
4. Definiere seine "Musik-Persönlichkeit" in genau 2 bis 4 einprägsamen Wörtern (z.B. "Nächtlicher Nostalgiker" oder "Koffein-Kopfnicker"). Schreibe dazu eine witzige Beschreibung (maximal 2 Sätze).
5. Nutze schönes Markdown mit Bulletpoints, Fettmarkierungen und Zitaten. Antworte ausschließlich auf Deutsch.

Gebe als Antwort ein valides JSON-Objekt zurück, das genau diese beiden Felder enthält:
- "music_personality": Der String mit der kurzen Musik-Persönlichkeit.
- "content": Der String mit dem Markdown-Bericht.

Antworte ausschließlich mit dem reinen JSON-Objekt. Verwende keine Markdown-Fences (\`\`\`json) darum herum, sondern starte direkt mit { und ende mit }.
`;

    console.log(`[Gemini] Sending prompt for ${userId} (${type} report)...`);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${errText}`);
    }

    const resultJson = await response.json();
    const resultText = resultJson.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resultText) {
      throw new Error('No content returned from Gemini API.');
    }

    const parsed = JSON.parse(resultText.trim());
    
    const reportData = {
      spotify_user_id: userId,
      report_date: new Date().toISOString().split('T')[0],
      report_type: type,
      content: parsed.content || 'Kein Berichtsinhalt generiert.',
      music_personality: parsed.music_personality || 'Unbekannter Musik-Fan'
    };

    await db.saveAiReport(reportData);
    res.json(reportData);
  } catch (err) {
    console.error('[Gemini Error]:', err.message);
    res.status(500).json({ error: `AI-Analyse fehlgeschlagen: ${err.message}` });
  }
});

// ----------------------------------------------------
// App Startup
// ----------------------------------------------------

async function startServer() {
  try {
    // 1. Initialize SQLite Database & migrations
    await db.initDb();
    console.log('[Database] SQLite initialized successfully.');

    // 2. Start Background Collector & Poller
    collector.startCollector(5); // poll every 5 minutes

    // 3. Start Listening
    app.listen(PORT, () => {
      console.log(`\n==================================================`);
      console.log(` Spotify Tracker running at: http://localhost:${PORT}`);
      console.log(`==================================================\n`);
    });
  } catch (err) {
    console.error('Server failed to start:', err.message);
    process.exit(1);
  }
}

startServer();
