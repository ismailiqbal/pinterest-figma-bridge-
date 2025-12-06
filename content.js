/**
 * Figpins - Content Script
 * Injects "Send" buttons on Pinterest images
 * STRICT API MODE: Uses Pinterest API only
 */

console.log('[Figpins] Content script loaded (Strict API Mode)');

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
  
  return null;
}

// ============================================================================
// BUTTON INJECTION
// ============================================================================

function processImages() {
  const images = document.querySelectorAll('img');
  
  images.forEach(img => {
    try {
      if (img.dataset._figpinsBtn) return;
      if (img.clientWidth < 150 || img.clientHeight < 150) return;
      
      const container = img.closest('div') || img.parentElement;
      if (!container) return;
      
      img.dataset._figpinsBtn = 'true';
      
      const computed = getComputedStyle(container);
      if (computed.position === 'static') {
        container.style.position = 'relative';
      }
      
      const btn = createSendButton(img);
      
      container.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
      container.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });
      
      container.appendChild(btn);
      
    } catch (e) {
      // Ignore
    }
  });
}

function createSendButton(imgElement) {
  const btn = document.createElement('button');
  btn.innerHTML = BUTTON_HTML;
  Object.assign(btn.style, BUTTON_STYLES);
  
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    await handleSendClick(btn, imgElement);
  });
  
  return btn;
}

async function handleSendClick(btn, imgElement) {
  const originalContent = btn.innerHTML;
  btn.innerHTML = '...';
  
  try {
    // STRICT API MODE
    const pinId = extractPinId(imgElement);
    
    if (!pinId) {
      throw new Error('Could not find Pin ID. API requires a valid Pin ID.');
    }
    
    console.log('--------------------------------------------------');
    console.log('[Figpins] 🚀 INITIATING API REQUEST');
    console.log('[Figpins] 📌 Target Pin ID:', pinId);
    
    const response = await chrome.runtime.sendMessage({
      action: 'sendPinViaApi',
      pinId: pinId
    });
    
    if (response && response.success) {
      console.log('[Figpins] ✅ API SUCCESS: Pin sent successfully via Pinterest API');
      console.log('--------------------------------------------------');
      btn.innerHTML = '✓ API Sent!';
      btn.style.color = '#00C853';
    } else {
      console.error('[Figpins] ❌ API FAILURE:', response?.error);
      throw new Error(response?.error || 'API Request Failed');
    }
    
  } catch (err) {
    console.error('[Figpins] Error:', err);
    btn.innerHTML = 'Error';
    btn.style.color = '#E00';
    alert('Strict API Mode Error: ' + err.message);
  }
  
  setTimeout(() => {
    btn.innerHTML = originalContent;
    btn.style.color = '#333';
  }, 2000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function addButtons() {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => processImages(), { timeout: 1000 });
  } else {
    setTimeout(processImages, 50);
  }
}

function init() {
  console.log('[Figpins] Initializing...');
  addButtons();
  
  const observer = new MutationObserver((mutations) => {
    const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
    if (hasAddedNodes) addButtons();
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'complete') {
  setTimeout(init, 2000);
} else {
  window.addEventListener('load', () => {
    setTimeout(init, 2000);
  });
}
