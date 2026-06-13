// ----------------------------------------------------
// Global State & Elements
// ----------------------------------------------------
let activeSpotifyUserId = localStorage.getItem('active_spotify_user_id') || null;

// Hook window.fetch globally to automatically append X-Spotify-User-Id header
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  options.headers = options.headers || {};
  if (activeSpotifyUserId) {
    if (options.headers instanceof Headers) {
      options.headers.set('x-spotify-user-id', activeSpotifyUserId);
    } else if (Array.isArray(options.headers)) {
      options.headers.push(['x-spotify-user-id', activeSpotifyUserId]);
    } else {
      options.headers['x-spotify-user-id'] = activeSpotifyUserId;
    }
  }
  return originalFetch(url, options);
};

let appState = {
  isConfigured: false,
  isLoggedIn: false,
  activeTimeRange: '30d',
  playbackTimer: null,
  currentPlayback: null,
  fetchPlaybackTimeout: null,
  isPolling: false,
  historyOffset: 0,
  historyLimit: 15
};

// UI Elements
const els = {
  syncBtn: document.getElementById('sync-btn'),
  syncIcon: document.getElementById('sync-icon'),
  logoutBtn: document.getElementById('logout-btn'),
  dashboardView: document.getElementById('dashboard-view'),
  chartsView: document.getElementById('charts-view'),
  historyView: document.getElementById('history-view'),
  habitsView: document.getElementById('habits-view'),
  setupView: document.getElementById('setup-view'),
  aiReportsView: document.getElementById('ai-reports-view'),
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toast-message'),
  
  // Navigation
  navItems: document.querySelectorAll('.nav-item'),
  libItems: document.querySelectorAll('.lib-item'),
  
  // User Profile
  profilePillBtn: document.getElementById('profile-pill-btn'),
  profileDropdown: document.getElementById('profile-dropdown'),
  userAvatar: document.getElementById('user-avatar'),
  userAvatarPlaceholder: document.getElementById('user-avatar-placeholder'),
  userName: document.getElementById('user-name'),

  // Bottom Playing Bar
  playerCard: document.getElementById('now-playing-bar'),
  playerStatus: document.getElementById('player-status-badge'),
  trackArt: document.getElementById('track-art'),
  vinylDisc: document.getElementById('vinyl-disc'),
  trackTitle: document.getElementById('track-title'),
  trackArtist: document.getElementById('track-artist'),
  progressFill: document.getElementById('player-progress'),
  currentTime: document.getElementById('current-time'),
  totalTime: document.getElementById('total-time'),
  deviceName: document.getElementById('device-name'),
  shuffleIcon: document.getElementById('shuffle-icon'),
  repeatIcon: document.getElementById('repeat-icon'),
  playIcon: document.getElementById('play-icon'),
  dynamicGlow: document.getElementById('hero-dynamic-glow'),

  // Config setup
  configForm: document.getElementById('config-form'),
  clientIdInput: document.getElementById('client_id'),
  clientSecretInput: document.getElementById('client_secret'),
  copyRedirectBtn: document.getElementById('copy-redirect-btn'),
  redirectUriDisplay: document.getElementById('redirect-uri-display'),
  loginSpotifyBtn: document.getElementById('login-spotify-btn'),
  saveConfigBtn: document.getElementById('save-config-btn'),

  // Stats summary
  statDuration: document.getElementById('stat-total-duration'),
  statDurationSub: document.getElementById('stat-total-days-sub'),
  statPlays: document.getElementById('stat-total-plays'),
  statAvgPlays: document.getElementById('stat-avg-plays'),
  statPeakHour: document.getElementById('stat-peak-hour'),

  // Calendar
  activityGrid: document.getElementById('activity-grid'),
  monthsLabels: document.getElementById('months-labels'),
  activitySummaryText: document.getElementById('activity-summary-text'),
  dayDetailsPanel: document.getElementById('day-details-panel'),
  detailsDateTitle: document.getElementById('details-date-title'),
  detailsDateSubtitle: document.getElementById('details-date-subtitle'),
  dayTracksList: document.getElementById('day-tracks-list'),
  closeDetailsBtn: document.getElementById('close-details-btn'),

  // Insights / Charts
  rangeTabs: document.querySelectorAll('.range-tab'),
  topTracksList: document.getElementById('top-tracks-list'),
  topArtistsList: document.getElementById('top-artists-list'),
  hourlyChart: document.getElementById('hourly-chart'),
  
  // Custom added elements
  recentPreviewGrid: document.getElementById('recent-preview-grid'),
  fullHistoryList: document.getElementById('full-history-list'),
  historyPrevBtn: document.getElementById('history-prev-btn'),
  historyNextBtn: document.getElementById('history-next-btn'),
  historyPageInfo: document.getElementById('history-page-info'),
  habitsSummaryDesc: document.getElementById('habits-summary-desc')
};

// ----------------------------------------------------
// Utility Functions (Formatting, Toast)
// ----------------------------------------------------

function showToast(message, type = 'success') {
  els.toastMessage.textContent = message;
  els.toast.className = 'toast'; // reset class
  if (type === 'error') els.toast.classList.add('toast-error');
  els.toast.classList.remove('hidden');

  setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 4000);
}

function formatTrackTime(ms) {
  if (isNaN(ms) || ms < 0) return '0:00';
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

function getRelativeTimeString(dateString) {
  const date = new Date(dateString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes} Uhr`;
}

// Safe Lucide icon call
function refreshIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

// ----------------------------------------------------
// Navigation & Views
// ----------------------------------------------------

function switchView(target) {
  // Update nav-items and lib-items active state
  document.querySelectorAll('.nav-item, .lib-item').forEach(item => {
    if (item.dataset.target === target) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle views
  const views = ['dashboard', 'charts', 'history', 'habits', 'setup', 'ai-reports'];
  views.forEach(v => {
    const el = document.getElementById(`${v}-view`);
    if (el) {
      if (v === target) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });

  // Contextual loading
  if (target === 'dashboard') {
    loadDashboardRecentPreview();
  } else if (target === 'history') {
    appState.historyOffset = 0;
    loadFullHistory();
    loadActivityGrid();
  } else if (target === 'ai-reports') {
    loadSavedReports();
    checkGeminiKeyStatus();
  }
}

// Bind click events on all nav and library items
document.querySelectorAll('.nav-item, .lib-item').forEach(item => {
  item.addEventListener('click', () => {
    const target = item.dataset.target;
    if (!target) return;
    
    // Prevent switching to content views if not logged in
    if (target !== 'setup' && !appState.isLoggedIn) {
      showToast('Bitte verknüpfe zuerst deinen Spotify Account!', 'error');
      return;
    }
    
    if (target === 'wrapped') {
      startWrappedSlideshow();
      return;
    }
    
    switchView(target);
  });
});

// Load the 6 recent plays on the Startseite (Dashboard)
async function loadDashboardRecentPreview() {
  if (!els.recentPreviewGrid) return;
  
  try {
    const res = await fetch('/api/history?limit=6');
    const history = await res.json();
    
    els.recentPreviewGrid.innerHTML = '';
    
    if (history.length === 0) {
      els.recentPreviewGrid.innerHTML = `
        <div class="subtitle" style="grid-column: span 3; padding: 1.5rem 0;">
          Keine kürzlich gespielten Titel vorhanden. Synchronisiere deine Daten oder spiele Musik ab!
        </div>
      `;
      return;
    }
    
    history.forEach(play => {
      const card = document.createElement('div');
      card.className = 'recent-preview-card';
      
      card.innerHTML = `
        <img class="recent-preview-art" src="${play.image_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop'}" alt="Cover">
        <div class="recent-preview-info">
          <h4>${play.title}</h4>
          <p>${play.artists}</p>
        </div>
        <button class="recent-play-hover-btn" title="Auf Spotify abspielen (Mock)">
          <i data-lucide="play"></i>
        </button>
      `;
      
      els.recentPreviewGrid.appendChild(card);
    });
    
    refreshIcons();
  } catch (err) {
    console.error('Error loading recent preview:', err);
  }
}

// Load full paginated history on the calendar subpage
async function loadFullHistory() {
  if (!els.fullHistoryList) return;
  els.fullHistoryList.innerHTML = '<p class="subtitle" style="padding: 1rem;">Lade Verlauf...</p>';
  
  try {
    const res = await fetch(`/api/history?limit=${appState.historyLimit}&offset=${appState.historyOffset}`);
    const history = await res.json();
    
    els.fullHistoryList.innerHTML = '';
    
    if (history.length === 0) {
      els.fullHistoryList.innerHTML = '<p class="subtitle" style="padding: 1rem;">Keine weiteren Titel im Verlauf.</p>';
      els.historyNextBtn.disabled = true;
      return;
    }
    
    history.forEach((play, idx) => {
      const row = document.createElement('div');
      row.className = 'history-row';
      
      const playNumber = appState.historyOffset + idx + 1;
      const playTime = new Date(play.played_at).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' Uhr';
      
      row.innerHTML = `
        <span class="history-row-rank">${playNumber}</span>
        <div class="history-row-track">
          <img class="history-row-art" src="${play.image_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop'}" alt="Cover">
          <div class="history-row-info">
            <h4>${play.title}</h4>
            <p>${play.artists}</p>
          </div>
        </div>
        <span class="history-row-album">${play.album || 'Unbekanntes Album'}</span>
        <span class="history-row-time">${playTime}</span>
        <span class="history-row-dur">${formatTrackTime(play.duration_ms)}</span>
      `;
      
      els.fullHistoryList.appendChild(row);
    });
    
    // Update buttons
    els.historyPrevBtn.disabled = appState.historyOffset === 0;
    els.historyNextBtn.disabled = history.length < appState.historyLimit;
    
    const currentPage = Math.floor(appState.historyOffset / appState.historyLimit) + 1;
    els.historyPageInfo.textContent = `Seite ${currentPage}`;
    
  } catch (err) {
    console.error('Error loading history:', err);
    els.fullHistoryList.innerHTML = '<p class="subtitle error" style="padding: 1rem;">Fehler beim Laden des Verlaufs.</p>';
  }
}

// Bind history pagination actions
if (els.historyPrevBtn && els.historyNextBtn) {
  els.historyPrevBtn.addEventListener('click', () => {
    if (appState.historyOffset >= appState.historyLimit) {
      appState.historyOffset -= appState.historyLimit;
      loadFullHistory();
    }
  });

  els.historyNextBtn.addEventListener('click', () => {
    appState.historyOffset += appState.historyLimit;
    loadFullHistory();
  });
}

// Profile Dropdown Toggle
els.profilePillBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  els.profileDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  els.profileDropdown.classList.add('hidden');
});

// ----------------------------------------------------
// Multi-User Switcher & Data Export
// ----------------------------------------------------

async function loadUsersDropdown() {
  const usersListEl = document.getElementById('users-list-dropdown');
  if (!usersListEl) return;

  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    
    usersListEl.innerHTML = '';
    
    if (users.length === 0) {
      usersListEl.innerHTML = '<div class="dropdown-header">Keine Konten verknüpft</div>';
      return;
    }
    
    users.forEach(user => {
      const btn = document.createElement('button');
      btn.className = 'dropdown-user-item';
      if (user.spotify_user_id === activeSpotifyUserId) {
        btn.classList.add('active-session');
      }
      
      const avatarHtml = user.avatar_url 
        ? `<img src="${user.avatar_url}" alt="Avatar">`
        : `<div class="avatar-placeholder"><i data-lucide="user"></i></div>`;
        
      btn.innerHTML = `
        ${avatarHtml}
        <span>${user.display_name || user.spotify_user_id}</span>
      `;
      
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        switchUserSession(user.spotify_user_id);
      });
      
      usersListEl.appendChild(btn);
    });
    
    refreshIcons();
  } catch (err) {
    console.error('Error loading users dropdown:', err);
  }
}

function switchUserSession(userId) {
  activeSpotifyUserId = userId;
  localStorage.setItem('active_spotify_user_id', userId);
  showToast(`Sitzung gewechselt zu: ${userId}`);
  els.profileDropdown.classList.add('hidden');
  
  // Recheck status / reload all views
  checkAuthStatus();
}

// Client-side Logout: sign out of active session while leaving DB syncing active
function logoutCurrentUser() {
  if (confirm('Möchtest du dich abmelden? Dein Hörverhalten wird im Hintergrund weiter erfasst.')) {
    localStorage.removeItem('active_spotify_user_id');
    activeSpotifyUserId = null;
    showToast('Erfolgreich abgemeldet!');
    els.profileDropdown.classList.add('hidden');
    stopPlaybackPolling();
    checkAuthStatus();
  }
}

// Server-side deletion: completely wipe user from database configuration
async function deleteCurrentUser() {
  if (!activeSpotifyUserId) return;
  if (confirm('Sync wirklich löschen? Alle Daten dieses Nutzers werden vom Server gelöscht und das Tracking gestoppt!')) {
    try {
      const res = await fetch('/api/auth/logout-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotify_user_id: activeSpotifyUserId })
      });
      if (res.ok) {
        showToast('Konto und Verlauf vom Server gelöscht!');
        localStorage.removeItem('active_spotify_user_id');
        activeSpotifyUserId = null;
        els.profileDropdown.classList.add('hidden');
        stopPlaybackPolling();
        checkAuthStatus();
      } else {
        showToast('Fehler beim Löschen des Kontos.', 'error');
      }
    } catch (err) {
      showToast('Verbindungsfehler beim Löschen des Kontos.', 'error');
    }
  }
}

// Bind custom logouts & export
els.logoutBtn.addEventListener('click', logoutCurrentUser);

const deleteAccountBtn = document.getElementById('delete-account-btn');
if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener('click', deleteCurrentUser);
}

const exportJsonBtn = document.getElementById('export-json-btn');
if (exportJsonBtn) {
  exportJsonBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeSpotifyUserId) {
      showToast('Kein aktiver Benutzer zum Exportieren.', 'error');
      return;
    }
    window.open(`/api/export?user_id=${activeSpotifyUserId}`, '_blank');
  });
}

// ----------------------------------------------------
// Auth Status & User Profile loading
// ----------------------------------------------------

async function loadUserProfile() {
  try {
    const res = await fetch('/api/user/profile');
    if (!res.ok) throw new Error('Not authorized');
    const data = await res.json();
    
    els.userName.textContent = data.display_name || 'Spotify User';
    if (data.avatar_url) {
      els.userAvatar.src = data.avatar_url;
      els.userAvatar.classList.remove('hidden');
      els.userAvatarPlaceholder.classList.add('hidden');
    } else {
      els.userAvatar.classList.add('hidden');
      els.userAvatarPlaceholder.classList.remove('hidden');
    }
  } catch (err) {
    els.userName.textContent = 'Spotify User';
    els.userAvatar.classList.add('hidden');
    els.userAvatarPlaceholder.classList.remove('hidden');
  }
  refreshIcons();
}

async function showLoginScreen() {
  const appLayout = document.querySelector('.app-layout');
  const loginScreen = document.getElementById('login-screen');
  const grid = document.getElementById('login-profiles-grid');
  
  appLayout.classList.add('hidden-layout');
  loginScreen.classList.remove('hidden');
  
  if (!grid) return;
  grid.innerHTML = '<p class="subtitle">Lade Profile...</p>';
  
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    
    grid.innerHTML = '';
    
    if (users.length === 0) {
      grid.innerHTML = `
        <div style="text-align: center; color: var(--sp-text-grey); padding: 1rem;">
          <p>Bisher sind keine Spotify-Konten mit diesem Tracker verknüpft.</p>
          <p style="font-size: 0.8rem; margin-top: 0.5rem;">Klicke unten auf "Neues Konto verknüpfen", um zu starten.</p>
        </div>
      `;
      return;
    }
    
    users.forEach(user => {
      const card = document.createElement('div');
      card.className = 'login-profile-card';
      
      const avatarHtml = user.avatar_url
        ? `<img class="login-profile-avatar" src="${user.avatar_url}" alt="Avatar">`
        : `<div class="avatar-placeholder"><i data-lucide="user"></i></div>`;
        
      card.innerHTML = `
        <div class="login-profile-avatar-wrapper">
          ${avatarHtml}
        </div>
        <span class="login-profile-name">${user.display_name || user.spotify_user_id}</span>
      `;
      
      card.addEventListener('click', () => {
        switchUserSession(user.spotify_user_id);
      });
      
      grid.appendChild(card);
    });
    
    refreshIcons();
  } catch (err) {
    console.error('Error loading login profiles:', err);
    grid.innerHTML = '<p class="subtitle error">Fehler beim Laden der Profile.</p>';
  }
}

async function checkAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    
    appState.isConfigured = data.isConfigured;
    appState.isLoggedIn = data.isLoggedIn;

    // Display host-specific redirect URI (automatically converting localhost to 127.0.0.1)
    let host = window.location.host;
    if (host.includes('localhost')) {
      host = host.replace('localhost', '127.0.0.1');
    }
    els.redirectUriDisplay.textContent = `${window.location.protocol}//${host}/api/auth/callback`;

    if (data.isConfigured) {
      els.clientIdInput.value = data.clientId || '';
      els.clientIdInput.disabled = true;
      els.clientSecretInput.value = '••••••••••••••••••••';
      els.clientSecretInput.disabled = true;
      els.saveConfigBtn.innerHTML = '<i data-lucide="check"></i> Gespeichert (Klicke zum Bearbeiten)';
      els.saveConfigBtn.className = 'btn btn-secondary';
      els.loginSpotifyBtn.classList.remove('disabled');
    } else {
      els.clientIdInput.disabled = false;
      els.clientSecretInput.disabled = false;
      els.saveConfigBtn.innerHTML = '<i data-lucide="save"></i> Einstellungen speichern';
      els.saveConfigBtn.className = 'btn btn-spotify-save';
      els.loginSpotifyBtn.classList.add('disabled');
    }

    if (!data.isConfigured) {
      // Setup not configured: force show setup view, hide login screen
      document.querySelector('.app-layout').classList.remove('hidden-layout');
      document.getElementById('login-screen').classList.add('hidden');
      els.userName.textContent = 'Nicht verbunden';
      els.userAvatar.classList.add('hidden');
      els.userAvatarPlaceholder.classList.remove('hidden');
      switchView('setup');
    } else if (data.isLoggedIn) {
      // Configured and Logged in: show app, hide login screen
      document.querySelector('.app-layout').classList.remove('hidden-layout');
      document.getElementById('login-screen').classList.add('hidden');
      loadUserProfile();
      loadUsersDropdown();
      initDashboard();
      switchView('dashboard');
    } else {
      // Configured but Not Logged In: show login selection screen, hide app layout!
      stopPlaybackPolling();
      showLoginScreen();
    }
    
    refreshIcons();
  } catch (err) {
    showToast('Fehler beim Abrufen des App-Status.', 'error');
  }
}

// Config Save Handler
els.configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (els.clientIdInput.disabled) {
    // Enable editing
    els.clientIdInput.disabled = false;
    els.clientSecretInput.disabled = false;
    els.saveConfigBtn.innerHTML = '<i data-lucide="save"></i> Einstellungen speichern';
    els.saveConfigBtn.className = 'btn btn-spotify-save';
    els.loginSpotifyBtn.classList.add('disabled');
    refreshIcons();
    return;
  }

  const client_id = els.clientIdInput.value.trim();
  const client_secret = els.clientSecretInput.value.trim();

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id, client_secret })
    });
    
    if (res.ok) {
      showToast('Zugangsdaten gespeichert! Bitte verknüpfe jetzt deinen Spotify Account.');
      checkAuthStatus();
    } else {
      const data = await res.json();
      showToast(data.error || 'Fehler beim Speichern.', 'error');
    }
  } catch (err) {
    showToast('Verbindungsfehler zum Server.', 'error');
  }
});

// Copy Redirect URI
els.copyRedirectBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(els.redirectUriDisplay.textContent);
  showToast('Redirect URI in die Zwischenablage kopiert!');
});

// Sync database history manually
els.syncBtn.addEventListener('click', async () => {
  els.syncIcon.classList.add('spin-animation');
  els.syncBtn.disabled = true;
  
  try {
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Historie erfolgreich synchronisiert!');
      loadActivityGrid();
      loadStatsAndInsights();
    } else {
      showToast(data.error || 'Fehler beim Abgleichen.', 'error');
    }
  } catch (err) {
    showToast('Verbindungsfehler bei der Synchronisierung.', 'error');
  } finally {
    els.syncIcon.classList.remove('spin-animation');
    els.syncBtn.disabled = false;
  }
});

// ----------------------------------------------------
// Playback Engine (Fix for the fast counting bug)
// ----------------------------------------------------

async function pollPlayback() {
  if (appState.isPolling || !appState.isLoggedIn) return;
  appState.isPolling = true;

  try {
    const res = await fetch('/api/now-playing');
    const data = await res.json();
    updatePlayerUI(data);
  } catch (err) {
    console.error('Playback poll error:', err);
  } finally {
    appState.isPolling = false;
    // Schedule next poll in 5 seconds
    appState.fetchPlaybackTimeout = setTimeout(pollPlayback, 5000);
  }
}

function startPlaybackPolling() {
  stopPlaybackPolling();
  pollPlayback();
}

function stopPlaybackPolling() {
  if (appState.fetchPlaybackTimeout) {
    clearTimeout(appState.fetchPlaybackTimeout);
    appState.fetchPlaybackTimeout = null;
  }
  if (appState.playbackTimer) {
    clearInterval(appState.playbackTimer);
    appState.playbackTimer = null;
  }
}

function triggerImmediatePlaybackCheck() {
  if (appState.fetchPlaybackTimeout) {
    clearTimeout(appState.fetchPlaybackTimeout);
    appState.fetchPlaybackTimeout = null;
  }
  pollPlayback();
}

function updatePlayerUI(data) {
  // Clear previous interpolation timer
  if (appState.playbackTimer) {
    clearInterval(appState.playbackTimer);
    appState.playbackTimer = null;
  }

  appState.currentPlayback = data;

  if (!data || !data.track) {
    // Offline / Not playing
    els.playerStatus.textContent = 'Offline';
    els.playerStatus.className = 'status-badge';
    els.playerCard.className = 'now-playing-bar';
    
    els.trackTitle.textContent = 'Nichts abgespielt';
    els.trackArtist.textContent = 'Keine Wiedergabe aktiv';
    els.trackArt.src = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop';
    
    els.progressFill.style.width = '0%';
    els.currentTime.textContent = '0:00';
    els.totalTime.textContent = '0:00';
    
    els.deviceName.textContent = 'Kein Gerät';
    els.shuffleIcon.classList.remove('active');
    els.repeatIcon.classList.remove('active');
    els.playIcon.className = 'play-icon';
    
    // Reset play/pause icon to play
    els.playIcon.setAttribute('data-lucide', 'play');
    
    // Reset hero dynamic glow
    els.dynamicGlow.style.background = 'linear-gradient(180deg, #1e3264 0%, #121212 100%)';
    refreshIcons();
    return;
  }

  const track = data.track;
  els.trackTitle.textContent = track.title;
  els.trackArtist.textContent = track.artists;
  
  if (track.image_url) {
    els.trackArt.src = track.image_url;
  }

  if (data.device) {
    els.deviceName.textContent = data.device.name;
    els.deviceName.parentElement.classList.add('active');
  } else {
    els.deviceName.textContent = 'Kein Gerät';
    els.deviceName.parentElement.classList.remove('active');
  }

  // Set Shuffle/Repeat Status
  if (data.shuffle_state) els.shuffleIcon.classList.add('active');
  else els.shuffleIcon.classList.remove('active');

  if (data.repeat_state && data.repeat_state !== 'off') els.repeatIcon.classList.add('active');
  else els.repeatIcon.classList.remove('active');

  // Set beautiful dynamic gradient color based on track details (for portfolio looks)
  const bannerColors = [
    'linear-gradient(180deg, #1e3264 0%, #121212 100%)', // Blue
    'linear-gradient(180deg, #15803d 0%, #121212 100%)', // Green
    'linear-gradient(180deg, #701a75 0%, #121212 100%)', // Purple
    'linear-gradient(180deg, #7c2d12 0%, #121212 100%)', // Red/Orange
    'linear-gradient(180deg, #0f172a 0%, #121212 100%)'  // Deep Slate
  ];
  const colorIndex = (track.title.length + track.artists.length) % bannerColors.length;
  els.dynamicGlow.style.background = bannerColors[colorIndex];

  els.totalTime.textContent = formatTrackTime(data.duration_ms);

  // Setup playback status CSS
  if (data.is_playing) {
    els.playerStatus.textContent = 'Wiedergabe';
    els.playerStatus.className = 'status-badge playing';
    els.playerCard.className = 'now-playing-bar is-active-playback';
    els.playIcon.setAttribute('data-lucide', 'pause');

    // SECURE INTERPOLATION: Use local system time since fetch to calculate elapsed milliseconds.
    // This is immune to server/client clock drifts.
    const localFetchTime = Date.now();
    const startProgress = data.progress_ms;

    function updateProgress() {
      const elapsed = Date.now() - localFetchTime;
      const current = Math.min(startProgress + elapsed, data.duration_ms);
      
      const pct = (current / data.duration_ms) * 100;
      els.progressFill.style.width = `${pct}%`;
      els.currentTime.textContent = formatTrackTime(current);

      if (current >= data.duration_ms) {
        // Track finished, stop timer and fetch state immediately
        clearInterval(appState.playbackTimer);
        appState.playbackTimer = null;
        setTimeout(triggerImmediatePlaybackCheck, 500);
      }
    }

    updateProgress();
    appState.playbackTimer = setInterval(updateProgress, 100);
  } else {
    els.playerStatus.textContent = 'Pausiert';
    els.playerStatus.className = 'status-badge paused';
    els.playerCard.className = 'now-playing-bar is-active-playback is-paused';
    els.playIcon.setAttribute('data-lucide', 'play');
    
    // Set static progress
    const pct = (data.progress_ms / data.duration_ms) * 100;
    els.progressFill.style.width = `${pct}%`;
    els.currentTime.textContent = formatTrackTime(data.progress_ms);
  }
  
  refreshIcons();
}

// ----------------------------------------------------
// GitHub-Style Activity Grid (Aligned Month Labels)
// ----------------------------------------------------

async function loadActivityGrid() {
  try {
    const res = await fetch('/api/activity-grid?days=365');
    const dbData = await res.json();
    
    // Map dates to values for quick lookup
    const activityMap = {};
    let totalPlaysInYear = 0;
    let totalDurationInYear = 0;

    dbData.forEach(row => {
      activityMap[row.date] = {
        count: row.count,
        duration: row.total_duration_ms
      };
      totalPlaysInYear += row.count;
      totalDurationInYear += row.total_duration_ms;
    });

    // Align grid start date to the Monday of 53 weeks ago
    const today = new Date();
    const todayDay = today.getDay();
    const startOffset = (todayDay + 6) % 7;
    
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (52 * 7) - startOffset);
    
    els.activityGrid.innerHTML = '';
    els.monthsLabels.innerHTML = '';
    
    let cellDate = new Date(startDate);
    const months = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    let lastMonthName = '';

    // 1. Generate month labels aligned to grid columns (53 columns)
    for (let week = 0; week < 53; week++) {
      const weekStartDate = new Date(startDate);
      weekStartDate.setDate(startDate.getDate() + week * 7);
      
      const monthName = months[weekStartDate.getMonth()];
      const label = document.createElement('span');
      
      if (monthName !== lastMonthName) {
        label.textContent = monthName;
        lastMonthName = monthName;
      } else {
        label.textContent = '';
      }
      
      els.monthsLabels.appendChild(label);
    }
    
    // 2. Generate 371 cells
    for (let i = 0; i < 371; i++) {
      const dateString = cellDate.toISOString().split('T')[0];
      const activity = activityMap[dateString] || { count: 0, duration: 0 };
      
      let lvl = 0;
      if (activity.count > 0) {
        if (activity.count <= 4) lvl = 1;
        else if (activity.count <= 9) lvl = 2;
        else if (activity.count <= 19) lvl = 3;
        else if (activity.count <= 34) lvl = 4;
        else lvl = 5;
      }
      
      const cell = document.createElement('div');
      cell.className = `grid-cell lvl-${lvl}`;
      cell.setAttribute('data-date', dateString);
      cell.setAttribute('data-count', activity.count);
      cell.setAttribute('data-duration', activity.duration);
      
      // Hover event
      cell.addEventListener('mouseenter', () => {
        const d = new Date(dateString).toLocaleDateString('de-DE', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
        const mins = Math.round(activity.duration / (1000 * 60));
        els.activitySummaryText.innerHTML = `<strong>${activity.count} Songs</strong> (${mins} Min.) am <strong>${d}</strong>`;
      });
      
      // Click event
      cell.addEventListener('click', () => {
        showDayDetails(dateString, activity.count, activity.duration);
      });
      
      els.activityGrid.appendChild(cell);
      
      // Move to next day
      cellDate.setDate(cellDate.getDate() + 1);
    }

    // Default info display
    const startD = new Date(startDate).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
    const endD = new Date(today).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
    els.activitySummaryText.textContent = `Historie von ${startD} bis ${endD} • ${totalPlaysInYear} Songs (${Math.round(totalDurationInYear / (1000 * 60 * 60))} Std.) gesamt`;

  } catch (err) {
    console.error('Error loading activity grid:', err);
  }
}

// ----------------------------------------------------
// Day Details Panel
// ----------------------------------------------------

async function showDayDetails(dateString, count, durationMs) {
  els.dayDetailsPanel.classList.remove('hidden');
  
  const prettyDate = new Date(dateString).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
  els.detailsDateTitle.textContent = prettyDate;
  els.detailsDateSubtitle.textContent = `${count} Songs gespielt (${Math.round(durationMs / 60000)} Minuten)`;
  els.dayTracksList.innerHTML = '<p class="subtitle">Lade Titel...</p>';

  try {
    const res = await fetch(`/api/date-details?date=${dateString}`);
    const tracks = await res.json();
    
    els.dayTracksList.innerHTML = '';
    
    if (tracks.length === 0) {
      els.dayTracksList.innerHTML = '<p class="subtitle">Keine Titel an diesem Tag aufgezeichnet.</p>';
      return;
    }
    
    tracks.forEach(play => {
      const item = document.createElement('div');
      item.className = 'day-track-item';
      
      const playTime = getRelativeTimeString(play.played_at);
      
      item.innerHTML = `
        <span class="track-time">${playTime}</span>
        <img class="track-mini-art" src="${play.image_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop'}" alt="Cover">
        <div class="track-info">
          <h4>${play.title}</h4>
          <p>${play.artists}</p>
        </div>
        <span class="track-dur">${formatTrackTime(play.duration_ms)}</span>
      `;
      
      els.dayTracksList.appendChild(item);
    });
    
    els.dayDetailsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    els.dayTracksList.innerHTML = '<p class="subtitle error">Fehler beim Laden der Titel.</p>';
  }
}

els.closeDetailsBtn.addEventListener('click', () => {
  els.dayDetailsPanel.classList.add('hidden');
});

// ----------------------------------------------------
// Stats & Charts loading
// ----------------------------------------------------

async function loadStatsAndInsights() {
  try {
    const res = await fetch(`/api/stats?timeRange=${appState.activeTimeRange}`);
    const data = await res.json();
    
    // 1. Populate summary boxes with days calculation
    const totalHours = Math.round((data.summary.total_duration_ms / (1000 * 60 * 60)) * 10) / 10;
    els.statDuration.textContent = `${totalHours.toLocaleString('de-DE')} Std.`;
    
    // Calculate days and remaining hours equivalence
    const days = Math.floor(totalHours / 24);
    const remainingHours = Math.round(totalHours % 24);
    els.statDurationSub.textContent = `entspricht ca. ${days} Tagen, ${remainingHours} Std.`;
    
    els.statPlays.textContent = data.summary.total_plays.toLocaleString('de-DE');
    
    let rangeDays = 30;
    if (appState.activeTimeRange === '7d') rangeDays = 7;
    else if (appState.activeTimeRange === '90d') rangeDays = 90;
    else if (appState.activeTimeRange === 'all') rangeDays = 365;
    
    const avg = Math.round((data.summary.total_plays / rangeDays) * 10) / 10;
    els.statAvgPlays.textContent = avg.toLocaleString('de-DE');

    // Find peak hour
    let peakHourStr = '-';
    if (data.hourlyStats && data.hourlyStats.length > 0) {
      const sortedHourly = [...data.hourlyStats].sort((a, b) => b.count - a.count);
      const peakHour = parseInt(sortedHourly[0].hour);
      peakHourStr = `${peakHour.toString().padStart(2, '0')}:00 Uhr`;
    }
    els.statPeakHour.textContent = peakHourStr;

    // 2. Populate Top Tracks
    els.topTracksList.innerHTML = '';
    if (data.topTracks.length === 0) {
      els.topTracksList.innerHTML = '<p class="subtitle" style="padding: 1rem 0;">Keine Spieldaten aufgezeichnet.</p>';
    } else {
      data.topTracks.forEach((item, idx) => {
        const cardItem = document.createElement('div');
        cardItem.className = 'chart-item';
        cardItem.innerHTML = `
          <span class="chart-rank">${idx + 1}</span>
          <img class="chart-art" src="${item.image_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop'}" alt="Cover">
          <div class="track-info">
            <h4>${item.title}</h4>
            <p>${item.artists}</p>
          </div>
          <div class="chart-count">
            ${item.play_count ? `<span class="chart-count-val">${item.play_count}x</span>` : ''}
            ${item.duration_ms ? `<span>${Math.round(item.duration_ms / 60000)} Min.</span>` : '<span class="chart-count-val">Titel</span>'}
          </div>
        `;
        els.topTracksList.appendChild(cardItem);
      });
    }

    // 3. Populate Top Artists
    els.topArtistsList.innerHTML = '';
    if (data.topArtists.length === 0) {
      els.topArtistsList.innerHTML = '<p class="subtitle" style="padding: 1rem 0;">Keine Spieldaten aufgezeichnet.</p>';
    } else {
      data.topArtists.forEach((item, idx) => {
        const cardItem = document.createElement('div');
        cardItem.className = 'chart-item';
        
        const initials = item.name.split(' ').map(n => n[0]).slice(0, 2).join('');
        const avatarHtml = item.image_url 
          ? `<img class="chart-art chart-artist-avatar" src="${item.image_url}" alt="${item.name}" style="border-radius: 50%;">`
          : `<div class="chart-artist-avatar">${initials}</div>`;
          
        cardItem.innerHTML = `
          <span class="chart-rank">${idx + 1}</span>
          ${avatarHtml}
          <div class="track-info">
            <h4>${item.name}</h4>
            <p>Künstler</p>
          </div>
          <div class="chart-count">
            ${item.play_count ? `<span class="chart-count-val">${item.play_count}x</span>` : ''}
            ${item.duration_ms ? `<span>${Math.round(item.duration_ms / 60000)} Min.</span>` : '<span class="chart-count-val">Künstler</span>'}
          </div>
        `;
        els.topArtistsList.appendChild(cardItem);
      });
    }

    // 4. Render Hourly Chart
    els.hourlyChart.innerHTML = '';
    const hourMap = {};
    for (let h = 0; h < 24; h++) hourMap[h.toString().padStart(2, '0')] = 0;
    
    let maxCount = 1;
    data.hourlyStats.forEach(row => {
      hourMap[row.hour] = row.count;
      if (row.count > maxCount) maxCount = row.count;
    });

    for (let h = 0; h < 24; h++) {
      const hourStr = h.toString().padStart(2, '0');
      const count = hourMap[hourStr];
      const pct = (count / maxCount) * 100;
      
      const barWrapper = document.createElement('div');
      barWrapper.className = 'hourly-bar-wrapper';
      barWrapper.setAttribute('data-tooltip', `${count} Songs um ${hourStr}:00`);
      
      const bar = document.createElement('div');
      bar.className = 'hourly-bar';
      bar.style.height = `${pct}%`;
      
      barWrapper.appendChild(bar);
      els.hourlyChart.appendChild(barWrapper);
    }

    // 5. Habits quadrant analysis
    if (data.hourlyStats && data.hourlyStats.length > 0 && els.habitsSummaryDesc) {
      let quadrants = {
        nacht: 0,
        morgen: 0,
        nachmittag: 0,
        abend: 0
      };
      
      data.hourlyStats.forEach(row => {
        const hr = parseInt(row.hour);
        const cnt = row.count;
        if (hr >= 0 && hr < 6) quadrants.nacht += cnt;
        else if (hr >= 6 && hr < 12) quadrants.morgen += cnt;
        else if (hr >= 12 && hr < 18) quadrants.nachmittag += cnt;
        else quadrants.abend += cnt;
      });
      
      let maxQuad = 'nachmittag';
      let maxVal = quadrants.nachmittag;
      
      if (quadrants.nacht > maxVal) { maxQuad = 'nacht'; maxVal = quadrants.nacht; }
      if (quadrants.morgen > maxVal) { maxQuad = 'morgen'; maxVal = quadrants.morgen; }
      if (quadrants.abend > maxVal) { maxQuad = 'abend'; maxVal = quadrants.abend; }
      
      const quadNames = {
        nacht: 'in der Nacht (00:00 - 06:00 Uhr)',
        morgen: 'am Morgen (06:00 - 12:00 Uhr)',
        nachmittag: 'am Nachmittag (12:00 - 18:00 Uhr)',
        abend: 'am Abend (18:00 - 24:00 Uhr)'
      };
      
      const quadTips = {
        nacht: 'Du bist scheinbar ein echter Nachtfalter! Musik hilft dir beim Fokussieren oder Entspannen in den späten Stunden.',
        morgen: 'Dein Tag startet mit Musik! Du nutzt Songs, um Energie für den Tag to tanken.',
        nachmittag: 'Der Nachmittag ist deine aktivste Phase! Musik begleitet dich bei der Arbeit oder in der Freizeit.',
        abend: 'Am Abend entspannst du am liebsten mit Musik. Ein perfekter Ausklang für deinen Tag.'
      };
      
      els.habitsSummaryDesc.innerHTML = `Die meisten deiner Songs hörst du <strong>${quadNames[maxQuad]}</strong>. ${quadTips[maxQuad]}`;
    }

  } catch (err) {
    console.error('Error loading stats and insights:', err);
  }
}

// Time range clicks handler
els.rangeTabs.forEach(tab => {
  tab.addEventListener('click', (e) => {
    els.rangeTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    appState.activeTimeRange = tab.dataset.range;
    loadStatsAndInsights();
  });
});

// ----------------------------------------------------
// Gemini AI integration
// ----------------------------------------------------

async function checkGeminiKeyStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    const input = document.getElementById('gemini-api-key-input');
    if (input) {
      if (data.isGeminiConfigured) {
        input.placeholder = 'API-Key hinterlegt (••••••••••••)';
        input.value = '';
      } else {
        input.placeholder = 'AI Studio API Key (AIzaSy...)';
      }
    }
  } catch (err) {
    console.error('Error checking Gemini key status:', err);
  }
}

async function saveGeminiKey() {
  const input = document.getElementById('gemini-api-key-input');
  if (!input) return;
  const key = input.value.trim();
  if (!key) {
    showToast('Bitte gib einen gültigen API Key ein.', 'error');
    return;
  }
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini_api_key: key })
    });
    if (res.ok) {
      showToast('Gemini API-Key erfolgreich gespeichert!');
      input.value = '';
      checkGeminiKeyStatus();
    } else {
      const data = await res.json();
      showToast(data.error || 'Fehler beim Speichern des Keys.', 'error');
    }
  } catch (err) {
    showToast('Verbindungsfehler.', 'error');
  }
}

async function generateAiReport(type) {
  const btn = type === 'daily' ? document.getElementById('generate-daily-btn') : document.getElementById('generate-wrapped-btn');
  if (!btn) return;
  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="spin-animation"></i> Generiere Bericht...`;
  refreshIcons();

  try {
    const res = await fetch('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('Bericht erfolgreich generiert!');
      await loadSavedReports();
      renderActiveReport(data);
    } else {
      showToast(data.error || 'Generierung fehlgeschlagen.', 'error');
    }
  } catch (err) {
    showToast('Verbindungsfehler bei der Berichtsgenerierung.', 'error');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    refreshIcons();
  }
}

async function loadSavedReports() {
  const listEl = document.getElementById('reports-history-list');
  if (!listEl) return;

  try {
    const res = await fetch('/api/reports');
    const reports = await res.json();
    
    listEl.innerHTML = '';
    if (reports.length === 0) {
      listEl.innerHTML = '<p class="no-data">Keine Berichte generiert</p>';
      return;
    }

    reports.forEach((report, idx) => {
      const item = document.createElement('div');
      item.className = 'report-history-item';
      if (idx === 0) {
        item.classList.add('active-report');
        renderActiveReport(report);
      }
      
      const formattedDate = new Date(report.report_date).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
      
      const typeLabel = report.report_type === 'wrapped' ? 'Wrapped' : 'Täglich';
      const typeClass = report.report_type === 'wrapped' ? 'wrapped-type' : '';
      
      item.innerHTML = `
        <div class="report-item-meta">
          <span class="report-item-title">${typeLabel}-Analyse</span>
          <span class="report-item-date">${formattedDate}</span>
        </div>
        <span class="report-item-type ${typeClass}">${report.report_type}</span>
      `;
      
      item.addEventListener('click', () => {
        document.querySelectorAll('.report-history-item').forEach(i => i.classList.remove('active-report'));
        item.classList.add('active-report');
        renderActiveReport(report);
      });
      
      listEl.appendChild(item);
    });
  } catch (err) {
    console.error('Error loading reports list:', err);
  }
}

function renderActiveReport(report) {
  const badge = document.getElementById('active-report-badge');
  const title = document.getElementById('active-report-title');
  const date = document.getElementById('active-report-date');
  const personalityContainer = document.getElementById('active-report-personality-container');
  const personalityVal = document.getElementById('active-report-personality');
  const contentBody = document.getElementById('report-content-body');

  if (!badge) return;

  badge.textContent = report.report_type === 'wrapped' ? 'SPOTIFY WRAPPED' : 'KI ANALYSE';
  title.textContent = report.report_type === 'wrapped' ? 'Dein Jahresrückblick' : 'Tägliche Analyse';
  
  const formattedDate = new Date(report.report_date).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  date.textContent = `Generiert am ${formattedDate}`;

  if (report.music_personality) {
    personalityVal.textContent = report.music_personality;
    personalityContainer.style.display = 'flex';
  } else {
    personalityContainer.style.display = 'none';
  }

  contentBody.innerHTML = parseMarkdown(report.content);
}

function parseMarkdown(md) {
  if (!md) return '';
  let html = md;
  // Headlines
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Unordered list items (grouped)
  html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)+/g, '<ul>$&</ul>');

  // Paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<li') || p.startsWith('<blockquote')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
  
  return html;
}

// Bind Gemini actions
const saveKeyBtn = document.getElementById('save-gemini-key-btn');
if (saveKeyBtn) {
  saveKeyBtn.addEventListener('click', saveGeminiKey);
}

const genDailyBtn = document.getElementById('generate-daily-btn');
if (genDailyBtn) {
  genDailyBtn.addEventListener('click', () => generateAiReport('daily'));
}

const genWrappedBtn = document.getElementById('generate-wrapped-btn');
if (genWrappedBtn) {
  genWrappedBtn.addEventListener('click', () => generateAiReport('wrapped'));
}

// ----------------------------------------------------
// Spotify Wrapped Slide Deck Presentation Logic
// ----------------------------------------------------

let wrappedState = {
  activeSlide: 0,
  totalSlides: 7,
  durationPerSlide: 8000,
  slideTimer: null,
  progressInterval: null,
  progressPct: 0,
  isPlaying: false,
  statsData: null,
  reportsData: null
};

async function startWrappedSlideshow() {
  showToast('Bereite deinen Jahresrückblick vor...');
  
  try {
    const statsRes = await fetch('/api/stats?timeRange=all');
    if (!statsRes.ok) throw new Error('Stats fetch failed');
    wrappedState.statsData = await statsRes.json();
    
    const reportsRes = await fetch('/api/reports');
    wrappedState.reportsData = await reportsRes.json();
    
    if (!wrappedState.statsData.summary.total_plays) {
      showToast('Keine Spieldaten für Wrapped vorhanden. Spiele zuerst Musik ab!', 'error');
      return;
    }
    
    populateWrappedSlides();
    
    const overlay = document.getElementById('wrapped-view');
    overlay.classList.remove('hidden');
    
    initWrappedProgressBars();
    
    wrappedState.activeSlide = 0;
    wrappedState.isPlaying = true;
    showSlide(0);
  } catch (err) {
    showToast(`Fehler beim Öffnen von Wrapped: ${err.message}`, 'error');
  }
}

function populateWrappedSlides() {
  const data = wrappedState.statsData;
  const reports = wrappedState.reportsData;
  
  // 1. Duration stats (Slide 2)
  const totalMins = Math.round(data.summary.total_duration_ms / 60000);
  document.getElementById('wrapped-duration-val').textContent = totalMins.toLocaleString('de-DE');
  const hours = Math.round(totalMins / 60);
  document.getElementById('wrapped-duration-desc').textContent = `Das entspricht etwa ${hours} Stunden purem Musikgenuss. Deine Ohren waren dieses Jahr extrem fleißig!`;
  
  // 2. Top Songs (Slide 3)
  const topSong = data.topTracks[0];
  const songCard = document.getElementById('wrapped-top-song-card-element');
  const songsList = document.getElementById('wrapped-top-songs-list');
  songsList.innerHTML = '';
  
  if (topSong) {
    document.getElementById('wrapped-top-song-img').src = topSong.image_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop';
    document.getElementById('wrapped-top-song-title').textContent = topSong.title;
    document.getElementById('wrapped-top-song-artists').textContent = topSong.artists;
    songCard.style.display = 'flex';
    
    data.topTracks.slice(1, 5).forEach((song, idx) => {
      const item = document.createElement('div');
      item.className = 'wrapped-list-item';
      item.innerHTML = `
        <span class="wrapped-list-num">${idx + 2}</span>
        <span class="wrapped-list-name">${song.title} <span style="color: var(--sp-text-grey); font-weight: normal;">- ${song.artists}</span></span>
      `;
      songsList.appendChild(item);
    });
  } else {
    songCard.style.display = 'none';
  }
  
  // 3. Top Artists (Slide 4)
  const topArtist = data.topArtists[0];
  const artistCard = document.getElementById('wrapped-top-artist-card-element');
  const artistsList = document.getElementById('wrapped-top-artists-list');
  artistsList.innerHTML = '';
  
  if (topArtist) {
    document.getElementById('wrapped-top-artist-img').src = topArtist.image_url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=100&auto=format&fit=crop';
    document.getElementById('wrapped-top-artist-name').textContent = topArtist.name;
    artistCard.style.display = 'flex';
    
    data.topArtists.slice(1, 5).forEach((artist, idx) => {
      const item = document.createElement('div');
      item.className = 'wrapped-list-item';
      item.innerHTML = `
        <span class="wrapped-list-num">${idx + 2}</span>
        <span class="wrapped-list-name">${artist.name}</span>
      `;
      artistsList.appendChild(item);
    });
  } else {
    artistCard.style.display = 'none';
  }
  
  // 4. Peak Hour (Slide 5)
  let peakHourStr = '22:00 Uhr';
  let peakDesc = 'Zu dieser Uhrzeit liefen bei dir die meisten Songs.';
  let peakIcon = 'moon';
  if (data.hourlyStats && data.hourlyStats.length > 0) {
    const sortedHourly = [...data.hourlyStats].sort((a, b) => b.count - a.count);
    const peakHour = parseInt(sortedHourly[0].hour);
    peakHourStr = `${peakHour.toString().padStart(2, '0')}:00 Uhr`;
    
    if (peakHour >= 0 && peakHour < 6) {
      peakDesc = 'Du bist ein absoluter Nachtschwärmer! Die späten Stunden gehören ganz deiner Musik.';
      peakIcon = 'moon';
    } else if (peakHour >= 6 && peakHour < 12) {
      peakDesc = 'Der frühe Vogel fängt den Beat! Du startest den Tag am liebsten mit Musik.';
      peakIcon = 'sun';
    } else if (peakHour >= 12 && peakHour < 18) {
      peakDesc = 'Mittags-Groover! Musik hilft dir dabei, das Nachmittagstief spielend zu überwinden.';
      peakIcon = 'coffee';
    } else {
      peakDesc = 'Abend-Geniesser! Musik ist dein Mittel zum Abschalten und Entspannen nach dem Tag.';
      peakIcon = 'music';
    }
  }
  document.getElementById('wrapped-peak-time-val').textContent = peakHourStr;
  document.getElementById('wrapped-peak-desc').textContent = peakDesc;
  const iconEl = document.getElementById('wrapped-peak-icon');
  if (iconEl) {
    iconEl.setAttribute('data-lucide', peakIcon);
  }
  
  // 5. AI Music Personality (Slide 6)
  const reportWithPersonality = reports.find(r => r.music_personality);
  let personalityTitle = 'Musik-Entdecker';
  let personalityDesc = 'Du liebst es, in verschiedene Genres einzutauchen und neue Klänge zu erforschen. Deine Playlists sind ein bunter Mix aus Abenteuern.';
  
  if (reportWithPersonality) {
    personalityTitle = reportWithPersonality.music_personality;
    const cleanContent = reportWithPersonality.content.replace(/[\#\>\*]/g, '').trim();
    const sentences = cleanContent.split(/[.!?]/);
    if (sentences.length > 0) {
      personalityDesc = sentences.slice(0, 2).join('.') + '.';
    }
  } else {
    personalityDesc = 'Tipp: Generiere einen AI-Bericht unter "AI-Analysen", um deine detaillierte, witzige Musik-Persönlichkeit freizuschalten!';
  }
  document.getElementById('wrapped-personality-title').textContent = personalityTitle;
  document.getElementById('wrapped-personality-desc').textContent = personalityDesc;
  
  // 6. Shareable Summary Card (Slide 7)
  document.getElementById('wrapped-sum-time').textContent = `${totalMins.toLocaleString('de-DE')} Min`;
  document.getElementById('wrapped-sum-song').textContent = topSong ? topSong.title : 'Keine Daten';
  document.getElementById('wrapped-sum-artist').textContent = topArtist ? topArtist.name : 'Keine Daten';
  document.getElementById('wrapped-sum-personality').textContent = personalityTitle;
  
  let peakLabel = 'Mischtyp';
  if (data.hourlyStats && data.hourlyStats.length > 0) {
    const sortedHourly = [...data.hourlyStats].sort((a, b) => b.count - a.count);
    const peakHour = parseInt(sortedHourly[0].hour);
    if (peakHour >= 0 && peakHour < 6) peakLabel = 'Nachtmensch';
    else if (peakHour >= 6 && peakHour < 12) peakLabel = 'Frühaufsteher';
    else if (peakHour >= 12 && peakHour < 18) peakLabel = 'Tagaktiver';
    else peakLabel = 'Abendmensch';
  }
  document.getElementById('wrapped-sum-peak').textContent = peakLabel;
  
  refreshIcons();
}

function initWrappedProgressBars() {
  const container = document.getElementById('wrapped-progress-container');
  container.innerHTML = '';
  
  for (let i = 0; i < wrappedState.totalSlides; i++) {
    const bar = document.createElement('div');
    bar.className = 'wrapped-progress-bar';
    bar.innerHTML = '<div class="wrapped-progress-fill"></div>';
    container.appendChild(bar);
  }
}

function showSlide(index) {
  if (index < 0 || index >= wrappedState.totalSlides) return;
  
  clearSlideTimers();
  
  wrappedState.activeSlide = index;
  
  for (let i = 1; i <= wrappedState.totalSlides; i++) {
    const slide = document.getElementById(`wrapped-slide-${i}`);
    if (slide) {
      if (i === index + 1) {
        slide.classList.add('active');
      } else {
        slide.classList.remove('active');
      }
    }
  }
  
  const fills = document.querySelectorAll('.wrapped-progress-fill');
  fills.forEach((fill, idx) => {
    if (idx < index) {
      fill.style.width = '100%';
    } else if (idx > index) {
      fill.style.width = '0%';
    }
  });
  
  const activeFill = fills[index];
  if (activeFill) {
    let start = Date.now();
    wrappedState.progressPct = 0;
    
    wrappedState.progressInterval = setInterval(() => {
      let elapsed = Date.now() - start;
      let pct = (elapsed / wrappedState.durationPerSlide) * 100;
      
      if (pct >= 100) {
        pct = 100;
        clearInterval(wrappedState.progressInterval);
        nextSlide();
      }
      
      activeFill.style.width = `${pct}%`;
    }, 50);
  }
}

function nextSlide() {
  if (wrappedState.activeSlide < wrappedState.totalSlides - 1) {
    showSlide(wrappedState.activeSlide + 1);
  } else {
    closeWrappedSlideshow();
  }
}

function prevSlide() {
  if (wrappedState.activeSlide > 0) {
    showSlide(wrappedState.activeSlide - 1);
  }
}

function clearSlideTimers() {
  if (wrappedState.progressInterval) {
    clearInterval(wrappedState.progressInterval);
    wrappedState.progressInterval = null;
  }
}

function closeWrappedSlideshow() {
  clearSlideTimers();
  wrappedState.isPlaying = false;
  document.getElementById('wrapped-view').classList.add('hidden');
}

// Bind Wrapped navigation actions
document.getElementById('wrapped-nav-left').addEventListener('click', () => {
  prevSlide();
});

document.getElementById('wrapped-nav-right').addEventListener('click', () => {
  nextSlide();
});

document.getElementById('close-wrapped-btn').addEventListener('click', () => {
  closeWrappedSlideshow();
});

document.getElementById('wrapped-restart-btn').addEventListener('click', () => {
  wrappedState.activeSlide = 0;
  showSlide(0);
});

document.addEventListener('keydown', (e) => {
  if (!wrappedState.isPlaying) return;
  if (e.key === 'ArrowRight' || e.key === 'Space' || e.key === ' ') {
    e.preventDefault();
    nextSlide();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    prevSlide();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeWrappedSlideshow();
  }
});

document.getElementById('wrapped-share-btn').addEventListener('click', () => {
  if (navigator.share) {
    navigator.share({
      title: 'Mein Spotify Wrapped 2026',
      text: `Ich habe dieses Jahr ${document.getElementById('wrapped-sum-time').textContent} Musik gehört! Mein Top Song ist ${document.getElementById('wrapped-sum-song').textContent} und mein Top Künstler ${document.getElementById('wrapped-sum-artist').textContent}.`,
      url: window.location.href
    }).catch(console.error);
  } else {
    const shareText = `Mein Spotify Wrapped 2026 🎵\n` +
      `⏱️ Hörzeit: ${document.getElementById('wrapped-sum-time').textContent}\n` +
      `🎶 Top Song: ${document.getElementById('wrapped-sum-song').textContent}\n` +
      `👤 Top Künstler: ${document.getElementById('wrapped-sum-artist').textContent}\n` +
      `🧠 Musik-Typ: ${document.getElementById('wrapped-sum-personality').textContent}\n` +
      `Erstellt mit Spotify Listening Tracker`;
      
    navigator.clipboard.writeText(shareText);
    showToast('Statistiken als Text in die Zwischenablage kopiert!');
  }
});

// ----------------------------------------------------
// Initialization
// ----------------------------------------------------

function initDashboard() {
  startPlaybackPolling();
  loadDashboardRecentPreview();
  loadActivityGrid();
  loadStatsAndInsights();
}

window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('auth_success')) {
    showToast('Erfolgreich mit Spotify verbunden! Dein Hörverlauf wird nun getrackt.');
    if (urlParams.has('login_user_id')) {
      activeSpotifyUserId = urlParams.get('login_user_id');
      localStorage.setItem('active_spotify_user_id', activeSpotifyUserId);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  if (urlParams.has('auth_error')) {
    showToast(`Fehler bei der Authentifizierung: ${urlParams.get('auth_error')}`, 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Hook up login setup redirect button
  const loginGoToSetup = document.getElementById('login-go-to-setup');
  if (loginGoToSetup) {
    loginGoToSetup.addEventListener('click', () => {
      const appLayout = document.querySelector('.app-layout');
      const loginScreen = document.getElementById('login-screen');
      appLayout.classList.remove('hidden-layout');
      loginScreen.classList.add('hidden');
      switchView('setup');
    });
  }

  checkAuthStatus();
});
