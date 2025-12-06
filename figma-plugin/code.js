/**
 * Figpins - Figma Plugin
 * Receives images from Chrome Extension via WebSocket bridge
 * Creates masonry grid with optional pin metadata cards
 */

figma.showUI(__html__, { width: 320, height: 480 });

// ============================================================================
// CONFIGURATION
// ============================================================================

var columns = 3;
var gap = 20;
var columnWidth = 300;
var showBorder = false;
var borderWidth = 2;
var borderColor = '#000000';

// Current grid frame ID
var gridId = null;

// Font loading status
var fontLoaded = false;

// ============================================================================
// FONT LOADING
// ============================================================================

/**
 * Load required fonts for text nodes
 */
function loadFonts() {
  Promise.all([
    figma.loadFontAsync({ family: 'Inter', style: 'Medium' }),
    figma.loadFontAsync({ family: 'Inter', style: 'Regular' })
  ]).then(function() {
    fontLoaded = true;
    console.log('[Figpins] Fonts loaded');
  }).catch(function(err) {
    console.log('[Figpins] Font loading failed:', err);
    fontLoaded = false;
  });
}

// Load fonts on startup
loadFonts();

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

figma.ui.onmessage = function(msg) {
  
  if (msg.type === 'create-image') {
    createImage(msg.bytes, msg.width, msg.height, msg.title, msg.sourceUrl);
  }
  
  if (msg.type === 'get-config') {
    figma.ui.postMessage({
      type: 'config-loaded',
      columns: columns,
      gap: gap,
      showBorder: showBorder,
      borderWidth: borderWidth,
      borderColor: borderColor
    });
    figma.ui.postMessage({
      type: 'session-status',
      status: gridId ? 'Active' : 'None'
    });
  }
  
  if (msg.type === 'update-config') {
    columns = msg.columns || 3;
    gap = msg.gap || 20;
    showBorder = msg.showBorder || false;
    borderWidth = msg.borderWidth || 2;
    borderColor = msg.borderColor || '#000000';
    figma.notify('Settings updated');
  }
  
  if (msg.type === 'reset-session') {
    gridId = null;
    figma.ui.postMessage({ type: 'session-status', status: 'None' });
    figma.notify('Ready for new moodboard');
  }
};

// ============================================================================
// SELECTION HANDLER
// ============================================================================

figma.on('selectionchange', function() {
  var sel = figma.currentPage.selection;
  if (sel.length === 1 && sel[0].type === 'FRAME') {
    var data = sel[0].getPluginData('figpins');
    if (data === 'grid') {
      gridId = sel[0].id;
      figma.ui.postMessage({ type: 'session-status', status: 'Resumed' });
      figma.notify('Grid session resumed');
    }
  }
});

// ============================================================================
// IMAGE CREATION
// ============================================================================

/**
 * Create image (or card with metadata) in the grid
 */
function createImage(bytes, w, h, title, sourceUrl) {
  if (!bytes || !bytes.length) {
    figma.notify('No image data');
    return;
  }
  
  try {
    // Get or create grid
    var grid = getGrid();
    
    // Create image from bytes
    var uint8 = new Uint8Array(bytes);
    var img = figma.createImage(uint8);
    
    // Calculate dimensions
    var ratio = (h && w) ? (h / w) : 1;
    var rectW = columnWidth;
    var rectH = Math.round(rectW * ratio);
    if (rectH < 10) rectH = 10;
    
    // Create rectangle with image fill
    var rect = figma.createRectangle();
    rect.name = 'Image';
    rect.resize(rectW, rectH);
    rect.fills = [{
      type: 'IMAGE',
      scaleMode: 'FIT',
      imageHash: img.hash
    }];
    
    // Find shortest column
    var col = getShortestColumn(grid);
    
    // Check if we should create a card (has metadata)
    var hasMetadata = (title && title.length > 0) || (sourceUrl && sourceUrl.length > 0);
    
    if (hasMetadata && fontLoaded) {
      // Create card frame with metadata
      var card = createPinCard(rect, rectW, rectH, title, sourceUrl);
      
      if (col) {
        col.appendChild(card);
      } else {
        grid.appendChild(card);
      }
    } else {
      // Just add the image
      if (col) {
        col.appendChild(rect);
        rect.layoutAlign = 'STRETCH';
      } else {
        grid.appendChild(rect);
      }
    }
    
    // Select and zoom to new content
    var nodeToSelect = hasMetadata && fontLoaded ? figma.getNodeById(rect.parent.id) : rect;
    figma.currentPage.selection = [nodeToSelect];
    figma.viewport.scrollAndZoomIntoView([nodeToSelect]);
    
    figma.notify(hasMetadata ? 'Pin card added' : 'Image added');
    
  } catch (err) {
    console.log('[Figpins] Error creating image:', err);
    figma.notify('Error: ' + err.message);
  }
}

/**
 * Create a pin card with image, title, and source URL
 */
function createPinCard(imageRect, imgWidth, imgHeight, title, sourceUrl) {
  // Create card container
  var card = figma.createFrame();
  card.name = title || 'Pin';
  card.layoutMode = 'VERTICAL';
  card.primaryAxisSizingMode = 'AUTO';
  card.counterAxisSizingMode = 'FIXED';
  card.resize(imgWidth, 100);
  card.itemSpacing = 0;
  card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  card.cornerRadius = 12;
  card.clipsContent = true;
  
  // Add image (with rounded top corners)
  imageRect.cornerRadius = 0;
  card.appendChild(imageRect);
  imageRect.layoutAlign = 'STRETCH';
  
  // Create text container
  var textContainer = figma.createFrame();
  textContainer.name = 'Info';
  textContainer.layoutMode = 'VERTICAL';
  textContainer.primaryAxisSizingMode = 'AUTO';
  textContainer.counterAxisSizingMode = 'STRETCH';
  textContainer.itemSpacing = 4;
  textContainer.paddingTop = 12;
  textContainer.paddingBottom = 12;
  textContainer.paddingLeft = 12;
  textContainer.paddingRight = 12;
  textContainer.fills = [];
  
  // Add title if present
  if (title && title.length > 0) {
    var titleText = figma.createText();
    titleText.name = 'Title';
    titleText.fontName = { family: 'Inter', style: 'Medium' };
    titleText.characters = truncateText(title, 60);
    titleText.fontSize = 14;
    titleText.lineHeight = { value: 20, unit: 'PIXELS' };
    titleText.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1 } }];
    titleText.textAutoResize = 'HEIGHT';
    textContainer.appendChild(titleText);
    titleText.layoutAlign = 'STRETCH';
  }
  
  // Add source URL if present
  if (sourceUrl && sourceUrl.length > 0) {
    var urlText = figma.createText();
    urlText.name = 'Source';
    urlText.fontName = { family: 'Inter', style: 'Regular' };
    urlText.characters = formatUrl(sourceUrl);
    urlText.fontSize = 11;
    urlText.lineHeight = { value: 16, unit: 'PIXELS' };
    urlText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }];
    urlText.textAutoResize = 'HEIGHT';
    urlText.hyperlink = { type: 'URL', value: sourceUrl };
    textContainer.appendChild(urlText);
    urlText.layoutAlign = 'STRETCH';
  }
  
  card.appendChild(textContainer);
  
  return card;
}

/**
 * Truncate text to max length
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format URL for display (show domain only)
 */
function formatUrl(url) {
  try {
    var parsed = new URL(url);
    return parsed.hostname.replace('www.', '');
  } catch (e) {
    return url.substring(0, 30);
  }
}

// ============================================================================
// GRID MANAGEMENT
// ============================================================================

/**
 * Get existing grid or create new one
 */
function getGrid() {
  // Try existing grid
  if (gridId) {
    var node = figma.getNodeById(gridId);
    if (node && node.type === 'FRAME') {
      return node;
    }
  }
  
  // Create new grid
  var frame = figma.createFrame();
  frame.name = 'Figpins Grid';
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = gap;
  frame.paddingTop = 20;
  frame.paddingBottom = 20;
  frame.paddingLeft = 20;
  frame.paddingRight = 20;
  frame.fills = [];
  frame.setPluginData('figpins', 'grid');
  
  // Border
  if (showBorder) {
    var rgb = hexToRgb(borderColor);
    frame.strokes = [{ type: 'SOLID', color: rgb }];
    frame.strokeWeight = borderWidth;
  }
  
  // Create columns
  for (var i = 0; i < columns; i++) {
    var col = figma.createFrame();
    col.name = 'Col ' + (i + 1);
    col.layoutMode = 'VERTICAL';
    col.primaryAxisSizingMode = 'AUTO';
    col.counterAxisSizingMode = 'FIXED';
    col.itemSpacing = gap;
    col.fills = [];
    col.resize(columnWidth, 100);
    frame.appendChild(col);
  }
  
  // Position below existing content
  var y = 0;
  var children = figma.currentPage.children;
  for (var j = 0; j < children.length; j++) {
    var c = children[j];
    if (c.y !== undefined && c.height !== undefined) {
      var bottom = c.y + c.height;
      if (bottom > y) y = bottom;
    }
  }
  frame.x = 100;
  frame.y = y + 100;
  
  figma.currentPage.appendChild(frame);
  gridId = frame.id;
  
  figma.ui.postMessage({ type: 'session-status', status: 'Active' });
  
  return frame;
}

/**
 * Find the shortest column in the grid
 */
function getShortestColumn(grid) {
  var shortest = null;
  var minH = 999999;
  
  for (var i = 0; i < grid.children.length; i++) {
    var child = grid.children[i];
    if (child.type === 'FRAME' && child.height < minH) {
      minH = child.height;
      shortest = child;
    }
  }
  
  return shortest;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex) {
  var r = parseInt(hex.slice(1, 3), 16) / 255;
  var g = parseInt(hex.slice(3, 5), 16) / 255;
  var b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r: r, g: g, b: b };
}

// ============================================================================
// STARTUP
// ============================================================================

console.log('[Figpins] Plugin ready');
