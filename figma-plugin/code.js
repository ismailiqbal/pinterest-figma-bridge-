// Pinterest to Figma - Plugin Code
// Using async/await instead of .then() for better compatibility

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

// Runtime state
var config = null;
var activeFrameId = null;

// ============================================
// MAIN ENTRY POINT
// ============================================

figma.showUI(__html__, { width: 320, height: 480 });

figma.ui.onmessage = async function(msg) {
  console.log('Plugin received:', msg.type);
  
  try {
    if (msg.type === 'create-image') {
      await handleCreateImage(msg.bytes, msg.width, msg.height);
    }
    else if (msg.type === 'get-config') {
      await handleGetConfig();
    }
    else if (msg.type === 'update-config') {
      await handleUpdateConfig(msg);
    }
    else if (msg.type === 'reset-session') {
      await handleResetSession();
    }
  } catch (err) {
    console.log('Error handling message:', err);
    figma.notify('Error: ' + String(err));
  }
};

figma.on('selectionchange', function() {
  try {
    handleSelectionChange();
  } catch (err) {
    console.log('Selection error:', err);
  }
});

// Initialize
initPlugin();

// ============================================
// INITIALIZATION
// ============================================

async function initPlugin() {
  try {
    // Load config
    var savedConfig = await figma.clientStorage.getAsync(STORAGE_CONFIG_KEY);
    if (savedConfig) {
      config = {
        columns: savedConfig.columns || DEFAULT_CONFIG.columns,
        gap: savedConfig.gap || DEFAULT_CONFIG.gap,
        columnWidth: savedConfig.columnWidth || DEFAULT_CONFIG.columnWidth,
        showBorder: savedConfig.showBorder || DEFAULT_CONFIG.showBorder,
        borderWidth: savedConfig.borderWidth || DEFAULT_CONFIG.borderWidth,
        borderColor: savedConfig.borderColor || DEFAULT_CONFIG.borderColor
      };
    } else {
      config = {
        columns: DEFAULT_CONFIG.columns,
        gap: DEFAULT_CONFIG.gap,
        columnWidth: DEFAULT_CONFIG.columnWidth,
        showBorder: DEFAULT_CONFIG.showBorder,
        borderWidth: DEFAULT_CONFIG.borderWidth,
        borderColor: DEFAULT_CONFIG.borderColor
      };
    }
    
    // Load session
    var savedSession = await figma.clientStorage.getAsync(STORAGE_SESSION_KEY);
    if (savedSession && savedSession.activeFrameId) {
      var node = figma.getNodeById(savedSession.activeFrameId);
      if (node && node.type === 'FRAME') {
        var pluginData = node.getPluginData(PLUGIN_DATA_KEY);
        if (pluginData === 'true') {
          activeFrameId = savedSession.activeFrameId;
        }
      }
    }
    
    console.log('Pinterest Bridge: Initialized');
  } catch (err) {
    console.log('Init error:', err);
    config = {
      columns: DEFAULT_CONFIG.columns,
      gap: DEFAULT_CONFIG.gap,
      columnWidth: DEFAULT_CONFIG.columnWidth,
      showBorder: DEFAULT_CONFIG.showBorder,
      borderWidth: DEFAULT_CONFIG.borderWidth,
      borderColor: DEFAULT_CONFIG.borderColor
    };
  }
}

// ============================================
// MESSAGE HANDLERS
// ============================================

async function handleGetConfig() {
  if (!config) {
    config = {
      columns: DEFAULT_CONFIG.columns,
      gap: DEFAULT_CONFIG.gap,
      columnWidth: DEFAULT_CONFIG.columnWidth,
      showBorder: DEFAULT_CONFIG.showBorder,
      borderWidth: DEFAULT_CONFIG.borderWidth,
      borderColor: DEFAULT_CONFIG.borderColor
    };
  }
  
  figma.ui.postMessage({
    type: 'config-loaded',
    columns: config.columns,
    gap: config.gap,
    columnWidth: config.columnWidth,
    showBorder: config.showBorder,
    borderWidth: config.borderWidth,
    borderColor: config.borderColor
  });
  
  // Send session status
  var status = activeFrameId ? 'Active' : 'None';
  figma.ui.postMessage({
    type: 'session-status',
    status: status
  });
}

async function handleUpdateConfig(msg) {
  config = {
    columns: msg.columns || 3,
    gap: msg.gap || 20,
    columnWidth: config ? config.columnWidth : 300,
    showBorder: msg.showBorder || false,
    borderWidth: msg.borderWidth || 2,
    borderColor: msg.borderColor || '#000000'
  };
  
  await figma.clientStorage.setAsync(STORAGE_CONFIG_KEY, config);
  
  // Update active frame if exists
  if (activeFrameId) {
    var frame = figma.getNodeById(activeFrameId);
    if (frame && frame.type === 'FRAME') {
      frame.itemSpacing = config.gap;
      applyBorder(frame);
      
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

async function handleResetSession() {
  activeFrameId = null;
  await figma.clientStorage.setAsync(STORAGE_SESSION_KEY, { activeFrameId: null });
  
  figma.ui.postMessage({
    type: 'session-status',
    status: 'None'
  });
  
  figma.notify('Ready for new grid');
}

async function handleCreateImage(bytes, width, height) {
  if (!bytes || bytes.length === 0) {
    figma.notify('Error: No image data');
    return;
  }
  
  // Ensure config
  if (!config) {
    config = {
      columns: DEFAULT_CONFIG.columns,
      gap: DEFAULT_CONFIG.gap,
      columnWidth: DEFAULT_CONFIG.columnWidth,
      showBorder: DEFAULT_CONFIG.showBorder,
      borderWidth: DEFAULT_CONFIG.borderWidth,
      borderColor: DEFAULT_CONFIG.borderColor
    };
  }
  
  // Get or create grid
  var gridFrame = getOrCreateGrid();
  if (!gridFrame) {
    figma.notify('Error: Could not create grid');
    return;
  }
  
  // Create image from bytes
  var uint8 = new Uint8Array(bytes);
  var imageData = figma.createImage(uint8);
  
  // Calculate size
  var aspectRatio = (height > 0 && width > 0) ? (height / width) : 1;
  var rectWidth = config.columnWidth;
  var rectHeight = Math.max(10, Math.round(rectWidth * aspectRatio));
  
  // Create rectangle
  var rect = figma.createRectangle();
  rect.resize(rectWidth, rectHeight);
  rect.fills = [{
    type: 'IMAGE',
    scaleMode: 'FIT',
    imageHash: imageData.hash
  }];
  
  // Add to shortest column
  var column = findShortestColumn(gridFrame);
  if (column) {
    column.appendChild(rect);
    rect.layoutAlign = 'STRETCH';
  } else {
    gridFrame.appendChild(rect);
  }
  
  // Focus on new image
  figma.currentPage.selection = [rect];
  figma.viewport.scrollAndZoomIntoView([rect]);
  figma.notify('Image added');
}

// ============================================
// SELECTION HANDLER
// ============================================

function handleSelectionChange() {
  var selection = figma.currentPage.selection;
  
  if (selection.length === 1) {
    var node = selection[0];
    if (node.type === 'FRAME') {
      var pluginData = node.getPluginData(PLUGIN_DATA_KEY);
      if (pluginData === 'true') {
        activeFrameId = node.id;
        figma.clientStorage.setAsync(STORAGE_SESSION_KEY, { activeFrameId: activeFrameId });
        figma.ui.postMessage({ type: 'session-status', status: 'Resumed' });
        return;
      }
    }
  }
  
  // Check if current session valid
  if (activeFrameId) {
    var frame = figma.getNodeById(activeFrameId);
    if (frame) {
      figma.ui.postMessage({ type: 'session-status', status: 'Active' });
    } else {
      activeFrameId = null;
      figma.ui.postMessage({ type: 'session-status', status: 'None' });
    }
  } else {
    figma.ui.postMessage({ type: 'session-status', status: 'None' });
  }
}

// ============================================
// GRID MANAGEMENT
// ============================================

function getOrCreateGrid() {
  // Check active frame
  if (activeFrameId) {
    var frame = figma.getNodeById(activeFrameId);
    if (frame && frame.type === 'FRAME') {
      return frame;
    }
  }
  
  // Check selection
  var selection = figma.currentPage.selection;
  if (selection.length === 1 && selection[0].type === 'FRAME') {
    var sel = selection[0];
    var pluginData = sel.getPluginData(PLUGIN_DATA_KEY);
    if (pluginData === 'true') {
      activeFrameId = sel.id;
      figma.clientStorage.setAsync(STORAGE_SESSION_KEY, { activeFrameId: activeFrameId });
      return sel;
    }
  }
  
  // Create new grid
  return createGrid();
}

function createGrid() {
  var frame = figma.createFrame();
  frame.name = 'Pinterest Grid';
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = config.gap;
  frame.paddingTop = 20;
  frame.paddingBottom = 20;
  frame.paddingLeft = 20;
  frame.paddingRight = 20;
  frame.fills = [];
  
  frame.setPluginData(PLUGIN_DATA_KEY, 'true');
  applyBorder(frame);
  
  // Create columns
  for (var i = 0; i < config.columns; i++) {
    var col = figma.createFrame();
    col.name = 'Column ' + (i + 1);
    col.layoutMode = 'VERTICAL';
    col.primaryAxisSizingMode = 'AUTO';
    col.counterAxisSizingMode = 'FIXED';
    col.itemSpacing = config.gap;
    col.fills = [];
    col.resize(config.columnWidth, 100);
    frame.appendChild(col);
  }
  
  // Position below existing content
  var pos = findEmptyPosition();
  frame.x = pos.x;
  frame.y = pos.y;
  
  figma.currentPage.appendChild(frame);
  
  activeFrameId = frame.id;
  figma.clientStorage.setAsync(STORAGE_SESSION_KEY, { activeFrameId: activeFrameId });
  figma.ui.postMessage({ type: 'session-status', status: 'Active' });
  
  return frame;
}

function findShortestColumn(gridFrame) {
  var shortest = null;
  var minH = Infinity;
  
  for (var i = 0; i < gridFrame.children.length; i++) {
    var child = gridFrame.children[i];
    if (child.type === 'FRAME') {
      var h = child.height || 0;
      if (h < minH) {
        minH = h;
        shortest = child;
      }
    }
  }
  
  return shortest;
}

function findEmptyPosition() {
  var maxY = 0;
  var minX = 100;
  var children = figma.currentPage.children;
  
  for (var i = 0; i < children.length; i++) {
    var node = children[i];
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
  
  return { x: minX > 0 ? minX : 100, y: maxY + 100 };
}

function applyBorder(frame) {
  if (config.showBorder) {
    var rgb = hexToRgb(config.borderColor);
    frame.strokes = [{ type: 'SOLID', color: rgb }];
    frame.strokeWeight = config.borderWidth;
  } else {
    frame.strokes = [];
  }
}

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
