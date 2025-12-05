document.addEventListener('DOMContentLoaded', () => {
  const codeInput = document.getElementById('code');
  const serverInput = document.getElementById('serverUrl');
  const connectBtn = document.getElementById('connectBtn');
  const statusDiv = document.getElementById('status');
  const serverSection = document.getElementById('serverSection');
  const toggleSettings = document.getElementById('toggleSettings');

  // Load saved config
  chrome.storage.local.get(['figmaRoomId', 'bridgeServerUrl'], (result) => {
    if (result.figmaRoomId) {
      codeInput.value = result.figmaRoomId;
      statusDiv.textContent = 'Saved Code: ' + result.figmaRoomId;
    }
    if (result.bridgeServerUrl) {
      serverInput.value = result.bridgeServerUrl;
    }
  });

  // Toggle Settings
  toggleSettings.addEventListener('click', () => {
    if (serverSection.style.display === 'block') {
      serverSection.style.display = 'none';
    } else {
      serverSection.style.display = 'block';
    }
  });

  connectBtn.addEventListener('click', () => {
    const code = codeInput.value.trim();
    let server = serverInput.value.trim();
    
    // Remove trailing slash
    server = server.replace(/\/$/, '');

    if (code.length < 4) {
      statusDiv.textContent = 'Invalid Code';
      return;
    }
    if (!server.startsWith('http')) {
      statusDiv.textContent = 'Invalid Server URL';
      return;
    }

    // Save config
    chrome.storage.local.set({ 
      figmaRoomId: code,
      bridgeServerUrl: server
    }, () => {
      statusDiv.textContent = 'Connected to Room ' + code;
      statusDiv.style.color = 'green';
      
      // Notify background script
      chrome.runtime.sendMessage({ action: 'updateConfig' });
      
      setTimeout(() => {
        window.close();
      }, 1000);
    });
  });
});
