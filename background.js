/**
 * Figpins - Background Service Worker
 * Handles communication between content script and bridge server
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  bridgeServer: 'https://pinterest-figma-bridge.onrender.com'
};

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Figpins] Message received:', request.action);
  
  switch (request.action) {
    case 'updateConfig':
      // Config updated, nothing else needed
      sendResponse({ success: true });
      break;
      
    case 'sendPinViaApi':
      // New: Send pin using Pinterest API
      handleSendPinViaApi(request.pinId)
        .then((result) => sendResponse({ success: true, data: result }))
        .catch(err => sendResponse({ success: false, error: err.message, debug: err.debug }));
      return true; // Keep channel open for async response
      
    case 'sendToBridge':
      // Legacy: Send image via URL scraping
      handleSendToBridge(request)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// ============================================================================
// API METHOD (Pinterest API)
// ============================================================================

/**
 * Send pin to Figma via Pinterest API
 */
async function handleSendPinViaApi(pinId) {
  // Get stored credentials
  const { figmaRoomId, pinterestAuth } = await chrome.storage.local.get([
    'figmaRoomId',
    'pinterestAuth'
  ]);
  
  // Validation
  if (!figmaRoomId) {
    throw new Error('Open extension popup and enter Figma pairing code');
  }
  
  if (!pinterestAuth || !pinterestAuth.access_token) {
    throw new Error('Connect your Pinterest account first');
  }
  
  // Check token expiration and refresh if needed
  const accessToken = await getValidAccessToken(pinterestAuth);
  
  // Log token info for debugging
  console.log('[Figpins] Token Info:', {
    tokenLength: accessToken.length,
    tokenPrefix: accessToken.substring(0, 15) + '...',
    tokenSuffix: '...' + accessToken.substring(accessToken.length - 10),
    storedTokenPrefix: pinterestAuth.access_token.substring(0, 15) + '...'
  });
  
  console.log('[Figpins] Sending pin via API:', { pinId, roomId: figmaRoomId });
  
  // Send to bridge server
  const response = await fetch(`${CONFIG.bridgeServer}/api/send-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: figmaRoomId,
      pinId: pinId,
      accessToken: accessToken
    })
  });
  
  const result = await response.json();
  
  console.log('[Figpins] Server Response:', result);

  if (!response.ok || !result.success) {
    // Create error with debug info
    const error = new Error(result.error || `Server error: ${response.status}`);
    error.debug = result; // Attach full result for debugging
    throw error;
  }
  
  console.log('[Figpins] Pin sent successfully');
  return result;
}

/**
 * Get valid access token, refreshing if expired
 */
async function getValidAccessToken(pinterestAuth) {
  // Check if token is expired (with 5 min buffer)
  // Note: Manual tokens (pina_...) have no expires_at, so they never expire here
  const isExpired = pinterestAuth.expires_at && 
                    Date.now() > (pinterestAuth.expires_at - 300000);
  
  if (!isExpired) {
    return pinterestAuth.access_token;
  }
  
  // Token expired, try to refresh
  if (!pinterestAuth.refresh_token) {
    // If it's a manual token that somehow expired (revoked), we can't refresh
    throw new Error('Pinterest session expired. Please update your token in the extension.');
  }
  
  console.log('[Figpins] Refreshing expired token...');
  
  const response = await fetch(`${CONFIG.bridgeServer}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: pinterestAuth.refresh_token })
  });
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error('Session expired. Please reconnect Pinterest.');
  }
  
  // Save new token
  const newAuth = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_at: Date.now() + (data.expires_in * 1000)
  };
  
  await chrome.storage.local.set({ pinterestAuth: newAuth });
  
  console.log('[Figpins] Token refreshed successfully');
  return newAuth.access_token;
}

// ============================================================================
// SCRAPING METHOD (Fallback)
// ============================================================================

/**
 * Send image to Figma via URL scraping (fallback method)
 */
async function handleSendToBridge(data) {
  const { figmaRoomId } = await chrome.storage.local.get('figmaRoomId');
  
  if (!figmaRoomId) {
    throw new Error('Open extension popup and enter Figma pairing code');
  }
  
  console.log('[Figpins] Sending image via scraping:', { 
    roomId: figmaRoomId, 
    url: data.url?.substring(0, 50) 
  });
  
  const response = await fetch(`${CONFIG.bridgeServer}/send-image-http`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: figmaRoomId,
      url: data.url,
      width: data.width,
      height: data.height
    })
  });
  
  const result = await response.json();
  
  if (!response.ok || !result.success) {
    throw new Error(result.error || `Server error: ${response.status}`);
  }
  
  console.log('[Figpins] Image sent successfully');
}

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('[Figpins] Background service worker initialized');
