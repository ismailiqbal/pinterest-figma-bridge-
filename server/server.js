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

// Endpoint for Chrome Extension (HTTP POST) -> Socket Room
app.post('/send-image-http', async (req, res) => {
  const { roomId, url, width, height } = req.body;
  
  if (!roomId || !url) {
    return res.status(400).send({ error: 'Missing roomId or url' });
  }

  console.log(`Bridge: Sending image to Room ${roomId}: ${url.substring(0, 30)}...`);
  
  // Fetch the image and convert to base64 to avoid CORS issues
  try {
    const imageResponse = await fetch(url);
    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    const imageDataUrl = `data:${imageResponse.headers.get('content-type') || 'image/jpeg'};base64,${imageBase64}`;
    
    // Broadcast to the specific room with data URL instead of original URL
    io.to(roomId).emit('new-image', { 
      url: imageDataUrl,  // Use data URL to avoid CORS
      width, 
      height, 
      timestamp: Date.now() 
    });
    
    res.send({ success: true });
  } catch (err) {
    console.error('Error fetching image:', err);
    // Fallback: send original URL anyway
    io.to(roomId).emit('new-image', { 
      url, 
      width, 
      height, 
      timestamp: Date.now() 
    });
    res.send({ success: true, warning: 'Could not proxy image' });
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
