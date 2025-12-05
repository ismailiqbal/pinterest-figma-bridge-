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
app.post('/send-image-http', (req, res) => {
  const { roomId, url, width, height } = req.body;
  
  if (!roomId || !url) {
    return res.status(400).send({ error: 'Missing roomId or url' });
  }

  console.log(`Bridge: Sending image to Room ${roomId}: ${url.substring(0, 30)}...`);
  
  // Broadcast to the specific room
  // io.to(roomId) sends to everyone in the room
  io.to(roomId).emit('new-image', { 
    url, 
    width, 
    height, 
    timestamp: Date.now() 
  });
  
  res.send({ success: true });
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
