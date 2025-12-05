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

// Recursively get all nodes including nested ones (frames, groups, etc.)
function getAllNodes(node) {
  const nodes = [];
  
  // Add current node if it's not a page
  if (node.type !== 'PAGE') {
    nodes.push(node);
  }
  
  // Recursively get children
  if ('children' in node) {
    for (const child of node.children) {
      nodes.push(...getAllNodes(child));
    }
  }
  
  return nodes;
}

// Find empty area on the page using absoluteBoundingBox for accurate bounds
function findEmptyArea() {
  const page = figma.currentPage;
  const allNodes = getAllNodes(page);
  
  if (allNodes.length === 0) {
    // Page is empty, start at top-left with margin
    return { x: 100, y: 100 };
  }
  
  // Calculate bounding box of all existing nodes using absoluteBoundingBox
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  allNodes.forEach(node => {
    // Use absoluteBoundingBox for accurate bounds (handles transforms, frames, etc.)
    if ('absoluteBoundingBox' in node && node.absoluteBoundingBox) {
      const bbox = node.absoluteBoundingBox;
      minX = Math.min(minX, bbox.x);
      minY = Math.min(minY, bbox.y);
      maxX = Math.max(maxX, bbox.x + bbox.width);
      maxY = Math.max(maxY, bbox.y + bbox.height);
    } else if ('x' in node && 'y' in node) {
      // Fallback for nodes without absoluteBoundingBox
      const width = 'width' in node ? node.width : 0;
      const height = 'height' in node ? node.height : 0;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    }
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

      // Create Image Paint - using Uint8Array as per Figma API
      const uint8Array = new Uint8Array(bytes);
      const image = figma.createImage(uint8Array);
      
      // Create Rectangle node
      const node = figma.createRectangle();
      
      // Calculate dimensions (maintain aspect ratio, max width per column)
      const ar = (width && height) ? width / height : 1;
      const finalWidth = Math.min(width || 400, MAX_COLUMN_WIDTH);
      const finalHeight = finalWidth / ar;

      // Resize the node
      node.resize(finalWidth, finalHeight);
      
      // Set Fill with image - using proper Figma ImagePaint type
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
      
      // Set position
      node.x = x;
      node.y = y;
      
      // Update column height
      gridState.columns[columnIndex] += finalHeight + GRID_GAP;
      gridState.count++;
      
      // Save updated state
      await saveGridState();
      
      // Add to page
      figma.currentPage.appendChild(node);
      
      // Select and Zoom to it - using proper viewport API
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
