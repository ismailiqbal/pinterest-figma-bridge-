/**
 * Figpins - Content Script
 * Injects "Send" buttons on Pinterest images
 */

console.log('[Figpins] Content script loaded');

// ============================================================================
// CONFIGURATION
// ============================================================================

const BUTTON_HTML = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px; vertical-align: text-bottom;">
    <path d="M22 2L11 13"></path>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
  Send
`;

const BUTTON_STYLES = {
  position: 'absolute',
  top: '12px',
  left: '12px',
  zIndex: '2147483647',
  padding: '8px 12px',
  borderRadius: '20px',
  border: 'none',
  cursor: 'pointer',
  background: 'white',
  color: '#333',
  fontSize: '13px',
  fontWeight: '600',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  display: 'flex',
  alignItems: 'center',
  pointerEvents: 'auto',
  opacity: '0',
  transition: 'opacity 0.2s, transform 0.1s'
};

// ============================================================================
// PIN ID EXTRACTION
// ============================================================================

/**
 * Extract Pin ID from image element context
 * Tries multiple strategies to find the pin ID
 */
function extractPinId(imgElement) {
  // Strategy 1: From closest anchor with /pin/ URL
  const anchor = imgElement.closest('a[href*="/pin/"]');
  if (anchor) {
    const match = anchor.href.match(/\/pin\/(\d+)/);
    if (match) return match[1];
  }
  
  // Strategy 2: From data attributes (Pinterest internal)
  const pinCard = imgElement.closest('[data-test-pin-id]');
  if (pinCard && pinCard.dataset.testPinId) {
    return pinCard.dataset.testPinId;
  }
  
  // Strategy 3: From parent with data-pin-id
  const pinContainer = imgElement.closest('[data-pin-id]');
  if (pinContainer && pinContainer.dataset.pinId) {
    return pinContainer.dataset.pinId;
  }
  
  // Strategy 4: From current page URL (pin detail view)
  const pageMatch = window.location.pathname.match(/\/pin\/(\d+)/);
  if (pageMatch) {
    return pageMatch[1];
  }
  
  // Strategy 5: Parse from any nearby link
  const container = imgElement.closest('div');
  if (container) {
    const links = container.querySelectorAll('a[href*="/pin/"]');
    for (const link of links) {
      const match = link.href.match(/\/pin\/(\d+)/);
      if (match) return match[1];
    }
  }
  
  return null;
}

// ============================================================================
// IMAGE URL EXTRACTION (Fallback)
// ============================================================================

/**
 * Get highest resolution image URL from srcset or src
 */
function getHighestResImage(imgElement) {
  try {
    // Try srcset first
    if (imgElement.srcset) {
      const sources = imgElement.srcset.split(',').map(s => {
        const parts = s.trim().split(' ');
        return {
          url: parts[0],
          width: parseInt(parts[1]) || 0
        };
      });
      
      sources.sort((a, b) => b.width - a.width);
      
      if (sources.length > 0 && sources[0].url) {
        return sources[0].url;
      }
    }
    
    // Try to upgrade URL resolution
    const currentSrc = imgElement.src;
    if (currentSrc.includes('pinimg.com')) {
      // Already high-res
      if (currentSrc.includes('/1200x/') || 
          currentSrc.includes('/originals/') || 
          currentSrc.includes('/736x/')) {
        return currentSrc;
      }
      
      // Upgrade to 1200x
      if (currentSrc.match(/\/\d+x\//)) {
        return currentSrc.replace(/\/\d+x\//, '/1200x/');
      }
    }
    
    return imgElement.src;
  } catch (e) {
    return imgElement.src;
  }
}

// ============================================================================
// BUTTON INJECTION
// ============================================================================

/**
 * Process images and add send buttons
 */
function processImages() {
  const images = document.querySelectorAll('img');
  
  images.forEach(img => {
    try {
      // Skip if already processed
      if (img.dataset._figpinsBtn) return;
      
      // Skip small images
      if (img.clientWidth < 150 || img.clientHeight < 150) return;
      
      // Find container
      const container = img.closest('div') || img.parentElement;
      if (!container) return;
      
      // Mark as processed
      img.dataset._figpinsBtn = 'true';
      
      // Ensure container is positioned
      const computed = getComputedStyle(container);
      if (computed.position === 'static') {
        container.style.position = 'relative';
      }
      
      // Create button
      const btn = createSendButton(img);
      
      // Show/hide on hover
      container.addEventListener('mouseenter', () => {
        btn.style.opacity = '1';
      });
      
      container.addEventListener('mouseleave', () => {
        btn.style.opacity = '0';
      });
      
      container.appendChild(btn);
      
    } catch (e) {
      // Silently skip problematic images
    }
  });
}

/**
 * Create the send button element
 */
function createSendButton(imgElement) {
  const btn = document.createElement('button');
  btn.innerHTML = BUTTON_HTML;
  
  // Apply styles
  Object.assign(btn.style, BUTTON_STYLES);
  
  // Click handler
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    await handleSendClick(btn, imgElement);
  });
  
  return btn;
}

/**
 * Handle send button click
 */
async function handleSendClick(btn, imgElement) {
  const originalContent = btn.innerHTML;
  const originalColor = btn.style.color;
  
  // Show loading state
  btn.innerHTML = '...';
  btn.style.transform = 'scale(0.95)';
  
  try {
    // Try to extract Pin ID for API method
    const pinId = extractPinId(imgElement);
    
    let response;
    
    if (pinId) {
      // Use Pinterest API method
      console.log('[Figpins] Using API method for pin:', pinId);
      response = await chrome.runtime.sendMessage({
        action: 'sendPinViaApi',
        pinId: pinId
      });
    } else {
      // Fallback to scraping method
      console.log('[Figpins] Using scraping fallback');
      const src = getHighestResImage(imgElement);
      response = await chrome.runtime.sendMessage({
        action: 'sendToBridge',
        url: src,
        width: imgElement.naturalWidth,
        height: imgElement.naturalHeight
      });
    }
    
    if (response && response.success) {
      // Success
      btn.innerHTML = '✓ Sent!';
      btn.style.color = '#00C853';
    } else {
      throw new Error(response?.error || 'Failed to send');
    }
    
  } catch (err) {
    console.error('[Figpins] Send error:', err);
    
    btn.innerHTML = 'Error';
    btn.style.color = '#E00';
    
    // Show helpful error message
    showErrorAlert(err.message);
  }
  
  // Reset button after delay
  setTimeout(() => {
    btn.innerHTML = originalContent;
    btn.style.color = originalColor;
    btn.style.transform = 'scale(1)';
  }, 2000);
}

/**
 * Show error alert with helpful message
 */
function showErrorAlert(errorMessage) {
  if (errorMessage.includes('pairing code') || errorMessage.includes('Figma')) {
    alert('Please connect to Figma first!\n\n1. Click the Figpins extension icon\n2. Enter the pairing code from the Figma plugin');
  } else if (errorMessage.includes('Pinterest') || errorMessage.includes('Connect')) {
    alert('Please connect your Pinterest account!\n\n1. Click the Figpins extension icon\n2. Click "Connect Pinterest"');
  } else if (errorMessage.includes('blocked') || errorMessage.includes('fetch')) {
    alert('Could not fetch this image.\nTry a different image or check your connection.');
  } else {
    alert('Error: ' + errorMessage);
  }
}

// ============================================================================
// BUTTON INJECTION SCHEDULER
// ============================================================================

/**
 * Schedule button injection using idle callback
 */
function addButtons() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => processImages(), { timeout: 1000 });
  } else {
    setTimeout(processImages, 50);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  console.log('[Figpins] Initializing...');
  
  // Initial scan
  addButtons();
  
  // Watch for new images (infinite scroll)
  const observer = new MutationObserver((mutations) => {
    const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
    if (hasAddedNodes) {
      addButtons();
    }
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });
  
  console.log('[Figpins] Ready');
}

// Wait for page to be ready (avoid React hydration conflicts)
if (document.readyState === 'complete') {
  setTimeout(init, 2000);
} else {
  window.addEventListener('load', () => {
    setTimeout(init, 2000);
  });
}
