const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'spotify_tracker.db');
const db = new sqlite3.Database(dbPath);

// Helper to run query and return Promise (for INSERT, UPDATE, DELETE)
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

// Helper to get single row
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Helper to get all rows
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize tables with migrations
async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  
  await run(`
    CREATE TABLE IF NOT EXISTS tracks (
      spotify_id TEXT PRIMARY KEY,
      title TEXT,
      artists TEXT,
      album TEXT,
      duration_ms INTEGER,
      image_url TEXT
    )
  `);

  // 1. Create users table
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      spotify_user_id TEXT PRIMARY KEY,
      display_name TEXT,
      avatar_url TEXT,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TEXT
    )
  `);

  // 2. Migrate play_history table for multi-user support
  const tableInfo = await all(`PRAGMA table_info(play_history)`);
  const hasUserColumn = tableInfo.some(col => col.name === 'spotify_user_id');
  
  if (tableInfo.length > 0 && !hasUserColumn) {
    console.log('[Database] Migrating play_history to multi-user schema...');
    try {
      await run(`ALTER TABLE play_history RENAME TO play_history_old`);
      await run(`
        CREATE TABLE play_history (
          played_at TEXT,
          spotify_user_id TEXT,
          spotify_id TEXT,
          duration_ms INTEGER,
          PRIMARY KEY (played_at, spotify_user_id),
          FOREIGN KEY(spotify_id) REFERENCES tracks(spotify_id)
        )
      `);
      await run(`
        INSERT OR IGNORE INTO play_history (played_at, spotify_user_id, spotify_id, duration_ms)
        SELECT played_at, 'default_user', spotify_id, duration_ms FROM play_history_old
      `);
      await run(`DROP TABLE play_history_old`);
      console.log('[Database] play_history migration complete.');
    } catch (err) {
      console.error('[Database] Failed to migrate play_history table:', err.message);
    }
  } else if (tableInfo.length === 0) {
    await run(`
      CREATE TABLE play_history (
        played_at TEXT,
        spotify_user_id TEXT,
        spotify_id TEXT,
        duration_ms INTEGER,
        PRIMARY KEY (played_at, spotify_user_id),
        FOREIGN KEY(spotify_id) REFERENCES tracks(spotify_id)
      )
    `);
  }

  // Create an index on played_at and user for fast date-based queries
  await run(`
    CREATE INDEX IF NOT EXISTS idx_play_history_played_at_user 
    ON play_history(played_at, spotify_user_id)
  `);

  // 3. Create detailed playback logs table
  await run(`
    CREATE TABLE IF NOT EXISTS detailed_playback_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spotify_user_id TEXT,
      spotify_id TEXT,
      played_at TEXT,
      device_name TEXT,
      device_type TEXT,
      volume_percent INTEGER,
      progress_ms INTEGER,
      duration_ms INTEGER,
      is_podcast INTEGER
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_detailed_logs_user 
    ON detailed_playback_logs(spotify_user_id, played_at)
  `);

  // 4. Create AI reports table
  await run(`
    CREATE TABLE IF NOT EXISTS ai_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      spotify_user_id TEXT,
      report_date TEXT,
      report_type TEXT,
      content TEXT,
      music_personality TEXT
    )
  `);
  await run(`
    CREATE INDEX IF NOT EXISTS idx_ai_reports_user 
    ON ai_reports(spotify_user_id, report_date)
  `);
}

// Config CRUD
async function getConfig(key) {
  const row = await get('SELECT value FROM config WHERE key = ?', [key]);
  return row ? row.value : null;
}

async function setConfig(key, value) {
  await run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
}

// User CRUD operations
async function saveUser({ spotify_user_id, display_name, avatar_url, access_token, refresh_token, token_expires_at }) {
  return await run(`
    INSERT OR REPLACE INTO users (spotify_user_id, display_name, avatar_url, access_token, refresh_token, token_expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [spotify_user_id, display_name, avatar_url, access_token, refresh_token, token_expires_at]);
}

async function getUser(spotify_user_id) {
  return await get('SELECT * FROM users WHERE spotify_user_id = ?', [spotify_user_id]);
}

async function getUsers() {
  return await all('SELECT * FROM users');
}

async function deleteUser(spotify_user_id) {
  await run('DELETE FROM play_history WHERE spotify_user_id = ?', [spotify_user_id]);
  await run('DELETE FROM detailed_playback_logs WHERE spotify_user_id = ?', [spotify_user_id]);
  await run('DELETE FROM ai_reports WHERE spotify_user_id = ?', [spotify_user_id]);
  return await run('DELETE FROM users WHERE spotify_user_id = ?', [spotify_user_id]);
}

// Save tracks and plays
async function saveTrack({ spotify_id, title, artists, album, duration_ms, image_url }) {
  return await run(`
    INSERT OR REPLACE INTO tracks (spotify_id, title, artists, album, duration_ms, image_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [spotify_id, title, artists, album, duration_ms, image_url]);
}

async function savePlay(played_at, spotify_user_id, spotify_id, duration_ms) {
  return await run(`
    INSERT OR IGNORE INTO play_history (played_at, spotify_user_id, spotify_id, duration_ms)
    VALUES (?, ?, ?, ?)
  `, [played_at, spotify_user_id, spotify_id, duration_ms]);
}

// Save detailed logs
async function saveDetailedPlaybackLog({ spotify_user_id, spotify_id, played_at, device_name, device_type, volume_percent, progress_ms, duration_ms, is_podcast }) {
  return await run(`
    INSERT INTO detailed_playback_logs (spotify_user_id, spotify_id, played_at, device_name, device_type, volume_percent, progress_ms, duration_ms, is_podcast)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [spotify_user_id, spotify_id, played_at, device_name, device_type, volume_percent, progress_ms, duration_ms, is_podcast]);
}

async function getDetailedPlaybackLogs(spotify_user_id, limit = 1000) {
  return await all(`
    SELECT 
      l.*,
      t.title,
      t.artists,
      t.album
    FROM detailed_playback_logs l
    LEFT JOIN tracks t ON l.spotify_id = t.spotify_id
    WHERE l.spotify_user_id = ?
    ORDER BY l.played_at DESC
    LIMIT ?
  `, [spotify_user_id, limit]);
}

// AI reports CRUD
async function saveAiReport({ spotify_user_id, report_date, report_type, content, music_personality }) {
  return await run(`
    INSERT INTO ai_reports (spotify_user_id, report_date, report_type, content, music_personality)
    VALUES (?, ?, ?, ?, ?)
  `, [spotify_user_id, report_date, report_type, content, music_personality]);
}

async function getAiReports(spotify_user_id) {
  return await all('SELECT * FROM ai_reports WHERE spotify_user_id = ? ORDER BY report_date DESC', [spotify_user_id]);
}

// Migrate history from temporary 'default_user' to active Spotify account User ID
async function updateDefaultUserHistory(actualUserId) {
  console.log(`[Database] Migrating history from 'default_user' to '${actualUserId}'...`);
  // Copy play history
  await run(`
    INSERT OR IGNORE INTO play_history (played_at, spotify_user_id, spotify_id, duration_ms)
    SELECT played_at, ?, spotify_id, duration_ms FROM play_history WHERE spotify_user_id = 'default_user'
  `, [actualUserId]);
  
  // Delete old default_user history
  await run(`DELETE FROM play_history WHERE spotify_user_id = 'default_user'`);
  
  // Copy detailed playback logs
  await run(`
    UPDATE detailed_playback_logs 
    SET spotify_user_id = ? 
    WHERE spotify_user_id = 'default_user'
  `, [actualUserId]);
  
  console.log('[Database] Default user history migration complete.');
}

// Fetch plays per day for the last 365 days (grouped by local date)
async function getActivityGrid(spotify_user_id, days = 365) {
  return await all(`
    SELECT 
      date(played_at, 'localtime') as date,
      COUNT(*) as count,
      SUM(duration_ms) as total_duration_ms
    FROM play_history
    WHERE spotify_user_id = ? AND played_at >= datetime('now', ?)
    GROUP BY date
    ORDER BY date ASC
  `, [spotify_user_id, `-${days} days`]);
}

// Fetch play history details for a specific local date
async function getPlaysForDate(spotify_user_id, localDate) {
  return await all(`
    SELECT 
      p.played_at,
      p.duration_ms,
      t.spotify_id,
      t.title,
      t.artists,
      t.album,
      t.image_url
    FROM play_history p
    JOIN tracks t ON p.spotify_id = t.spotify_id
    WHERE p.spotify_user_id = ? AND date(p.played_at, 'localtime') = ?
    ORDER BY p.played_at DESC
  `, [spotify_user_id, localDate]);
}

// Fetch overall play history
async function getHistory(spotify_user_id, limit = 100, offset = 0) {
  return await all(`
    SELECT 
      p.played_at,
      p.duration_ms,
      t.spotify_id,
      t.title,
      t.artists,
      t.album,
      t.image_url
    FROM play_history p
    JOIN tracks t ON p.spotify_id = t.spotify_id
    WHERE p.spotify_user_id = ?
    ORDER BY p.played_at DESC
    LIMIT ? OFFSET ?
  `, [spotify_user_id, limit, offset]);
}

// Fetch stats: top tracks, top artists, listening time distribution
async function getStats(spotify_user_id, timeRange = '30d') {
  let dateFilter = "-30 days";
  if (timeRange === '7d') dateFilter = "-7 days";
  else if (timeRange === '90d') dateFilter = "-90 days";
  else if (timeRange === '365d') dateFilter = "-365 days";
  else if (timeRange === 'all') dateFilter = "-100 years"; // Effectively all time

  const totalTime = await get(`
    SELECT 
      COUNT(*) as total_plays,
      SUM(duration_ms) as total_duration_ms
    FROM play_history
    WHERE spotify_user_id = ? AND played_at >= datetime('now', ?)
  `, [spotify_user_id, dateFilter]);

  const topTracks = await all(`
    SELECT 
      t.spotify_id,
      t.title,
      t.artists,
      t.album,
      t.image_url,
      COUNT(*) as play_count,
      SUM(p.duration_ms) as duration_ms
    FROM play_history p
    JOIN tracks t ON p.spotify_id = t.spotify_id
    WHERE p.spotify_user_id = ? AND p.played_at >= datetime('now', ?)
    GROUP BY t.spotify_id
    ORDER BY play_count DESC
    LIMIT 10
  `, [spotify_user_id, dateFilter]);

  const rawArtistStats = await all(`
    SELECT 
      t.artists,
      COUNT(*) as play_count,
      SUM(p.duration_ms) as duration_ms
    FROM play_history p
    JOIN tracks t ON p.spotify_id = t.spotify_id
    WHERE p.spotify_user_id = ? AND p.played_at >= datetime('now', ?)
    GROUP BY t.artists
  `, [spotify_user_id, dateFilter]);

  // Fetch hourly listening distribution (0-23 hours) in local time
  const hourlyStats = await all(`
    SELECT 
      strftime('%H', played_at, 'localtime') as hour,
      COUNT(*) as count
    FROM play_history
    WHERE spotify_user_id = ? AND played_at >= datetime('now', ?)
    GROUP BY hour
    ORDER BY hour ASC
  `, [spotify_user_id, dateFilter]);

  return {
    summary: {
      total_plays: totalTime.total_plays || 0,
      total_duration_ms: totalTime.total_duration_ms || 0
    },
    topTracks,
    rawArtistStats,
    hourlyStats
  };
}

module.exports = {
  initDb,
  getConfig,
  setConfig,
  saveTrack,
  savePlay,
  getActivityGrid,
  getPlaysForDate,
  getHistory,
  getStats,
  saveUser,
  getUser,
  getUsers,
  deleteUser,
  saveDetailedPlaybackLog,
  getDetailedPlaybackLogs,
  saveAiReport,
  getAiReports,
  updateDefaultUserHistory
};
