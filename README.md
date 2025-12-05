# Pinterest to Figma Bridge

A production-ready Chrome Extension + Figma Plugin that allows seamless image transfer from Pinterest to Figma.

## Architecture

- **Chrome Extension**: Adds "Send" buttons to Pinterest images
- **Bridge Server**: Real-time Socket.io server (deploy to Render/Heroku)
- **Figma Plugin**: Receives images and adds them to canvas

## Setup

### 1. Deploy Server

```bash
cd server
npm install
```

Deploy to Render.com or Heroku:
- Build: `npm install`
- Start: `node server.js`

### 2. Install Chrome Extension

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this folder

### 3. Install Figma Plugin

1. Open Figma Desktop
2. Plugins > Development > Import plugin from manifest
3. Select `figma-plugin/manifest.json`

### 4. Configure

1. **Figma Plugin**: Open plugin, copy the 6-digit code
2. **Chrome Extension**: Click icon, enter code, set Server URL (from step 1)
3. **Pinterest**: Browse and click "Send" on images

## Deployment

The server is ready for cloud deployment. Update the Server URL in both Extension and Plugin after deploying.
