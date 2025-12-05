figma.showUI(__html__, { width: 300, height: 200 });

// Masonry Grid Configuration
const GRID_COLUMNS = 3;
const GRID_GAP = 20;
const MAX_COLUMN_WIDTH = 400;

// Load grid state from storage
let gridState = {
  columns: Array(GRID_COLUMNS).fill(0), // Track height of each column
  count: 0,
  startX: 100,
  startY: 100
};

async function loadGridState() {
  try {
    const saved = await figma.clientStorage.getAsync('masonryGrid');
    if (saved) {
      gridState = saved;
    }
  } catch (e) {
    console.log('No saved grid state, starting fresh');
  }
}

async function saveGridState() {
  try {
    await figma.clientStorage.setAsync('masonryGrid', gridState);
  } catch (e) {
    console.error('Failed to save grid state:', e);
  }
}

// Find empty area on the page
function findEmptyArea() {
  const page = figma.currentPage;
  const allNodes = page.children;
  
  if (allNodes.length === 0) {
    // Page is empty, start at top-left with margin
    return { x: 100, y: 100 };
  }
  
  // Calculate bounding box of all existing nodes
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  allNodes.forEach(node => {
    // Skip if it's one of our grid images (optional: check by name or metadata)
    if (node.type === 'RECTANGLE' && node.fills && node.fills[0] && node.fills[0].type === 'IMAGE') {
      // This might be one of our images, but we'll include it in bounds calculation
    }
    
    const bounds = {
      x: node.x,
      y: node.y,
      width: 'width' in node ? node.width : 0,
      height: 'height' in node ? node.height : 0
    };
    
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  });
  
  // If we have existing grid state, check if we should continue from there
  if (gridState.count > 0 && gridState.startY > 0) {
    // Check if our grid area is below existing content
    const gridBottom = gridState.startY + Math.max(...gridState.columns);
    
    if (gridBottom > maxY) {
      // Our grid is already below everything, continue from there
      return { x: gridState.startX, y: gridState.startY };
    }
  }
  
  // Find safe starting position: below all existing content with padding
  const SAFE_MARGIN = 50;
  const startX = Math.max(100, minX); // Start at left margin or align with existing content
  const startY = maxY + SAFE_MARGIN; // Start below everything with margin
  
  return { x: startX, y: startY };
}

// Find the column with the minimum height (for masonry layout)
function findShortestColumn() {
  let minHeight = gridState.columns[0];
  let columnIndex = 0;
  
  for (let i = 1; i < gridState.columns.length; i++) {
    if (gridState.columns[i] < minHeight) {
      minHeight = gridState.columns[i];
      columnIndex = i;
    }
  }
  
  return columnIndex;
}

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-image') {
    try {
      await loadGridState();
      
      const { bytes, width, height } = msg;
      
      console.log('Creating image from bytes:', bytes.length);

      if (!bytes || bytes.length === 0) {
        throw new Error('Image data is empty');
      }

      // Create Image Paint
      const uint8Array = new Uint8Array(bytes);
      const image = figma.createImage(uint8Array);
      
      // Create Rectangle
      const node = figma.createRectangle();
      
      // Calculate dimensions (maintain aspect ratio, max width per column)
      const ar = (width && height) ? width / height : 1;
      const finalWidth = Math.min(width || 400, MAX_COLUMN_WIDTH);
      const finalHeight = finalWidth / ar;

      node.resize(finalWidth, finalHeight);
      
      // Set Fill
      node.fills = [{
        type: 'IMAGE',
        scaleMode: 'FILL',
        imageHash: image.hash
      }];
      
      // Find safe starting position if this is the first image or grid was reset
      if (gridState.count === 0) {
        const emptyArea = findEmptyArea();
        gridState.startX = emptyArea.x;
        gridState.startY = emptyArea.y;
        // Reset column heights when starting new grid
        gridState.columns = Array(GRID_COLUMNS).fill(0);
      }
      
      // Calculate position in masonry grid
      const columnIndex = findShortestColumn();
      const x = gridState.startX + (columnIndex * (MAX_COLUMN_WIDTH + GRID_GAP));
      const y = gridState.startY + gridState.columns[columnIndex];
      
      node.x = x;
      node.y = y;
      
      // Update column height
      gridState.columns[columnIndex] += finalHeight + GRID_GAP;
      gridState.count++;
      
      // Save updated state
      await saveGridState();
      
      // Add to page
      figma.currentPage.appendChild(node);
      
      // Select and Zoom to it
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      
      figma.notify(`Image ${gridState.count} added to grid!`);
      
    } catch (err) {
      console.error('Figma Plugin Error:', err);
      figma.notify('Error: ' + err.message);
    }
  }
  
  // Reset grid command (optional - can be triggered from UI)
  if (msg.type === 'reset-grid') {
    gridState = {
      columns: Array(GRID_COLUMNS).fill(0),
      count: 0,
      startX: 100,
      startY: 100
    };
    await saveGridState();
    figma.notify('Grid reset!');
  }
};

// Load grid state on startup
loadGridState();
