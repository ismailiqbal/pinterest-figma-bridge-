document.addEventListener('DOMContentLoaded', () => {
  const codeInput = document.getElementById('code');
  const connectBtn = document.getElementById('connectBtn');
  const statusDiv = document.getElementById('status');

  // Load saved config
  chrome.storage.local.get(['figmaRoomId'], (result) => {
    if (result.figmaRoomId) {
      codeInput.value = result.figmaRoomId;
      statusDiv.textContent = 'Saved Code: ' + result.figmaRoomId;
    }
  });

  connectBtn.addEventListener('click', () => {
    const code = codeInput.value.trim();

    if (code.length < 4) {
      statusDiv.textContent = 'Invalid Code';
      return;
    }

    // Save config
    chrome.storage.local.set({ 
      figmaRoomId: code
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
