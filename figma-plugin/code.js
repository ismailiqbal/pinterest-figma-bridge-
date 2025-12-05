figma.showUI(__html__, { width: 300, height: 200 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-image') {
    try {
      const { bytes, width, height } = msg;
      
      console.log('Creating image from bytes:', bytes.length);

      if (!bytes || bytes.length === 0) {
        throw new Error('Image data is empty');
      }

      // Convert Array back to Uint8Array (postMessage converts it)
      const uint8Array = new Uint8Array(bytes);
      
      // Create Image Paint
      const image = figma.createImage(uint8Array);
      
      // Create Rectangle
      const node = figma.createRectangle();
      
      // Calculate dimensions (max 600px width for initial paste)
      const MAX_WIDTH = 600;
      const ar = (width && height) ? width / height : 1;
      const finalWidth = Math.min(width || 400, MAX_WIDTH);
      const finalHeight = finalWidth / ar;

      node.resize(finalWidth, finalHeight);
      
      // Set Fill
      node.fills = [{
        type: 'IMAGE',
        scaleMode: 'FILL',
        imageHash: image.hash
      }];
      
      // Position in center of viewport
      node.x = figma.viewport.center.x - (finalWidth / 2);
      node.y = figma.viewport.center.y - (finalHeight / 2);
      
      // Add to page
      figma.currentPage.appendChild(node);
      
      // Select and Zoom to it
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      
      figma.notify('Image pasted!');
      
    } catch (err) {
      console.error('Figma Plugin Error:', err);
      figma.notify('Error: ' + err.message);
    }
  }
};
