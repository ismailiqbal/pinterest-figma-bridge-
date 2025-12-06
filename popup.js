/**
 * Figpins - Extension Popup
 * Handles Manual Token Entry and Figma pairing
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  // Pinterest Token
  tokenInputArea: document.getElementById('tokenInputArea'),
  tokenConnectedArea: document.getElementById('tokenConnectedArea'),
  accessTokenInput: document.getElementById('accessToken'),
  saveTokenBtn: document.getElementById('saveTokenBtn'),
  disconnectBtn: document.getElementById('disconnectBtn'),
  maskedToken: document.getElementById('maskedToken'),
  
  // Figma
  codeInput: document.getElementById('code'),
  connectBtn: document.getElementById('connectBtn'),
  
  // Status
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText')
};

// ============================================================================
// PINTEREST TOKEN MANAGEMENT
// ============================================================================

/**
 * Save manually entered token
 */
async function saveToken() {
  const token = elements.accessTokenInput.value.trim();
  
  if (!token) {
    showStatus('Please enter a token', false);
    return;
  }
  
  if (!token.startsWith('pina_')) {
    showStatus('Warning: Token usually starts with pina_', false);
    // We allow it anyway just in case format changes
  }
  
  // Save token directly
  const pinterestAuth = {
    access_token: token,
    // No refresh token for manual entry, user must re-enter if it expires
    expires_at: null 
  };
  
  await chrome.storage.local.set({ pinterestAuth });
  
  console.log('[Figpins Popup] Token saved successfully:', {
    length: token.length,
    prefix: token.substring(0, 20),
    suffix: '...' + token.substring(token.length - 10)
  });
  
  updateTokenUI(true, token);
  showStatus('Token saved!', true);
  elements.accessTokenInput.value = '';
}

/**
 * Clear saved token
 */
async function clearToken() {
  await chrome.storage.local.remove('pinterestAuth');
  updateTokenUI(false);
  showStatus('Token cleared', false);
}

/**
 * Check if we have a saved token
 */
async function checkTokenStatus() {
  const { pinterestAuth } = await chrome.storage.local.get('pinterestAuth');
  
  if (pinterestAuth && pinterestAuth.access_token) {
    updateTokenUI(true, pinterestAuth.access_token);
  } else {
    updateTokenUI(false);
  }
}

/**
 * Update UI based on token status
 */
function updateTokenUI(hasToken, tokenStr = '') {
  if (hasToken) {
    elements.tokenInputArea.classList.add('hidden');
    elements.tokenConnectedArea.classList.remove('hidden');
    
    // Show more of the token for verification (first 15 + last 10)
    const prefix = tokenStr.substring(0, 15);
    const suffix = tokenStr.substring(tokenStr.length - 10);
    elements.maskedToken.textContent = `${prefix}...${suffix}`;
    
    // Log for debugging
    console.log('[Figpins Popup] Token stored:', {
      fullLength: tokenStr.length,
      prefix: prefix,
      suffix: suffix
    });
  } else {
    elements.tokenInputArea.classList.remove('hidden');
    elements.tokenConnectedArea.classList.add('hidden');
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
  // Check status
  await checkTokenStatus();
  await loadFigmaConfig();
  
  // Listeners
  elements.saveTokenBtn.addEventListener('click', saveToken);
  elements.disconnectBtn.addEventListener('click', clearToken);
  elements.connectBtn.addEventListener('click', connectFigma);
  
  elements.codeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectFigma();
  });
  
  elements.accessTokenInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveToken();
  });
});
