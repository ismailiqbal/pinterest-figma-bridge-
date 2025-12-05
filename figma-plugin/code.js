// Pinterest to Figma Plugin
// Enhanced Card Support

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
    await createCard(msg.bytes, msg.width, msg.height, msg.title, msg.link);
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

// Create Card with Image + Title + Link
async function createCard(bytes, w, h, title, link) {
  if (!bytes || !bytes.length) {
    figma.notify('No image data');
    return;
  }
  
  // Load fonts first
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  
  // Get or create grid
  var grid = getGrid();
  
  // Create image paint
  var uint8 = new Uint8Array(bytes);
  var img = figma.createImage(uint8);
  
  // Calculate dimensions
  var ratio = (h && w) ? (h / w) : 1;
  var cardWidth = Math.round(columnWidth);
  var imageHeight = Math.round(cardWidth * ratio);
  if (imageHeight < 10) imageHeight = 10;
  
  // --- Create Card Container ---
  var card = figma.createFrame();
  card.name = "Pin Card";
  card.layoutMode = "VERTICAL";
  card.primaryAxisSizingMode = "AUTO"; // Hug height
  card.counterAxisSizingMode = "FIXED"; // Fixed width
  card.resize(cardWidth, 100);
  card.itemSpacing = 0;
  card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  card.cornerRadius = 12;
  // Snapping to pixel grid
  card.x = Math.round(card.x);
  card.y = Math.round(card.y);
  card.effects = [{
    type: 'DROP_SHADOW',
    color: { r: 0, g: 0, b: 0, a: 0.1 },
    offset: { x: 0, y: 4 },
    radius: 12,
    visible: true,
    blendMode: 'NORMAL'
  }];
  
  // --- Image Section ---
  var imageFrame = figma.createFrame();
  imageFrame.name = "Image";
  imageFrame.layoutMode = "HORIZONTAL";
  imageFrame.counterAxisSizingMode = "FIXED";
  imageFrame.resize(cardWidth, imageHeight);
  imageFrame.fills = [{
    type: 'IMAGE',
    scaleMode: 'FIT',
    imageHash: img.hash
  }];
  card.appendChild(imageFrame);
  
  // --- Content Section ---
  var content = figma.createFrame();
  content.name = "Content";
  content.layoutMode = "VERTICAL";
  content.layoutAlign = "STRETCH";
  content.paddingLeft = 12;
  content.paddingRight = 12;
  content.paddingTop = 12;
  content.paddingBottom = 16;
  content.itemSpacing = 4;
  content.fills = [];
  
  // Title
  var titleText = figma.createText();
  titleText.fontName = { family: "Inter", style: "Bold" };
  titleText.characters = title || "Untitled Pin";
  titleText.fontSize = 14;
  titleText.layoutAlign = "STRETCH";
  titleText.textAutoResize = "HEIGHT";
  content.appendChild(titleText);
  
  // Link
  if (link) {
    var linkText = figma.createText();
    linkText.fontName = { family: "Inter", style: "Regular" };
    linkText.characters = "Open in Pinterest ↗";
    linkText.fontSize = 11;
    linkText.fills = [{ type: 'SOLID', color: { r: 0.5, g: 0.5, b: 0.5 } }]; // Gray
    linkText.layoutAlign = "STRETCH";
    linkText.textAutoResize = "HEIGHT";
    linkText.hyperlink = { type: "URL", value: link };
    content.appendChild(linkText);
  }
  
  card.appendChild(content);
  
  // --- Place in Grid ---
  var col = getShortestColumn(grid);
  if (col) {
    col.appendChild(card);
    card.layoutAlign = 'STRETCH';
  } else {
    grid.appendChild(card);
  }
  
  figma.currentPage.selection = [card];
  figma.viewport.scrollAndZoomIntoView([card]);
  figma.notify('Card added');
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
  frame.name = 'Moodboard';
  frame.layoutMode = 'HORIZONTAL';
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.itemSpacing = gap;
  frame.paddingTop = 40;
  frame.paddingBottom = 40;
  frame.paddingLeft = 40;
  frame.paddingRight = 40;
  frame.fills = []; // Transparent background
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
