const db = require('./db');

const ACCOUNTS_URL = 'https://accounts.spotify.com';
const API_URL = 'https://api.spotify.com/v1';

// Get credentials from DB, users table, or environment variables
async function getCredentials(spotifyUserId = null) {
  const client_id = (await db.getConfig('client_id')) || process.env.SPOTIFY_CLIENT_ID;
  const client_secret = (await db.getConfig('client_secret')) || process.env.SPOTIFY_CLIENT_SECRET;
  
  let refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;
  let access_token = process.env.SPOTIFY_ACCESS_TOKEN;
  let expires_at = process.env.SPOTIFY_TOKEN_EXPIRES_AT;

  if (spotifyUserId) {
    const user = await db.getUser(spotifyUserId);
    if (user) {
      refresh_token = user.refresh_token;
      access_token = user.access_token;
      expires_at = user.token_expires_at;
    }
  } else {
    const db_refresh = await db.getConfig('refresh_token');
    if (db_refresh) {
      refresh_token = db_refresh;
      access_token = await db.getConfig('access_token');
      expires_at = await db.getConfig('token_expires_at');
    }
  }

  return { client_id, client_secret, refresh_token, access_token, expires_at };
}

// Generate the authorization URL
function getAuthUrl(clientId, redirectUri) {
  const scopes = [
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-read-recently-played',
    'user-read-playback-position',
    'user-top-read'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes,
    show_dialog: 'true'
  });

  return `${ACCOUNTS_URL}/authorize?${params.toString()}`;
}

// Helper to fetch user details using raw access token (used during login callback)
async function getUserProfileWithToken(token) {
  const response = await fetch(`${API_URL}/me`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error('Failed to fetch user profile details.');
  }
  const data = await response.json();
  return {
    spotify_user_id: data.id,
    display_name: data.display_name,
    avatar_url: data.images?.[0]?.url || null,
    profile_url: data.external_urls?.spotify || null
  };
}

// Exchange authorization code for tokens
async function exchangeCode(code, redirectUri) {
  const { client_id, client_secret } = await getCredentials();
  
  if (!client_id || !client_secret) {
    throw new Error('Spotify Client ID or Client Secret not configured.');
  }

  const response = await fetch(`${ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Failed to exchange authorization code.');
  }

  const now = Date.now();
  const expiresAt = now + (data.expires_in * 1000);

  // Retrieve user details from Spotify
  const profile = await getUserProfileWithToken(data.access_token);

  // Save tokens to DB under their specific Spotify ID
  await db.saveUser({
    spotify_user_id: profile.spotify_user_id,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    access_token: data.access_token,
    refresh_token: data.refresh_token || '',
    token_expires_at: expiresAt.toString()
  });

  return { ...data, spotify_user_id: profile.spotify_user_id };
}

// Refresh access token
async function refreshAccessToken(spotifyUserId) {
  const { client_id, client_secret, refresh_token } = await getCredentials(spotifyUserId);

  if (!client_id || !client_secret) {
    throw new Error('Spotify Client ID or Client Secret not configured.');
  }
  if (!refresh_token) {
    throw new Error('Spotify Refresh Token not available. User needs to login.');
  }

  const response = await fetch(`${ACCOUNTS_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    })
  });

  const data = await response.json();
  if (!response.ok) {
    if (data.error === 'invalid_grant' && spotifyUserId) {
      // Clear credentials
      const user = await db.getUser(spotifyUserId);
      if (user) {
        user.refresh_token = '';
        user.access_token = '';
        await db.saveUser(user);
      }
    }
    throw new Error(data.error_description || data.error || 'Failed to refresh access token.');
  }

  const now = Date.now();
  const expiresAt = now + (data.expires_in * 1000);

  if (spotifyUserId) {
    const user = await db.getUser(spotifyUserId);
    if (user) {
      user.access_token = data.access_token;
      user.token_expires_at = expiresAt.toString();
      if (data.refresh_token) {
        user.refresh_token = data.refresh_token;
      }
      await db.saveUser(user);
    }
  } else {
    await db.setConfig('access_token', data.access_token);
    await db.setConfig('token_expires_at', expiresAt.toString());
    if (data.refresh_token) {
      await db.setConfig('refresh_token', data.refresh_token);
    }
  }

  return data.access_token;
}

// Get valid access token, refreshing if necessary
async function getValidAccessToken(spotifyUserId) {
  const { access_token, expires_at, refresh_token } = await getCredentials(spotifyUserId);

  if (!refresh_token) {
    return null; // Not logged in
  }

  const now = Date.now();
  // Refresh if missing or expiring in less than 5 minutes
  if (!access_token || !expires_at || now >= (parseInt(expires_at) - 300000)) {
    try {
      console.log(`Access token expired or expiring soon for user ${spotifyUserId}, refreshing...`);
      return await refreshAccessToken(spotifyUserId);
    } catch (err) {
      console.error(`Failed to refresh access token for user ${spotifyUserId}:`, err.message);
      return null;
    }
  }

  return access_token;
}

// Make an authenticated Spotify API request, automatically retrying once on 401
async function spotifyFetch(spotifyUserId, endpoint, options = {}) {
  let token = await getValidAccessToken(spotifyUserId);
  if (!token) {
    throw new Error('Not authenticated with Spotify.');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;
  
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };

  let response = await fetch(url, options);

  if (response.status === 401) {
    console.log('Received 401 Unauthorized. Retrying after token refresh...');
    token = await refreshAccessToken(spotifyUserId);
    options.headers['Authorization'] = `Bearer ${token}`;
    response = await fetch(url, options);
  }

  if (response.status === 204) {
    return null; // No content (e.g. not playing anything)
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Spotify API error (${response.status}): ${errText}`);
  }

  return await response.json();
}

// Fetch episode details by ID
async function getEpisode(spotifyUserId, episodeId) {
  try {
    return await spotifyFetch(spotifyUserId, `/episodes/${episodeId}`);
  } catch (err) {
    console.error('Error fetching episode details:', err.message);
    return null;
  }
}

// Fetch user's currently playing track (supporting songs and podcasts)
async function getCurrentlyPlaying(spotifyUserId) {
  try {
    const data = await spotifyFetch(spotifyUserId, '/me/player?additional_types=track,episode');
    if (!data || (!data.item && data.currently_playing_type !== 'episode')) {
      return { is_playing: false };
    }

    const isEpisode = data.currently_playing_type === 'episode' || (data.item && data.item.type === 'episode');
    
    let trackInfo = {};
    if (isEpisode) {
      if (data.item) {
        trackInfo = {
          spotify_id: data.item.id,
          title: data.item.name,
          artists: data.item.show ? data.item.show.name : 'Podcast',
          album: data.item.show ? data.item.show.publisher : 'Podcast Show',
          image_url: data.item.images?.[0]?.url || (data.item.show?.images?.[0]?.url || ''),
          duration_ms: data.item.duration_ms,
          is_podcast: true
        };
      } else {
        // Fallback for null item when playing podcast/episode
        let episodeId = null;
        if (data.context && data.context.uri && data.context.uri.includes(':episode:')) {
          episodeId = data.context.uri.split(':episode:')[1];
        }
        
        let episodeDetails = null;
        if (episodeId) {
          episodeDetails = await getEpisode(spotifyUserId, episodeId);
        }

        if (episodeDetails) {
          trackInfo = {
            spotify_id: episodeDetails.id,
            title: episodeDetails.name,
            artists: episodeDetails.show ? episodeDetails.show.name : 'Podcast',
            album: episodeDetails.show ? episodeDetails.show.publisher : 'Podcast Show',
            image_url: episodeDetails.images?.[0]?.url || (episodeDetails.show?.images?.[0]?.url || ''),
            duration_ms: episodeDetails.duration_ms,
            is_podcast: true
          };
        } else {
          trackInfo = {
            spotify_id: episodeId || 'unknown_episode',
            title: 'Podcast Episode',
            artists: 'Podcast',
            album: 'Podcast Show',
            image_url: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=200&auto=format&fit=crop',
            duration_ms: data.progress_ms || 0,
            is_podcast: true
          };
        }
      }
    } else {
      trackInfo = {
        spotify_id: data.item.id,
        title: data.item.name,
        artists: data.item.artists.map(a => a.name).join(', '),
        album: data.item.album.name,
        image_url: data.item.album.images?.[0]?.url || '',
        duration_ms: data.item.duration_ms,
        is_podcast: false
      };
    }

    return {
      is_playing: data.is_playing,
      progress_ms: data.progress_ms,
      duration_ms: data.item ? data.item.duration_ms : (trackInfo.duration_ms || 0),
      timestamp: data.timestamp, // Spotify API internal timestamp when progress was recorded
      track: trackInfo,
      device: data.device ? {
        name: data.device.name,
        type: data.device.type,
        volume_percent: data.device.volume_percent
      } : null,
      shuffle_state: data.shuffle_state,
      repeat_state: data.repeat_state
    };
  } catch (err) {
    console.error('Error in getCurrentlyPlaying:', err.message);
    return { is_playing: false, error: err.message };
  }
}

// Fetch recently played tracks (last 50)
async function getRecentlyPlayed(spotifyUserId) {
  try {
    const data = await spotifyFetch(spotifyUserId, '/me/player/recently-played?limit=50');
    if (!data || !data.items) {
      return [];
    }

    return data.items.map(item => ({
      played_at: item.played_at, // ISO String
      track: {
        spotify_id: item.track.id,
        title: item.track.name,
        artists: item.track.artists.map(a => a.name).join(', '),
        album: item.track.album.name,
        image_url: item.track.album.images?.[0]?.url || '',
        duration_ms: item.track.duration_ms
      }
    }));
  } catch (err) {
    console.error('Error in getRecentlyPlayed:', err.message);
    throw err;
  }
}

// Fetch user's profile info
async function getUserProfile(spotifyUserId) {
  try {
    const data = await spotifyFetch(spotifyUserId, '/me');
    return {
      display_name: data.display_name,
      avatar_url: data.images?.[0]?.url || null,
      profile_url: data.external_urls?.spotify || null
    };
  } catch (err) {
    console.error('Error in getUserProfile:', err.message);
    return null;
  }
}

// Fetch user's top artists from Spotify
async function getTopArtists(spotifyUserId, timeRange = 'medium_term', limit = 10) {
  try {
    const data = await spotifyFetch(spotifyUserId, `/me/top/artists?limit=${limit}&time_range=${timeRange}`);
    return data.items.map(item => ({
      name: item.name,
      image_url: item.images?.[0]?.url || '',
      spotify_url: item.external_urls?.spotify || ''
    }));
  } catch (err) {
    console.error('Error fetching top artists from Spotify API:', err.message);
    return null;
  }
}

// Fetch user's top tracks from Spotify
async function getTopTracks(spotifyUserId, timeRange = 'medium_term', limit = 10) {
  try {
    const data = await spotifyFetch(spotifyUserId, `/me/top/tracks?limit=${limit}&time_range=${timeRange}`);
    return data.items.map(item => ({
      title: item.name,
      artists: item.artists.map(a => a.name).join(', '),
      image_url: item.album.images?.[0]?.url || '',
      spotify_url: item.external_urls?.spotify || ''
    }));
  } catch (err) {
    console.error('Error fetching top tracks from Spotify API:', err.message);
    return null;
  }
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  refreshAccessToken,
  getValidAccessToken,
  getCurrentlyPlaying,
  getRecentlyPlayed,
  getCredentials,
  getUserProfile,
  getTopArtists,
  getTopTracks,
  getEpisode
};
