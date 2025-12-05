figma.showUI(__html__, { width: 300, height: 200 });

// Masonry Grid Configuration
const GRID_COLUMNS = 3;
const GRID_GAP = 20;
const GRID_START_X = 100; // Starting X position
const GRID_START_Y = 100; // Starting Y position
const MAX_COLUMN_WIDTH = 400; // Max width per column

// Load grid state from storage
let gridState = {
  columns: Array(GRID_COLUMNS).fill(0), // Track height of each column
  count: 0
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
      
      // Calculate position in masonry grid
      const columnIndex = findShortestColumn();
      const x = GRID_START_X + (columnIndex * (MAX_COLUMN_WIDTH + GRID_GAP));
      const y = GRID_START_Y + gridState.columns[columnIndex];
      
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
      count: 0
    };
    await saveGridState();
    figma.notify('Grid reset!');
  }
};

// Load grid state on startup
loadGridState();
