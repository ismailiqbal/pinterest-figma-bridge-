// Pinterest to Figma Copier - Content Script

console.log('Pinterest Figma Copier: Script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "copyImage") {
    // Legacy
  }
});

const BUTTON_LABEL = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; vertical-align: text-bottom;">
    <path d="M22 2L11 13"></path>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
  Send
`;

function addButtons() {
  // We use requestIdleCallback to avoid freezing the UI during heavy React updates
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => processImages());
  } else {
    setTimeout(() => processImages(), 50);
  }
}

function processImages() {
  const images = document.querySelectorAll('img');
  
  images.forEach(img => {
    try {
      if (img.dataset._pinterestFigmaBtn) return;
      if (img.clientWidth < 150 || img.clientHeight < 150) return;

      const container = img.closest('div') || img.parentElement;
      if (!container) return;

      img.dataset._pinterestFigmaBtn = 'true';

      const computed = getComputedStyle(container);
      if (computed.position === 'static') {
        container.style.position = 'relative';
      }

      const btn = document.createElement('button');
      btn.innerHTML = BUTTON_LABEL; 

      // Styles
      btn.style.position = 'absolute';
      btn.style.top = '12px';
      btn.style.left = '12px'; 
      btn.style.zIndex = '2147483647';
      btn.style.padding = '8px 12px';
      btn.style.borderRadius = '20px';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.style.background = 'white'; 
      btn.style.color = '#333';
      btn.style.fontSize = '13px';
      btn.style.fontWeight = '600';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      btn.style.display = 'flex';
      btn.style.alignItems = 'center';
      btn.style.pointerEvents = 'auto';

      btn.style.opacity = '0';
      btn.style.transition = 'opacity 0.2s';

      container.addEventListener('mouseenter', () => {
        btn.style.opacity = '1';
      });
      container.addEventListener('mouseleave', () => {
        btn.style.opacity = '0';
      });

      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const originalContent = btn.innerHTML;
        btn.innerHTML = '...';

        try {
           const src = getHighestResImage(img);
           const response = await chrome.runtime.sendMessage({
             action: "sendToBridge",
             url: src,
             width: img.naturalWidth,
             height: img.naturalHeight
           });
           
           if (response && response.success) {
             btn.innerHTML = `Sent!`;
             btn.style.color = '#00C853';
           } else {
             throw new Error(response?.error || 'Failed to send image');
           }
        } catch (err) {
           console.error('Send failed', err);
           btn.innerHTML = 'Error';
           btn.style.color = '#E00';
           const errorMsg = err.message || 'Unknown error';
           if (errorMsg.includes('Connect') || errorMsg.includes('roomId')) {
             alert("Connect Extension to Figma first! Click the extension icon and enter the pairing code.");
           } else if (errorMsg.includes('blocked') || errorMsg.includes('fetch')) {
             alert("Image blocked by Pinterest. Try a different image or check your connection.");
           } else {
             alert("Error: " + errorMsg);
           }
        }

        setTimeout(() => {
          btn.innerHTML = originalContent;
          btn.style.color = '#333';
        }, 2000);
      });

      container.appendChild(btn);
      
    } catch (e) {
      // Ignore
    }
  });
}

function getHighestResImage(imgElement) {
  try {
    if (imgElement.srcset) {
      const sources = imgElement.srcset.split(',').map(s => {
        const parts = s.trim().split(' ');
        if (parts.length >= 2) {
           return { url: parts[0], width: parseInt(parts[1]) || 0 };
        }
        return { url: parts[0], width: 0 };
      });
      sources.sort((a, b) => b.width - a.width);
      // Return the highest resolution image from srcset
      if (sources.length > 0 && sources[0].url) {
        return sources[0].url;
      }
    }
    
    // Fallback: Try to upgrade to higher resolution version from current src
    // Prefer /1200x/ or /736x/ over /originals/ as they're more reliably accessible
    const currentSrc = imgElement.src;
    if (currentSrc.includes('pinimg.com')) {
      // If it's already a high-res URL, use it
      if (currentSrc.includes('/1200x/') || currentSrc.includes('/originals/') || currentSrc.includes('/736x/')) {
        return currentSrc;
      }
      
      // Try to upgrade to 1200x first (most reliable high-res format)
      if (currentSrc.match(/\/\d+x\//)) {
        const largeUrl = currentSrc.replace(/\/\d+x\//, '/1200x/');
        return largeUrl;
      }
    }
    
    return imgElement.src;
  } catch (e) {
    return imgElement.src;
  }
}

// STARTUP LOGIC: Wait for Hydration
function init() {
  console.log('Pinterest Figma Copier: Initializing...');
  addButtons();
  
  const observer = new MutationObserver((mutations) => {
    // Only run if nodes were added
    const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
    if (hasAddedNodes) {
      addButtons();
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

// Wait for window load + safe delay
if (document.readyState === 'complete') {
  setTimeout(init, 2000);
} else {
  window.addEventListener('load', () => {
    setTimeout(init, 2000); // 2 second buffer for React hydration
  });
}
