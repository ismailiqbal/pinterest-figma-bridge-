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

// Find empty area on the page by looking at TOP-LEVEL nodes only
// We don't need to recurse deep; top-level frames/groups define the layout structure.
function findEmptyArea() {
  const page = figma.currentPage;
  const topLevelNodes = page.children;
  
  if (topLevelNodes.length === 0) {
    // Page is completely empty
    return { x: 0, y: 0 };
  }
  
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasContent = false;
  
  for (const node of topLevelNodes) {
    // We use absoluteBoundingBox because it accounts for rotation/position correctly
    // For top-level nodes, x/y is usually sufficient, but absolute is safer.
    
    // Skip our own grid images if we want to append to them (optional, handled by gridState)
    // But here we want to find the "bottom" of the page content to potentially start a new grid
    // or ensure we don't overlap if gridState is lost.
    
    if ('absoluteBoundingBox' in node && node.absoluteBoundingBox) {
      const bbox = node.absoluteBoundingBox;
      minX = Math.min(minX, bbox.x);
      maxX = Math.max(maxX, bbox.x + bbox.width);
      maxY = Math.max(maxY, bbox.y + bbox.height);
      hasContent = true;
    } else if ('width' in node && 'height' in node && 'x' in node && 'y' in node) {
        // Fallback for nodes that might not return absoluteBoundingBox (unlikely for top-level)
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
        hasContent = true;
    }
  }
  
  if (!hasContent) {
      return { x: 0, y: 0 };
  }

  // If we have a stored grid state that is BELOW the current content, use it.
  // This happens if we just added an image.
  // But if the user moved things around, we might need to re-calculate.
  
  // Strategy:
  // 1. If gridState.startY is already > maxY, we are safe.
  // 2. If not, we need to move our start point.
  
  const currentGridBottom = gridState.startY + Math.max(...(gridState.columns || [0]));
  
  if (currentGridBottom > maxY) {
      // Our current grid keeps us safe (we are the lowest thing)
      return { x: gridState.startX, y: gridState.startY };
  }
  
  // Otherwise, start a new block below everything
  const GAP_FROM_CONTENT = 100;
  // Align left with content, or 0 if content is far right
  const newX = (minX === Infinity) ? 0 : minX; 
  const newY = maxY + GAP_FROM_CONTENT;
  
  return { x: newX, y: newY };
}

// Find the column with the minimum height (for masonry layout)
function findShortestColumn() {
  if (!gridState.columns || gridState.columns.length === 0) {
      gridState.columns = Array(GRID_COLUMNS).fill(0);
  }

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
      
      // Use ORIGINAL dimensions - don't downscale for quality
      const MAX_DIMENSION = 2000;
      let finalWidth = width || 400;
      let finalHeight = height || 400;
      
      // Validate dimensions
      if (!Number.isFinite(finalWidth) || finalWidth <= 0) finalWidth = 400;
      if (!Number.isFinite(finalHeight) || finalHeight <= 0) finalHeight = 400;
      
      // Scale down if huge
      if (finalWidth > MAX_DIMENSION || finalHeight > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / finalWidth, MAX_DIMENSION / finalHeight);
        finalWidth = finalWidth * scale;
        finalHeight = finalHeight * scale;
      }

      node.resize(finalWidth, finalHeight);
      
      // Set Fill (FIT to preserve quality)
      node.fills = [{
        type: 'IMAGE',
        scaleMode: 'FIT', 
        imageHash: image.hash
      }];
      
      // CHECK FOR EMPTY SPACE & GRID POSITION
      // We re-evaluate position every time to ensure we don't overlap if user moved things
      // But we want to maintain the "grid" structure for a session.
      
      // If this is the first image of a session OR we forced a reset, recalculate start.
      // Actually, we should check if our current grid "pointer" is safe.
      
      const emptyPos = findEmptyArea();
      
      // If findEmptyArea returned a NEW Y that is significantly different from our gridState.startY,
      // it means there was content in the way, so we should adopt this new start position
      // and reset columns to 0 (start a new row/grid section).
      
      if (Math.abs(emptyPos.y - gridState.startY) > 1 && emptyPos.y > gridState.startY) {
          // Content is blocking our old grid area. Move down and reset columns.
          gridState.startX = emptyPos.x;
          gridState.startY = emptyPos.y;
          gridState.columns = Array(GRID_COLUMNS).fill(0);
          console.log("Moved grid start to avoid overlap:", gridState.startY);
      }
      
      // Calculate specific X/Y for this image in the masonry
      const columnIndex = findShortestColumn();
      const ESTIMATED_COLUMN_WIDTH = 500; // We don't restrict width, so we assume a "slot" width for spacing
      
      // Validated positions
      let x = gridState.startX + (columnIndex * (ESTIMATED_COLUMN_WIDTH + GRID_GAP));
      let y = gridState.startY + gridState.columns[columnIndex];
      
      node.x = x;
      node.y = y;
      
      // Update column height for next image
      gridState.columns[columnIndex] += finalHeight + GRID_GAP;
      gridState.count++;
      
      await saveGridState();
      
      // Add to page
      figma.currentPage.appendChild(node);
      
      // Select and Zoom
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      
      figma.notify(`Image added!`);
      
    } catch (err) {
      console.error('Figma Plugin Error:', err);
      figma.notify('Error: ' + err.message);
    }
  }
};

loadGridState();
