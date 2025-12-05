// Note: We use HTTP POST, not Socket.io client in background script
let currentRoomId = null;
const BRIDGE_SERVER_URL = 'https://pinterest-figma-bridge.onrender.com';

// Initialize
function initSocket() {
  chrome.storage.local.get(['figmaRoomId'], (result) => {
    if (result.figmaRoomId) {
      connectSocket(result.figmaRoomId);
    }
  });
}

function connectSocket(roomId) {
  // We don't actually maintain a socket connection in the background script for SENDING.
  // We use HTTP POST to the server, which is stateless and reliable.
  // The 'initSocket' here is mainly to load the config into memory.
  currentRoomId = roomId;
  console.log('Extension configured:', { roomId, server: BRIDGE_SERVER_URL });
}

// Listen for config updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateConfig') {
    initSocket();
  }
  
  if (request.action === "sendToBridge") {
    handleSendToBridge(request)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; 
  }
});

async function handleSendToBridge(data) {
  // Ensure we have latest config
  const { figmaRoomId } = await chrome.storage.local.get(['figmaRoomId']);
  
  console.log('Extension: Sending to bridge', { figmaRoomId, url: data.url?.substring(0, 30) });
  
  if (!figmaRoomId) {
    throw new Error('Please click Extension Icon -> Connect');
  }

  // POST to server
  try {
    const payload = {
      roomId: figmaRoomId,
      url: data.url,
      width: data.width,
      height: data.height
    };
    
    console.log('Extension: POSTing to', `${BRIDGE_SERVER_URL}/send-image-http`, payload);
    
    const response = await fetch(`${BRIDGE_SERVER_URL}/send-image-http`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log('Extension: Server response', result);
    
    if (!response.ok) {
      const errorMsg = result.error || `Bridge server error ${response.status}`;
      throw new Error(errorMsg);
    }
    
    if (!result.success) {
      throw new Error(result.error || 'Server returned failure');
    }
    
  } catch (err) {
    console.error('Bridge Error:', err);
    throw new Error('Check Server URL & Connection: ' + err.message);
  }
}

// Start
initSocket();
