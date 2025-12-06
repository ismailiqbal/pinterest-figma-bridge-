# Figpins

> Seamlessly send Pinterest images to Figma with metadata

A production-ready Chrome Extension + Figma Plugin that enables real-time image transfer from Pinterest to Figma, complete with titles and source URLs.

## 🏗️ Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  Chrome Ext     │ ──────▶ │  Bridge Server  │ ──────▶ │  Figma Plugin   │
│  (Pinterest)    │  HTTP   │  (Node.js)      │   WS    │  (Figma)        │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

- **Chrome Extension**: Adds "Send" buttons to Pinterest images
- **Bridge Server**: Real-time WebSocket server with Pinterest API integration
- **Figma Plugin**: Receives images and arranges them in a masonry grid

## 🚀 Quick Start

### 1. Deploy Server

```bash
cd server
npm install
npm start
```

**Environment Variables** (for Pinterest API):
```
PINTEREST_APP_ID=your_app_id
PINTEREST_APP_SECRET=your_app_secret
PINTEREST_REDIRECT_URI=https://your-server.com/auth/callback
```

Deploy to [Render.com](https://render.com):
- Build Command: `npm install`
- Start Command: `node server.js`

### 2. Install Chrome Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project root folder

### 3. Install Figma Plugin

1. Open **Figma Desktop**
2. Go to `Plugins → Development → Import plugin from manifest`
3. Select `figma-plugin/manifest.json`

### 4. Connect

1. **Figma**: Open the Figpins plugin, copy the 6-digit pairing code
2. **Chrome**: Click the Figpins icon, enter the code, click Connect
3. **Pinterest**: Browse and click "Send" on any image

## 📡 API Endpoints

### Health Check
```
GET /
```

### OAuth Token Exchange
```
POST /api/auth/token
Body: { "code": "authorization_code" }
```

### Token Refresh
```
POST /api/auth/refresh
Body: { "refresh_token": "..." }
```

### Send Pin (API Method)
```
POST /api/send-pin
Body: {
  "roomId": "123456",
  "pinId": "123456789",
  "accessToken": "..."
}
```

### Send Image (Scraping Fallback)
```
POST /send-image-http
Body: {
  "roomId": "123456",
  "url": "https://i.pinimg.com/...",
  "width": 1200,
  "height": 800
}
```

### Room Debug
```
GET /api/rooms/:roomId
```

## 🎨 Features

- **Real-time transfer**: Images appear in Figma instantly
- **Masonry grid**: Auto-arranges images in configurable columns
- **High quality**: Fetches highest resolution available
- **Metadata support**: Includes title and source URL (with API)
- **Session management**: Resume existing grids by selection
- **Dark mode UI**: Modern, futuristic interface

## 📁 Project Structure

```
figpins/
├── manifest.json          # Chrome Extension manifest
├── background.js          # Extension service worker
├── content.js             # Pinterest page injection
├── popup.html/js          # Extension popup UI
├── server/
│   ├── server.js          # Bridge server
│   └── package.json
└── figma-plugin/
    ├── manifest.json      # Figma plugin manifest
    ├── code.js            # Plugin main thread
    └── ui.html            # Plugin UI
```

## 🔐 Pinterest API Setup

1. Go to [Pinterest Developers](https://developers.pinterest.com/)
2. Create a new app
3. Set OAuth redirect URI to your server
4. Request `pins:read` scope
5. Add credentials to server environment variables

## 📄 License

MIT
