const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const sharp = require('sharp');

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
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    let contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
    
    // Check actual image format by magic bytes (first few bytes)
    const buffer = Buffer.from(imageBuffer);
    const firstBytes = buffer.slice(0, 4);
    
    // Detect format from magic bytes
    let detectedFormat = contentType;
    if (firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4E && firstBytes[3] === 0x47) {
      detectedFormat = 'image/png';
    } else if (firstBytes[0] === 0xFF && firstBytes[1] === 0xD8 && firstBytes[2] === 0xFF) {
      detectedFormat = 'image/jpeg';
    } else if (firstBytes[0] === 0x47 && firstBytes[1] === 0x49 && firstBytes[2] === 0x46 && firstBytes[3] === 0x38) {
      detectedFormat = 'image/gif';
    } else if (firstBytes[0] === 0x52 && firstBytes[1] === 0x49 && firstBytes[2] === 0x46 && firstBytes[3] === 0x46) {
      // RIFF header - could be WebP
      if (buffer.length > 8 && buffer.slice(8, 12).toString() === 'WEBP') {
        detectedFormat = 'image/webp';
        console.log('WARNING: WebP format detected. Figma does not support WebP. Converting to PNG...');
        // WebP is not supported by Figma - we need to convert it
        // For now, log the issue - user will need to install sharp or jimp for conversion
        throw new Error('WebP format is not supported by Figma. Please use PNG or JPEG images.');
      }
    }
    
    // Use detected format if different from content-type
    if (detectedFormat !== contentType) {
      console.log(`Format mismatch: Content-Type says ${contentType}, but magic bytes indicate ${detectedFormat}`);
      contentType = detectedFormat;
    }
    
    // Ensure we have a valid image type that Figma supports
    if (!contentType.startsWith('image/')) {
      throw new Error('Invalid content type: ' + contentType);
    }
    
    // Figma only supports PNG, JPEG, and GIF
    // If WebP, convert to PNG
    let finalBuffer = buffer;
    let finalContentType = contentType;
    
    if (contentType === 'image/webp' || detectedFormat === 'image/webp') {
      console.log('Converting WebP to PNG for Figma compatibility...');
      try {
        finalBuffer = await sharp(buffer).png().toBuffer();
        finalContentType = 'image/png';
        console.log('WebP converted to PNG successfully');
      } catch (conversionError) {
        console.error('Failed to convert WebP:', conversionError);
        throw new Error('WebP format is not supported by Figma and conversion failed. Please use PNG or JPEG images.');
      }
    }
    
    const imageBase64 = finalBuffer.toString('base64');
    const imageDataUrl = `data:${finalContentType};base64,${imageBase64}`;
    
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
