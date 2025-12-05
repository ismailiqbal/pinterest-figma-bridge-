import { io } from "socket.io-client";

let socket = null;
let currentRoomId = null;
let currentServerUrl = 'http://localhost:3333';

// Initialize
function initSocket() {
  chrome.storage.local.get(['figmaRoomId', 'bridgeServerUrl'], (result) => {
    if (result.bridgeServerUrl) {
      currentServerUrl = result.bridgeServerUrl;
    }
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
  console.log('Extension configured:', { roomId, server: currentServerUrl });
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
  const { figmaRoomId, bridgeServerUrl } = await chrome.storage.local.get(['figmaRoomId', 'bridgeServerUrl']);
  
  if (!figmaRoomId) {
    throw new Error('Please click Extension Icon -> Connect');
  }

  const server = bridgeServerUrl || 'http://localhost:3333';

  // POST to server
  try {
    const response = await fetch(`${server}/send-image-http`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: figmaRoomId,
        url: data.url,
        width: data.width,
        height: data.height
      })
    });
    
    if (!response.ok) throw new Error('Bridge server error ' + response.status);
    
  } catch (err) {
    console.error('Bridge Error:', err);
    throw new Error('Check Server URL & Connection');
  }
}

// Start
initSocket();
