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
           await chrome.runtime.sendMessage({
             action: "sendToBridge",
             url: src,
             width: img.naturalWidth,
             height: img.naturalHeight
           });
           
           btn.innerHTML = `Sent!`;
           btn.style.color = '#00C853';
        } catch (err) {
           console.error('Send failed', err);
           btn.innerHTML = 'Error';
           alert("Connect Extension to Figma first!");
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
      // Return the highest resolution image
      if (sources.length > 0 && sources[0].url) {
        return sources[0].url;
      }
    }
    
    // Fallback: Try to get original/high-res version from current src
    // Pinterest URLs often have size in path like /236x/ or /736x/ - try to get original
    const currentSrc = imgElement.src;
    if (currentSrc.includes('pinimg.com')) {
      // Try to get original by removing size constraints
      // Original format: https://i.pinimg.com/originals/...
      // Or try: https://i.pinimg.com/564x/... (larger) or remove size entirely
      const originalUrl = currentSrc.replace(/\/\d+x\/\d+\//, '/originals/')
                                    .replace(/\/\d+x\//, '/originals/');
      // If that doesn't work, try the largest common size (1200x or 564x)
      if (!originalUrl.includes('originals')) {
        // Try 1200x which is often the largest available
        const largeUrl = currentSrc.replace(/\/\d+x\//, '/1200x/');
        return largeUrl;
      }
      return originalUrl;
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
