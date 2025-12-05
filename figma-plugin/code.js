figma.showUI(__html__, { width: 300, height: 200 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-image') {
    try {
      const { url, width, height } = msg.data;
      
      // Figma requires fetching the image data
      // We can't fetch directly in main thread usually, but we can do createNodeFromBlob if we have bytes
      // Or we can create an image paint. 
      // Actually, plugins usually fetch in UI thread and send bytes to main thread.
      // But let's assume the UI thread handled the fetch.
      
      // Wait, 'msg.data' coming from UI thread can contain the bytes (Uint8Array)
      // So UI thread: fetch(url) -> arrayBuffer -> postMessage to code.js
      
      const image = figma.createImage(new Uint8Array(msg.bytes));
      const node = figma.createRectangle();
      
      // Resize
      const ar = width / height;
      node.resize(400, 400 / ar); // Default width 400
      
      node.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
      
      // Center in viewport
      node.x = figma.viewport.center.x - node.width / 2;
      node.y = figma.viewport.center.y - node.height / 2;
      
      figma.currentPage.appendChild(node);
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      
      figma.notify('Image pasted from Pinterest!');
      
    } catch (err) {
      console.error(err);
      figma.notify('Failed to create image: ' + err.message);
    }
  }
};

