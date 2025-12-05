document.addEventListener('DOMContentLoaded', () => {
  const codeInput = document.getElementById('code');
  const connectBtn = document.getElementById('connectBtn');
  const statusDiv = document.getElementById('status');

  // Load saved config
  chrome.storage.local.get(['figmaRoomId'], (result) => {
    if (result.figmaRoomId) {
      codeInput.value = result.figmaRoomId;
      statusDiv.textContent = 'Active Room: ' + result.figmaRoomId;
      statusDiv.classList.add('connected');
    }
  });

  connectBtn.addEventListener('click', () => {
    const code = codeInput.value.trim();

    if (code.length < 4) {
      statusDiv.textContent = 'Invalid Code';
      statusDiv.classList.remove('connected');
      return;
    }

    // Save config
    chrome.storage.local.set({ 
      figmaRoomId: code
    }, () => {
      statusDiv.textContent = 'Connected';
      statusDiv.classList.add('connected');
      
      // Notify background script
      chrome.runtime.sendMessage({ action: 'updateConfig' });
      
      setTimeout(() => {
        window.close();
      }, 1000);
    });
  });
});
