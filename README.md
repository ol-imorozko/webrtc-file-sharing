# P2P File Sharing App

This is a simple peer-to-peer file sharing application built with WebRTC for direct file transfers and Socket.IO for signaling. It enables users to share files over a secure WebRTC connection.

## Features
- Peer-to-peer file transfer using WebRTC.
- Secure HTTPS connection with self-signed certificates (not secure for production).
- Easy-to-use interface for file sharing.

## Prerequisites
- Node.js installed on your machine.

## Setup

### 1. Clone the repository
```bash
git clone https://github.com/ol-imorozko/webrtc-file-sharing.git
cd webrtc-file-sharing
```

### 2. Generate SSL Certificates
For testing purposes, generate self-signed SSL certificates:
```bash
openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365
```
Place `server.key` and `server.cert` in the `server` folder. **Note:** These certificates are insecure for production but sufficient for local testing.

### 3. Install dependencies
```bash
cd server
npm install
```

### 4. Run the server
```bash
node server.js
```

The server will start on `https://localhost:3000`.

### 5. Access the app
Open your browser and navigate to:
```
https://localhost:3000
```
You may need to allow the browser to trust the self-signed certificate.

## File Sharing Instructions
1. **Sender:**
   - Open the app and click **"Select File(s)"** to choose files to share.
   - Share the generated link with the receiver.
2. **Receiver:**
   - Open the shared link in the browser.
   - Accept the file transfer to download the file.

## Notes
- This project uses **self-signed certificates** for HTTPS. This is insecure and should only be used for testing and development.
- For production, use valid SSL certificates from a trusted Certificate Authority (CA).
