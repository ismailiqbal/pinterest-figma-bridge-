/**
 * Figpins Bridge Server
 * 
 * Bridges Pinterest to Figma via WebSocket.
 * Supports both scraping (fallback) and Pinterest API methods.
 * 
 * @author Figpins
 * @version 2.0.0
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  port: process.env.PORT || 3333,
  pinterest: {
    appId: process.env.PINTEREST_APP_ID || '',
    appSecret: process.env.PINTEREST_APP_SECRET || '',
    redirectUri: process.env.PINTEREST_REDIRECT_URI || '',
    apiBase: 'https://api.pinterest.com/v5',
    oauthBase: 'https://api.pinterest.com/v5/oauth'
  },
  imageProxy: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    referer: 'https://www.pinterest.com/',
    maxSize: 50 * 1024 * 1024 // 50MB
  }
};

// ============================================================================
// EXPRESS SETUP
// ============================================================================

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const server = http.createServer(app);

// ============================================================================
// WEBSOCKET MANAGEMENT
// ============================================================================

const wss = new WebSocket.Server({ server });
const rooms = new Map(); // roomId -> Set<WebSocket>

/**
 * Handle new WebSocket connections
 */
wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleWebSocketMessage(ws, data);
    } catch (err) {
      console.error('[WS] Message parse error:', err.message);
    }
  });
  
  ws.on('close', () => {
    removeFromRoom(ws);
    console.log('[WS] Client disconnected');
  });
  
  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
  });
});

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(ws, data) {
  if (data.type === 'join' && data.roomId) {
    joinRoom(ws, data.roomId);
  }
}

/**
 * Add WebSocket to a room
 */
function joinRoom(ws, roomId) {
  // Remove from previous room if any
  removeFromRoom(ws);
  
  // Add to new room
  ws.roomId = roomId;
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId).add(ws);
  
  console.log(`[WS] Client joined room: ${roomId}`);
  ws.send(JSON.stringify({ type: 'joined', roomId }));
}

/**
 * Remove WebSocket from its room
 */
function removeFromRoom(ws) {
  if (ws.roomId && rooms.has(ws.roomId)) {
    rooms.get(ws.roomId).delete(ws);
    if (rooms.get(ws.roomId).size === 0) {
      rooms.delete(ws.roomId);
    }
  }
}

/**
 * Broadcast message to all clients in a room
 */
function broadcastToRoom(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) {
    console.warn(`[WS] Room ${roomId} not found`);
    return false;
  }
  
  const message = JSON.stringify(data);
  let sent = 0;
  
  room.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sent++;
    }
  });
  
  console.log(`[WS] Broadcast to room ${roomId}: ${sent} clients`);
  return sent > 0;
}

// Heartbeat to detect dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      removeFromRoom(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

/**
 * Fetch image with fallback URL strategies
 */
async function fetchImageWithFallback(url) {
  const headers = {
    'User-Agent': CONFIG.imageProxy.userAgent,
    'Referer': CONFIG.imageProxy.referer,
    'Accept': 'image/*'
  };

  // Strategy 1: Try original URL
  try {
    const response = await fetch(url, { headers });
    if (response.ok) return response;
  } catch (err) {
    console.log('[Image] Original URL failed:', err.message);
  }

  // Strategy 2: Try alternative Pinterest formats
  if (url.includes('pinimg.com')) {
    const alternatives = generateAlternativeUrls(url);
    
    for (const altUrl of alternatives) {
      try {
        const response = await fetch(altUrl, { headers });
        if (response.ok) {
          console.log('[Image] Alt URL success:', altUrl.substring(0, 60));
          return response;
        }
      } catch (err) {
        // Continue to next alternative
      }
    }
  }
  
  throw new Error('All image fetch strategies failed');
}

/**
 * Generate alternative Pinterest image URLs
 */
function generateAlternativeUrls(url) {
  const alternatives = [];
  
  if (url.includes('/originals/')) {
    alternatives.push(url.replace('/originals/', '/1200x/'));
    alternatives.push(url.replace('/originals/', '/736x/'));
    alternatives.push(url.replace('/originals/', '/564x/'));
  } else if (url.match(/\/\d+x\//)) {
    alternatives.push(url.replace(/\/\d+x\//, '/1200x/'));
    alternatives.push(url.replace(/\/\d+x\//, '/originals/'));
    alternatives.push(url.replace(/\/\d+x\//, '/736x/'));
  }
  
  return alternatives;
}

/**
 * Convert image response to base64 data URL
 */
async function imageToDataUrl(response) {
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  return `data:${contentType};base64,${base64}`;
}

// ============================================================================
// PINTEREST API UTILITIES
// ============================================================================

/**
 * Exchange OAuth authorization code for access token
 */
async function exchangeCodeForToken(code) {
  const { appId, appSecret, redirectUri, oauthBase } = CONFIG.pinterest;
  
  if (!appId || !appSecret) {
    throw new Error('Pinterest API credentials not configured');
  }
  
  const credentials = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  
  const response = await fetch(`${oauthBase}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Token exchange failed');
  }
  
  return data;
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(refreshToken) {
  const { appId, appSecret, oauthBase } = CONFIG.pinterest;
  
  const credentials = Buffer.from(`${appId}:${appSecret}`).toString('base64');
  
  const response = await fetch(`${oauthBase}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'Token refresh failed');
  }
  
  return data;
}

/**
 * Fetch pin data from Pinterest API
 */
async function fetchPinFromApi(pinId, accessToken) {
  const { apiBase } = CONFIG.pinterest;
  
  console.log('[API] Calling Pinterest API:', {
    url: `${apiBase}/pins/${pinId}`,
    pinId: pinId,
    tokenPrefix: accessToken.substring(0, 10) + '...'
  });
  
  const response = await fetch(`${apiBase}/pins/${pinId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  console.log('[API] Pinterest API Response Status:', response.status, response.statusText);
  
  const data = await response.json();
  
  console.log('[API] Pinterest API Response Body:', JSON.stringify(data, null, 2));
  
  if (!response.ok) {
    const errorMsg = data.message || data.error || `Pinterest API error: ${response.status}`;
    console.error('[API] Pinterest API Error Details:', {
      status: response.status,
      statusText: response.statusText,
      errorCode: data.code,
      errorMessage: data.message,
      error: data.error,
      fullResponse: data
    });
    throw new Error(errorMsg);
  }
  
  return data;
}

/**
 * Extract best image URL from pin data
 */
function extractImageUrl(pinData) {
  const media = pinData.media;
  
  if (!media) {
    throw new Error('Pin has no media');
  }
  
  // Priority: 1200x > originals > 600x > any available
  const images = media.images || {};
  
  if (images['1200x']?.url) return images['1200x'];
  if (images.originals?.url) return images.originals;
  if (images['600x']?.url) return images['600x'];
  
  // Fallback: get any available size
  const sizes = Object.keys(images);
  if (sizes.length > 0) {
    return images[sizes[0]];
  }
  
  throw new Error('No image found in pin media');
}

/**
 * Extract metadata from pin data
 */
function extractPinMetadata(pinData, pinId) {
  return {
    title: pinData.title || '',
    description: pinData.description || '',
    sourceUrl: pinData.link || `https://pinterest.com/pin/${pinId}`,
    boardId: pinData.board_id || null,
    createdAt: pinData.created_at || null
  };
}

// ============================================================================
// API ROUTES
// ============================================================================

/**
 * Health check endpoint
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Figpins Bridge',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * OAuth callback handler
 * Chrome extension redirects here after Pinterest auth
 * This page just needs to exist - the extension reads the URL params
 */
app.get('/auth/callback', (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    res.send(`
      <html>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
          <h2>Authorization Failed</h2>
          <p>${error}</p>
          <p>You can close this window.</p>
        </body>
      </html>
    `);
    return;
  }
  
  res.send(`
    <html>
      <body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h2>✓ Connected to Pinterest</h2>
        <p>You can close this window and return to the extension.</p>
        <script>
          // Signal completion to opener if possible
          if (window.opener) {
            window.opener.postMessage({ type: 'pinterest-auth-complete' }, '*');
          }
        </script>
      </body>
    </html>
  `);
});

/**
 * OAuth token exchange endpoint
 * POST /api/auth/token
 * Body: { code: string }
 */
app.post('/api/auth/token', async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ 
      success: false, 
      error: 'Authorization code required' 
    });
  }
  
  try {
    console.log('[Auth] Exchanging code for token...');
    const tokenData = await exchangeCodeForToken(code);
    
    console.log('[Auth] Token exchange successful');
    res.json({
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope
    });
  } catch (err) {
    console.error('[Auth] Token exchange failed:', err.message);
    res.status(400).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Token refresh endpoint
 * POST /api/auth/refresh
 * Body: { refresh_token: string }
 */
app.post('/api/auth/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  
  if (!refresh_token) {
    return res.status(400).json({ 
      success: false, 
      error: 'Refresh token required' 
    });
  }
  
  try {
    console.log('[Auth] Refreshing token...');
    const tokenData = await refreshAccessToken(refresh_token);
    
    console.log('[Auth] Token refresh successful');
    res.json({
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in
    });
  } catch (err) {
    console.error('[Auth] Token refresh failed:', err.message);
    res.status(400).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Send pin via Pinterest API
 * POST /api/send-pin
 * Body: { roomId: string, pinId: string, accessToken: string }
 */
app.post('/api/send-pin', async (req, res) => {
  const { roomId, pinId, accessToken } = req.body;
  
  // Validation
  if (!roomId) {
    return res.status(400).json({ success: false, error: 'Room ID required' });
  }
  if (!pinId) {
    return res.status(400).json({ success: false, error: 'Pin ID required' });
  }
  if (!accessToken) {
    return res.status(400).json({ success: false, error: 'Access token required' });
  }
  
  console.log(`[API] Processing pin ${pinId} for room ${roomId}`);
  
  try {
    // Step 1: Fetch pin data from Pinterest API
    console.log('[API] Fetching pin from Pinterest...');
    const pinData = await fetchPinFromApi(pinId, accessToken);
    
    // Step 2: Extract image URL and metadata
    const imageInfo = extractImageUrl(pinData);
    const metadata = extractPinMetadata(pinData, pinId);
    
    console.log('[API] Pin metadata:', { 
      title: metadata.title.substring(0, 30), 
      hasImage: !!imageInfo.url 
    });
    
    // Step 3: Fetch and convert image to base64
    console.log('[API] Fetching image...');
    const imageResponse = await fetchImageWithFallback(imageInfo.url);
    const dataUrl = await imageToDataUrl(imageResponse);
    
    console.log(`[API] Image converted (${dataUrl.length} bytes)`);
    
    // Step 4: Broadcast to Figma
    const payload = {
      type: 'new-image',
      url: dataUrl,
      width: imageInfo.width || 1200,
      height: imageInfo.height || 1200,
      title: metadata.title,
      description: metadata.description,
      sourceUrl: metadata.sourceUrl,
      pinId: pinId,
      timestamp: Date.now()
    };
    
    const sent = broadcastToRoom(roomId, payload);
    
    if (!sent) {
      return res.status(404).json({ 
        success: false, 
        error: 'No Figma clients connected to this room' 
      });
    }
    
    res.json({ success: true });
    
  } catch (err) {
    console.error('[API] Error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

/**
 * Legacy: Send image via URL scraping (fallback method)
 * POST /send-image-http
 * Body: { roomId: string, url: string, width?: number, height?: number }
 */
app.post('/send-image-http', async (req, res) => {
  const { roomId, url, width, height } = req.body;
  
  // Validation
  if (!roomId) {
    return res.status(400).json({ success: false, error: 'Room ID required' });
  }
  if (!url) {
    return res.status(400).json({ success: false, error: 'Image URL required' });
  }

  console.log(`[Scrape] Processing image for room ${roomId}`);
  
  try {
    // Fetch and convert image
    const imageResponse = await fetchImageWithFallback(url);
    const dataUrl = await imageToDataUrl(imageResponse);
    
    console.log(`[Scrape] Image converted (${dataUrl.length} bytes)`);
    
    // Broadcast to Figma (legacy format without metadata)
    const payload = {
      type: 'new-image',
      url: dataUrl,
      width: width || null,
      height: height || null,
      title: '',
      sourceUrl: '',
      pinId: '',
      timestamp: Date.now()
    };
    
    const sent = broadcastToRoom(roomId, payload);
    
    if (!sent) {
      return res.status(404).json({ 
        success: false, 
        error: 'No Figma clients connected to this room' 
      });
    }
    
    res.json({ success: true });
    
  } catch (err) {
    console.error('[Scrape] Error:', err.message);
    res.status(500).json({ 
      success: false, 
      error: 'Could not fetch image: ' + err.message 
    });
  }
});

/**
 * Debug: Get room info
 * GET /api/rooms/:roomId
 */
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  
  res.json({
    roomId,
    exists: !!room,
    clients: room ? room.size : 0
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

server.listen(CONFIG.port, () => {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║         FIGPINS BRIDGE SERVER v2.0         ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║  Port: ${CONFIG.port}                               ║`);
  console.log(`║  Pinterest API: ${CONFIG.pinterest.appId ? 'Configured' : 'Not configured'}            ║`);
  console.log('╚════════════════════════════════════════════╝');
});
