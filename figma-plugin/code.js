figma.showUI(__html__, { width: 300, height: 200 });

// Masonry Grid Configuration
const GRID_COLUMNS = 3;
const GRID_GAP = 20;

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

// Get all nodes on the page using Figma's findAll API (more reliable)
function getAllPageNodes() {
  const page = figma.currentPage;
  const allNodes = [];
  
  // Use findAll to get ALL nodes recursively (handles frames, groups, etc.)
  // This is the recommended way per Figma API
  try {
    // Find all nodes except the page itself
    const nodes = page.findAll();
    // Filter out the page node itself
    return nodes.filter(node => node.type !== 'PAGE');
  } catch (e) {
    // Fallback: manual recursion
    function traverse(node) {
      if (node.type !== 'PAGE') {
        allNodes.push(node);
      }
      if ('children' in node) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }
    traverse(page);
    return allNodes;
  }
}

// Find empty area on the page using absoluteBoundingBox for accurate bounds
function findEmptyArea() {
  const allNodes = getAllPageNodes();
  
  if (allNodes.length === 0) {
    // Page is empty, start at top-left with margin
    return { x: 100, y: 100 };
  }
  
  // Calculate bounding box of all existing nodes using absoluteBoundingBox
  // absoluteBoundingBox gives page-relative coordinates (handles frames, groups, etc.)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasValidBounds = false;
  
  allNodes.forEach(node => {
    // Use absoluteBoundingBox - this is the correct way per Figma API
    // It gives page coordinates even for nodes inside frames
    if ('absoluteBoundingBox' in node && node.absoluteBoundingBox) {
      const bbox = node.absoluteBoundingBox;
      if (bbox && isFinite(bbox.x) && isFinite(bbox.y) && isFinite(bbox.width) && isFinite(bbox.height)) {
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
        hasValidBounds = true;
      }
    }
  });
  
  // If we have existing grid state and it's below existing content, continue from there
  if (gridState.count > 0 && gridState.startY > 0 && hasValidBounds) {
    const gridBottom = gridState.startY + Math.max(...gridState.columns);
    if (gridBottom > maxY) {
      // Our grid is already below everything, continue from there
      return { x: gridState.startX, y: gridState.startY };
    }
  }
  
  // Find safe starting position: below all existing content with padding
  const SAFE_MARGIN = 50;
  let startX = 100; // Default fallback
  let startY = 100; // Default fallback
  
  if (hasValidBounds && isFinite(minX) && isFinite(maxX) && isFinite(maxY)) {
    startX = Math.max(100, minX);
    startY = maxY + SAFE_MARGIN;
  }
  
  // Final validation - ensure no NaN or Infinity
  if (!isFinite(startX) || isNaN(startX)) startX = 100;
  if (!isFinite(startY) || isNaN(startY)) startY = 100;
  
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
      
      console.log('Creating image from bytes:', bytes.length, 'bytes');

      if (!bytes || bytes.length === 0) {
        throw new Error('Image data is empty');
      }

      // Validate bytes array
      if (!Array.isArray(bytes)) {
        throw new Error('Bytes must be an array');
      }

      // Create Image Paint - using Uint8Array as per Figma API
      const uint8Array = new Uint8Array(bytes);
      
      // Log format for debugging but don't block
      const firstBytes = Array.from(uint8Array.slice(0, 4));
      console.log('Image first bytes:', firstBytes.map(b => '0x' + b.toString(16)).join(' '));
      
      const image = figma.createImage(uint8Array);
      
      // Create Rectangle node
      const node = figma.createRectangle();
      
      // Use ORIGINAL dimensions - don't downscale for quality
      // Only limit if it's extremely large (over 2000px) to avoid performance issues
      const MAX_DIMENSION = 2000;
      let finalWidth = width || 400;
      let finalHeight = height || 400;
      
      // Validate dimensions (prevent NaN)
      if (!isFinite(finalWidth) || isNaN(finalWidth) || finalWidth <= 0) finalWidth = 400;
      if (!isFinite(finalHeight) || isNaN(finalHeight) || finalHeight <= 0) finalHeight = 400;
      
      // Maintain aspect ratio if we need to scale down
      if (finalWidth > MAX_DIMENSION || finalHeight > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / finalWidth, MAX_DIMENSION / finalHeight);
        finalWidth = finalWidth * scale;
        finalHeight = finalHeight * scale;
      }
      
      // Final validation before resize
      if (!isFinite(finalWidth) || isNaN(finalWidth)) finalWidth = 400;
      if (!isFinite(finalHeight) || isNaN(finalHeight)) finalHeight = 400;

      // Resize the node to original dimensions (or scaled if too large)
      node.resize(finalWidth, finalHeight);
      
      // Set Fill with image - use FIT to preserve quality and aspect ratio
      node.fills = [{
        type: 'IMAGE',
        scaleMode: 'FIT', // FIT preserves aspect ratio without cropping
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
      // Use actual image width for column spacing (images vary in size)
      const columnIndex = findShortestColumn();
      // Estimate column width based on average (we'll use a fixed spacing for simplicity)
      const ESTIMATED_COLUMN_WIDTH = 500; // Approximate, images will vary
      let x = gridState.startX + (columnIndex * (ESTIMATED_COLUMN_WIDTH + GRID_GAP));
      let y = gridState.startY + gridState.columns[columnIndex];
      
      // Validate positions before setting (prevent NaN errors)
      if (!isFinite(x) || isNaN(x)) x = 100 + (columnIndex * (ESTIMATED_COLUMN_WIDTH + GRID_GAP));
      if (!isFinite(y) || isNaN(y)) y = 100 + (gridState.columns[columnIndex] || 0);
      
      // Ensure gridState values are valid
      if (!isFinite(gridState.startX) || isNaN(gridState.startX)) gridState.startX = 100;
      if (!isFinite(gridState.startY) || isNaN(gridState.startY)) gridState.startY = 100;
      
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
