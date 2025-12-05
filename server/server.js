const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const server = http.createServer(app);

// Native WebSocket server
const wss = new WebSocket.Server({ server });

// Room management
const rooms = new Map(); // roomId -> Set of WebSocket connections

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'join') {
        const roomId = data.roomId;
        ws.roomId = roomId;
        
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(ws);
        
        console.log(`Client joined room ${roomId}`);
        ws.send(JSON.stringify({ type: 'joined', roomId }));
      }
    } catch (e) {
      console.log('WebSocket message error:', e);
    }
  });
  
  ws.on('close', () => {
    if (ws.roomId && rooms.has(ws.roomId)) {
      rooms.get(ws.roomId).delete(ws);
      if (rooms.get(ws.roomId).size === 0) {
        rooms.delete(ws.roomId);
      }
    }
    console.log('WebSocket client disconnected');
  });
});

// Broadcast to room
function broadcastToRoom(roomId, data) {
  if (rooms.has(roomId)) {
    const message = JSON.stringify(data);
    rooms.get(roomId).forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
}

// Try alternative Pinterest URL formats
async function tryFetchImage(url) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.pinterest.com/'
  };

  // Try original URL first
  try {
    const response = await fetch(url, { headers });
    if (response.ok) return response;
  } catch (e) {
    console.log('Original URL failed:', e.message);
  }

  // Try alternative formats for Pinterest images
  if (url.includes('pinimg.com')) {
    const alternatives = [];
    
    if (url.includes('/originals/')) {
      alternatives.push(url.replace('/originals/', '/1200x/'));
      alternatives.push(url.replace('/originals/', '/736x/'));
    } else if (url.match(/\/\d+x\//)) {
      alternatives.push(url.replace(/\/\d+x\//, '/originals/'));
      alternatives.push(url.replace(/\/\d+x\//, '/1200x/'));
    }
    
    for (const altUrl of alternatives) {
      try {
        const response = await fetch(altUrl, { headers });
        if (response.ok) {
          console.log('Alternative URL worked:', altUrl.substring(0, 60));
          return response;
        }
      } catch (e) {}
    }
  }
  
  throw new Error('Failed to fetch image');
}

// HTTP endpoint for Chrome Extension
app.post('/send-image-http', async (req, res) => {
  const { roomId, url, width, height, title } = req.body;
  
  if (!roomId || !url) {
    return res.status(400).send({ error: 'Missing roomId or url' });
  }

  console.log(`Receiving image for room ${roomId}`);
  
  try {
    const imageResponse = await tryFetchImage(url);
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${contentType};base64,${base64}`;
    
    console.log(`Proxied image (${dataUrl.length} bytes), sending to room ${roomId}`);
    
    broadcastToRoom(roomId, { 
      type: 'new-image',
      url: dataUrl,
      originalUrl: url,
      title: title || 'Pinterest Image',
      width, 
      height, 
      timestamp: Date.now() 
    });
    
    res.send({ success: true });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).send({ 
      success: false, 
      error: 'Could not fetch image' 
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.send('Pinterest-Figma Bridge Running');
});

const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
  console.log(`Bridge server running on port ${PORT}`);
});
