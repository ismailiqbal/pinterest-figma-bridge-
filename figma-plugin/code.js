// Pinterest to Figma Plugin
// Minimal implementation

figma.showUI(__html__, { width: 320, height: 480 });

// Grid settings
var columns = 3;
var gap = 20;
var columnWidth = 300;
var showBorder = false;
var borderWidth = 2;
var borderColor = '#000000';

// Current grid frame ID
var gridId = null;

// Message handler
figma.ui.onmessage = async function(msg) {
  
  if (msg.type === 'create-image') {
    await createImage(msg.bytes, msg.width, msg.height, msg.title, msg.originalUrl);
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
    figma.notify('Ready for new grid');
  }
};

// Selection change handler
figma.on('selectionchange', function() {
  var sel = figma.currentPage.selection;
  if (sel.length === 1 && sel[0].type === 'FRAME') {
    var data = sel[0].getPluginData('pinterest');
    if (data === 'grid') {
      gridId = sel[0].id;
      figma.ui.postMessage({ type: 'session-status', status: 'Resumed' });
    }
  }
});

// Create image function
async function createImage(bytes, w, h, title, url) {
  if (!bytes || !bytes.length) {
    figma.notify('No image data');
    return;
  }
  
  // Load fonts first
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  
  // Get or create grid
  var grid = getGrid();
  
  // Create image
  var uint8 = new Uint8Array(bytes);
  var img = figma.createImage(uint8);
  
  // Calculate image dimensions
  var ratio = (h && w) ? (h / w) : 1;
  var cardWidth = columnWidth;
  var imgHeight = Math.round(cardWidth * ratio);
  if (imgHeight < 10) imgHeight = 10;
  
  // Create Card Frame
  var card = figma.createFrame();
  card.name = "Pin Card";
  card.layoutMode = 'VERTICAL';
  card.primaryAxisSizingMode = 'AUTO'; // Hug height
  card.counterAxisSizingMode = 'FIXED'; // Fixed width
  card.width = cardWidth;
  card.itemSpacing = 8;
  card.paddingTop = 0;
  card.paddingLeft = 0;
  card.paddingRight = 0;
  card.paddingBottom = 12;
  card.fills = []; // Transparent background
  // Alternatively, for a "Card" look:
  // card.fills = [{ type: 'SOLID', color: {r:1, g:1, b:1} }];
  // card.cornerRadius = 8;
  
  // 1. Image Node
  var imgRect = figma.createRectangle();
  imgRect.resize(cardWidth, imgHeight);
  imgRect.fills = [{
    type: 'IMAGE',
    scaleMode: 'FIT',
    imageHash: img.hash
  }];
  imgRect.cornerRadius = 12; // Rounded image corners
  card.appendChild(imgRect);
  
  // 2. Title Text
  if (title) {
    var titleText = figma.createText();
    titleText.fontName = { family: "Inter", style: "Bold" };
    titleText.characters = title;
    titleText.fontSize = 12;
    titleText.textAutoResize = 'HEIGHT';
    titleText.layoutAlign = 'STRETCH'; // Fill width
    card.appendChild(titleText);
  }
  
  // 3. Link Text
  if (url) {
    var linkText = figma.createText();
    linkText.fontName = { family: "Inter", style: "Regular" };
    linkText.characters = "View on Pinterest ↗";
    linkText.fontSize = 10;
    linkText.fills = [{ type: 'SOLID', color: {r:0.5, g:0.5, b:0.5} }];
    linkText.textDecoration = 'UNDERLINE';
    linkText.hyperlink = { type: 'URL', value: url };
    linkText.textAutoResize = 'HEIGHT';
    linkText.layoutAlign = 'STRETCH';
    card.appendChild(linkText);
  }
  
  // Find shortest column
  var col = getShortestColumn(grid);
  if (col) {
    col.appendChild(card);
    card.layoutAlign = 'STRETCH';
  } else {
    grid.appendChild(card);
  }
  
  figma.currentPage.selection = [card];
  figma.viewport.scrollAndZoomIntoView([card]);
  figma.notify('Image added');
}

// Get or create grid
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
  frame.name = 'Pinterest Grid';
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = gap;
  frame.paddingTop = 20;
  frame.paddingBottom = 20;
  frame.paddingLeft = 20;
  frame.paddingRight = 20;
  frame.fills = [];
  frame.setPluginData('pinterest', 'grid');
  
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
  
  // Position
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

// Find shortest column
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

// Hex to RGB
function hexToRgb(hex) {
  var r = parseInt(hex.slice(1, 3), 16) / 255;
  var g = parseInt(hex.slice(3, 5), 16) / 255;
  var b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r: r, g: g, b: b };
}

console.log('Pinterest Bridge: Ready');
