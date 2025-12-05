// Pinterest to Figma - Plugin Code
// Simple, flat architecture following Figma official docs

// ============================================
// CONFIGURATION
// ============================================

var PLUGIN_DATA_KEY = 'isPinterestGrid';
var STORAGE_CONFIG_KEY = 'pinterestConfig';
var STORAGE_SESSION_KEY = 'pinterestSession';

var DEFAULT_CONFIG = {
  columns: 3,
  gap: 20,
  columnWidth: 300,
  showBorder: false,
  borderWidth: 2,
  borderColor: '#000000'
};

// Runtime state (not persisted)
var config = null;
var activeFrameId = null;

// ============================================
// INITIALIZATION
// ============================================

// Show UI immediately
figma.showUI(__html__, { width: 320, height: 480 });

// Set up message handler immediately (before any async operations)
figma.ui.onmessage = handleMessage;

// Set up selection handler
figma.on('selectionchange', handleSelectionChange);

// Load saved state
loadState();

// ============================================
// MESSAGE HANDLING
// ============================================

function handleMessage(msg) {
  console.log('Plugin received:', msg.type);
  
  if (msg.type === 'create-image') {
    createImage(msg.bytes, msg.width, msg.height);
  }
  else if (msg.type === 'get-config') {
    sendConfigToUI();
  }
  else if (msg.type === 'update-config') {
    updateConfig(msg);
  }
  else if (msg.type === 'reset-session') {
    resetSession();
  }
}

// ============================================
// STATE MANAGEMENT
// ============================================

function loadState() {
  // Load config
  figma.clientStorage.getAsync(STORAGE_CONFIG_KEY).then(function(saved) {
    if (saved) {
      config = {};
      for (var key in DEFAULT_CONFIG) {
        config[key] = saved[key] !== undefined ? saved[key] : DEFAULT_CONFIG[key];
      }
    } else {
      config = {};
      for (var key in DEFAULT_CONFIG) {
        config[key] = DEFAULT_CONFIG[key];
      }
    }
    sendConfigToUI();
  }).catch(function(err) {
    console.log('Error loading config:', err);
    config = {};
    for (var key in DEFAULT_CONFIG) {
      config[key] = DEFAULT_CONFIG[key];
    }
    sendConfigToUI();
  });
  
  // Load session
  figma.clientStorage.getAsync(STORAGE_SESSION_KEY).then(function(saved) {
    if (saved && saved.activeFrameId) {
      // Verify the frame still exists
      var node = figma.getNodeById(saved.activeFrameId);
      if (node && node.type === 'FRAME' && !node.removed) {
        var pluginData = node.getPluginData(PLUGIN_DATA_KEY);
        if (pluginData === 'true') {
          activeFrameId = saved.activeFrameId;
          sendSessionStatus('Active');
        }
      }
    }
  }).catch(function(err) {
    console.log('Error loading session:', err);
  });
  
  console.log('Pinterest Bridge: Initialized');
}

function saveConfig() {
  figma.clientStorage.setAsync(STORAGE_CONFIG_KEY, config).catch(function(err) {
    console.log('Error saving config:', err);
  });
}

function saveSession() {
  var data = { activeFrameId: activeFrameId };
  figma.clientStorage.setAsync(STORAGE_SESSION_KEY, data).catch(function(err) {
    console.log('Error saving session:', err);
  });
}

function sendConfigToUI() {
  if (!config) return;
  figma.ui.postMessage({
    type: 'config-loaded',
    columns: config.columns,
    gap: config.gap,
    columnWidth: config.columnWidth,
    showBorder: config.showBorder,
    borderWidth: config.borderWidth,
    borderColor: config.borderColor
  });
}

function sendSessionStatus(status) {
  figma.ui.postMessage({
    type: 'session-status',
    status: status
  });
}

// ============================================
// CONFIG UPDATES
// ============================================

function updateConfig(msg) {
  config.columns = msg.columns || 3;
  config.gap = msg.gap || 20;
  config.showBorder = msg.showBorder || false;
  config.borderWidth = msg.borderWidth || 2;
  config.borderColor = msg.borderColor || '#000000';
  
  saveConfig();
  
  // Update active frame if exists
  if (activeFrameId) {
    var frame = figma.getNodeById(activeFrameId);
    if (frame && frame.type === 'FRAME' && !frame.removed) {
      frame.itemSpacing = config.gap;
      updateFrameBorder(frame);
      
      // Update column gaps
      for (var i = 0; i < frame.children.length; i++) {
        var child = frame.children[i];
        if (child.type === 'FRAME') {
          child.itemSpacing = config.gap;
        }
      }
    }
  }
  
  figma.notify('Settings saved');
}

function resetSession() {
  activeFrameId = null;
  saveSession();
  sendSessionStatus('None');
  figma.notify('Ready for new grid');
}

// ============================================
// SELECTION HANDLING
// ============================================

function handleSelectionChange() {
  var selection = figma.currentPage.selection;
  
  if (selection.length === 1) {
    var node = selection[0];
    if (node.type === 'FRAME' && !node.removed) {
      var pluginData = node.getPluginData(PLUGIN_DATA_KEY);
      if (pluginData === 'true') {
        // User selected a Pinterest Grid - resume it
        activeFrameId = node.id;
        saveSession();
        sendSessionStatus('Resumed');
        return;
      }
    }
  }
  
  // Check if current session is still valid
  if (activeFrameId) {
    var frame = figma.getNodeById(activeFrameId);
    if (frame && !frame.removed) {
      sendSessionStatus('Active');
    } else {
      activeFrameId = null;
      sendSessionStatus('None');
    }
  } else {
    sendSessionStatus('None');
  }
}

// ============================================
// IMAGE CREATION
// ============================================

function createImage(bytes, width, height) {
  if (!bytes || bytes.length === 0) {
    figma.notify('Error: No image data');
    return;
  }
  
  // Ensure config is loaded
  if (!config) {
    config = {};
    for (var key in DEFAULT_CONFIG) {
      config[key] = DEFAULT_CONFIG[key];
    }
  }
  
  // Get or create grid frame
  var gridFrame = getOrCreateGridFrame();
  if (!gridFrame) {
    figma.notify('Error: Could not create grid');
    return;
  }
  
  // Create image
  var imageData;
  try {
    var uint8Array = new Uint8Array(bytes);
    imageData = figma.createImage(uint8Array);
  } catch (err) {
    figma.notify('Error creating image: ' + err.message);
    return;
  }
  
  // Calculate aspect ratio
  var aspectRatio = 1;
  if (width > 0 && height > 0) {
    aspectRatio = height / width;
  }
  
  // Create rectangle with image fill
  var rect = figma.createRectangle();
  var rectWidth = config.columnWidth;
  var rectHeight = Math.max(10, Math.round(rectWidth * aspectRatio));
  
  rect.resize(rectWidth, rectHeight);
  rect.fills = [{
    type: 'IMAGE',
    scaleMode: 'FIT',
    imageHash: imageData.hash
  }];
  
  // Find shortest column and add image
  var shortestColumn = findShortestColumn(gridFrame);
  if (shortestColumn) {
    shortestColumn.appendChild(rect);
    rect.layoutAlign = 'STRETCH';
    // Resize after appending to match column width
    var newWidth = shortestColumn.width > 0 ? shortestColumn.width : config.columnWidth;
    var newHeight = Math.max(10, Math.round(newWidth * aspectRatio));
    rect.resize(newWidth, newHeight);
  } else {
    // Fallback: add to grid frame directly
    gridFrame.appendChild(rect);
  }
  
  // Update view
  figma.currentPage.selection = [rect];
  figma.viewport.scrollAndZoomIntoView([rect]);
  figma.notify('Image added');
}

// ============================================
// GRID FRAME MANAGEMENT
// ============================================

function getOrCreateGridFrame() {
  // Check if we have an active valid frame
  if (activeFrameId) {
    var frame = figma.getNodeById(activeFrameId);
    if (frame && frame.type === 'FRAME' && !frame.removed) {
      return frame;
    }
  }
  
  // Check if user has a grid frame selected
  var selection = figma.currentPage.selection;
  if (selection.length === 1 && selection[0].type === 'FRAME') {
    var selectedFrame = selection[0];
    var pluginData = selectedFrame.getPluginData(PLUGIN_DATA_KEY);
    if (pluginData === 'true' && !selectedFrame.removed) {
      activeFrameId = selectedFrame.id;
      saveSession();
      sendSessionStatus('Resumed');
      return selectedFrame;
    }
  }
  
  // Create new grid frame
  return createNewGridFrame();
}

function createNewGridFrame() {
  var frame = figma.createFrame();
  frame.name = 'Pinterest Grid';
  
  // Set up horizontal auto-layout for columns
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = config.gap;
  frame.paddingTop = 20;
  frame.paddingBottom = 20;
  frame.paddingLeft = 20;
  frame.paddingRight = 20;
  frame.fills = [];
  
  // Mark as Pinterest Grid
  frame.setPluginData(PLUGIN_DATA_KEY, 'true');
  
  // Apply border if enabled
  updateFrameBorder(frame);
  
  // Create columns
  for (var i = 0; i < config.columns; i++) {
    var column = figma.createFrame();
    column.name = 'Column ' + (i + 1);
    
    // Set up vertical auto-layout
    column.layoutMode = 'VERTICAL';
    column.primaryAxisSizingMode = 'AUTO';
    column.counterAxisSizingMode = 'FIXED';
    column.itemSpacing = config.gap;
    column.fills = [];
    column.resize(config.columnWidth, 100);
    
    frame.appendChild(column);
  }
  
  // Position frame in empty area
  var position = findEmptyPosition();
  frame.x = position.x;
  frame.y = position.y;
  
  // Add to page
  figma.currentPage.appendChild(frame);
  
  // Save reference
  activeFrameId = frame.id;
  saveSession();
  sendSessionStatus('Active');
  
  return frame;
}

function updateFrameBorder(frame) {
  if (config.showBorder) {
    var color = hexToRgb(config.borderColor);
    frame.strokes = [{
      type: 'SOLID',
      color: color
    }];
    frame.strokeWeight = config.borderWidth;
  } else {
    frame.strokes = [];
  }
}

function findShortestColumn(gridFrame) {
  var shortestColumn = null;
  var minHeight = Infinity;
  
  for (var i = 0; i < gridFrame.children.length; i++) {
    var child = gridFrame.children[i];
    if (child.type === 'FRAME') {
      var height = child.height || 0;
      if (height < minHeight) {
        minHeight = height;
        shortestColumn = child;
      }
    }
  }
  
  return shortestColumn;
}

function findEmptyPosition() {
  var page = figma.currentPage;
  var maxY = 0;
  var minX = 100;
  
  for (var i = 0; i < page.children.length; i++) {
    var node = page.children[i];
    if (node.y !== undefined && node.height !== undefined) {
      var bottom = node.y + node.height;
      if (bottom > maxY) {
        maxY = bottom;
        if (node.x !== undefined) {
          minX = node.x;
        }
      }
    }
  }
  
  return {
    x: minX > 0 ? minX : 100,
    y: maxY + 100
  };
}

// ============================================
// UTILITIES
// ============================================

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    };
  }
  return { r: 0, g: 0, b: 0 };
}
