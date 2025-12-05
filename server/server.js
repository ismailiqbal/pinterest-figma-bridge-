const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Try alternative Pinterest URL formats if one fails
async function tryFetchImage(url) {
  // Try the original URL first
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.pinterest.com/'
      }
    });
    if (response.ok) {
      return response;
    }
  } catch (e) {
    console.log(`Failed to fetch ${url}:`, e.message);
  }

  // If original URL failed and it's a Pinterest image, try alternative formats
  if (url.includes('pinimg.com')) {
    const alternatives = [];
    
    // If it's /originals/, try /1200x/ or /736x/
    if (url.includes('/originals/')) {
      alternatives.push(url.replace('/originals/', '/1200x/'));
      alternatives.push(url.replace('/originals/', '/736x/'));
      alternatives.push(url.replace('/originals/', '/564x/'));
    }
    // If it's a sized URL, try /originals/ or larger sizes
    else if (url.match(/\/\d+x\//)) {
      alternatives.push(url.replace(/\/\d+x\//, '/originals/'));
      alternatives.push(url.replace(/\/\d+x\//, '/1200x/'));
      alternatives.push(url.replace(/\/\d+x\//, '/736x/'));
    }
    
    // Try each alternative
    for (const altUrl of alternatives) {
      try {
        const response = await fetch(altUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.pinterest.com/'
          }
        });
        if (response.ok) {
          console.log(`Successfully fetched alternative URL: ${altUrl.substring(0, 50)}...`);
          return response;
        }
      } catch (e) {
        // Continue to next alternative
      }
    }
  }
  
  throw new Error(`Failed to fetch image from ${url.substring(0, 50)}...`);
}

// Endpoint for Chrome Extension (HTTP POST) -> Socket Room
app.post('/send-image-http', async (req, res) => {
  const { roomId, url, width, height } = req.body;
  
  if (!roomId || !url) {
    return res.status(400).send({ error: 'Missing roomId or url' });
  }

  console.log(`Bridge: Receiving image for Room ${roomId}: ${url.substring(0, 50)}...`);
  
  // Fetch the image and convert to base64 to avoid CORS issues
  try {
    const imageResponse = await tryFetchImage(url);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    const imageDataUrl = `data:${imageResponse.headers.get('content-type') || 'image/jpeg'};base64,${imageBase64}`;
    
    console.log(`Bridge: Successfully proxied image (${imageDataUrl.length} bytes), sending to Room ${roomId}`);
    
    // Broadcast to the specific room with data URL instead of original URL
    io.to(roomId).emit('new-image', { 
      url: imageDataUrl,  // Always use data URL to avoid CORS
      width, 
      height, 
      timestamp: Date.now() 
    });
    
    res.send({ success: true });
  } catch (err) {
    console.error('Bridge: Error fetching image:', err.message);
    // DO NOT send original URL - that causes CORS errors
    // Instead, return an error so the extension can handle it
    res.status(500).send({ 
      success: false, 
      error: `Could not fetch image: ${err.message}. The image may be blocked by Pinterest.` 
    });
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
    socket.emit('joined', { roomId });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3333;
server.listen(PORT, () => {
  console.log(`Real-time Bridge Server running on port ${PORT}`);
});
