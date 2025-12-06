/**
 * Figpins - Extension Popup
 * Handles Pinterest OAuth and Figma pairing
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  bridgeServer: 'https://pinterest-figma-bridge.onrender.com',
  pinterest: {
    // Replace with your Pinterest App ID from developers.pinterest.com
    appId: '1539128',
    redirectUri: 'https://pinterest-figma-bridge.onrender.com/auth/callback',
    scope: 'pins:read'
  }
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  // Pinterest
  pinterestLabel: document.getElementById('pinterestLabel'),
  pinterestDetail: document.getElementById('pinterestDetail'),
  pinterestBtn: document.getElementById('pinterestBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  
  // Figma
  codeInput: document.getElementById('code'),
  connectBtn: document.getElementById('connectBtn'),
  
  // Status
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText')
};

// ============================================================================
// PINTEREST OAUTH
// ============================================================================

/**
 * Build Pinterest OAuth URL
 */
function buildPinterestAuthUrl() {
  const { appId, redirectUri, scope } = CONFIG.pinterest;
  const state = generateRandomState();
  
  // Save state for CSRF protection
  chrome.storage.local.set({ pinterestOAuthState: state });
  
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope,
    state: state
  });
  
  return `https://www.pinterest.com/oauth/?${params.toString()}`;
}

/**
 * Generate random state for CSRF protection
 */
function generateRandomState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Connect Pinterest account via OAuth
 */
async function connectPinterest() {
  try {
    elements.pinterestBtn.disabled = true;
    elements.pinterestBtn.innerHTML = 'Connecting...';
    
    const authUrl = buildPinterestAuthUrl();
    
    // Launch OAuth flow
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });
    
    if (!responseUrl) {
      throw new Error('OAuth flow cancelled');
    }
    
    // Extract authorization code from response
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    
    if (error) {
      throw new Error(`Pinterest error: ${error}`);
    }
    
    if (!code) {
      throw new Error('No authorization code received');
    }
    
    // Verify state for CSRF protection
    const { pinterestOAuthState } = await chrome.storage.local.get('pinterestOAuthState');
    if (state !== pinterestOAuthState) {
      throw new Error('Invalid OAuth state - possible CSRF attack');
    }
    
    // Exchange code for token via our server
    elements.pinterestBtn.innerHTML = 'Exchanging token...';
    
    const tokenResponse = await fetch(`${CONFIG.bridgeServer}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.success) {
      throw new Error(tokenData.error || 'Token exchange failed');
    }
    
    // Save token data
    const pinterestAuth = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_type: tokenData.token_type,
      expires_at: Date.now() + (tokenData.expires_in * 1000),
      scope: tokenData.scope
    };
    
    await chrome.storage.local.set({ pinterestAuth });
    
    // Update UI
    updatePinterestStatus(true);
    showStatus('Pinterest connected!', true);
    
  } catch (err) {
    console.error('[Figpins] OAuth error:', err);
    showStatus(err.message, false);
    updatePinterestStatus(false);
  } finally {
    elements.pinterestBtn.disabled = false;
  }
}

/**
 * Disconnect Pinterest account
 */
async function disconnectPinterest() {
  await chrome.storage.local.remove(['pinterestAuth', 'pinterestOAuthState']);
  updatePinterestStatus(false);
  showStatus('Pinterest disconnected', false);
}

/**
 * Check if Pinterest token is valid
 */
async function checkPinterestAuth() {
  const { pinterestAuth } = await chrome.storage.local.get('pinterestAuth');
  
  if (!pinterestAuth || !pinterestAuth.access_token) {
    return false;
  }
  
  // Check if token is expired (with 5 min buffer)
  if (pinterestAuth.expires_at && Date.now() > (pinterestAuth.expires_at - 300000)) {
    // Try to refresh
    if (pinterestAuth.refresh_token) {
      try {
        const refreshed = await refreshPinterestToken(pinterestAuth.refresh_token);
        return refreshed;
      } catch (err) {
        console.error('[Figpins] Token refresh failed:', err);
        return false;
      }
    }
    return false;
  }
  
  return true;
}

/**
 * Refresh Pinterest access token
 */
async function refreshPinterestToken(refreshToken) {
  const response = await fetch(`${CONFIG.bridgeServer}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Token refresh failed');
  }
  
  const pinterestAuth = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_at: Date.now() + (data.expires_in * 1000)
  };
  
  await chrome.storage.local.set({ pinterestAuth });
  return true;
}

/**
 * Update Pinterest status UI
 */
function updatePinterestStatus(connected) {
  if (connected) {
    elements.pinterestLabel.textContent = 'Connected';
    elements.pinterestDetail.textContent = 'Ready to send pins';
    elements.pinterestDetail.classList.add('connected');
    elements.pinterestBtn.classList.add('hidden');
    elements.disconnectBtn.classList.remove('hidden');
  } else {
    elements.pinterestLabel.textContent = 'Not Connected';
    elements.pinterestDetail.textContent = 'Click below to connect';
    elements.pinterestDetail.classList.remove('connected');
    elements.pinterestBtn.classList.remove('hidden');
    elements.pinterestBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.16 9.42 7.63 11.17-.1-.94-.2-2.4.04-3.44.22-.93 1.4-5.93 1.4-5.93s-.36-.72-.36-1.78c0-1.67.97-2.91 2.17-2.91 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-.99 4-.28 1.19.6 2.16 1.77 2.16 2.13 0 3.76-2.24 3.76-5.48 0-2.86-2.06-4.87-5-4.87-3.4 0-5.4 2.55-5.4 5.19 0 1.03.39 2.13.89 2.73.1.12.11.22.08.34-.09.37-.29 1.19-.33 1.35-.05.22-.18.26-.41.16-1.54-.72-2.5-2.96-2.5-4.77 0-3.88 2.82-7.44 8.14-7.44 4.27 0 7.6 3.05 7.6 7.12 0 4.25-2.68 7.67-6.4 7.67-1.25 0-2.43-.65-2.83-1.42l-.77 2.94c-.28 1.07-1.03 2.42-1.54 3.24 1.16.36 2.39.55 3.67.55 6.63 0 12-5.37 12-12S18.63 0 12 0z"/></svg>
      Connect Pinterest
    `;
    elements.disconnectBtn.classList.add('hidden');
  }
}

// ============================================================================
// FIGMA CONNECTION
// ============================================================================

/**
 * Connect to Figma room
 */
async function connectFigma() {
  const code = elements.codeInput.value.trim();
  
  if (code.length < 4) {
    showStatus('Invalid pairing code', false);
    return;
  }
  
  // Save pairing code
  await chrome.storage.local.set({ figmaRoomId: code });
  
  // Notify background script
  chrome.runtime.sendMessage({ action: 'updateConfig' });
  
  showStatus('Connected to Figma', true);
  
  // Close popup after short delay
  setTimeout(() => window.close(), 1000);
}

/**
 * Load saved Figma room
 */
async function loadFigmaConfig() {
  const { figmaRoomId } = await chrome.storage.local.get('figmaRoomId');
  
  if (figmaRoomId) {
    elements.codeInput.value = figmaRoomId;
    showStatus(`Room: ${figmaRoomId}`, true);
  }
}

// ============================================================================
// STATUS DISPLAY
// ============================================================================

/**
 * Show status message
 */
function showStatus(message, success) {
  elements.statusText.textContent = message;
  
  if (success) {
    elements.statusDot.classList.add('connected');
  } else {
    elements.statusDot.classList.remove('connected');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Check Pinterest auth status
  const pinterestConnected = await checkPinterestAuth();
  updatePinterestStatus(pinterestConnected);
  
  // Load Figma config
  await loadFigmaConfig();
  
  // Setup event listeners
  elements.connectBtn.addEventListener('click', connectFigma);
  
  elements.codeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      connectFigma();
    }
  });
});

// Make functions available globally for onclick handlers
window.connectPinterest = connectPinterest;
window.disconnectPinterest = disconnectPinterest;
