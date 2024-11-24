const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static('../public'));

// Debug log utility
function logDebug(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG] ${timestamp} - ${message}`);
  if (data) console.log(data);
}

// Socket.IO for signaling
io.on('connection', (socket) => {
  logDebug('User connected', { socketId: socket.id });

  // User creates or joins a room
  socket.on('join', (roomId) => {
    logDebug('User attempting to join room', { socketId: socket.id, roomId });
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('joined', roomId);
    logDebug('User successfully joined room', { socketId: socket.id, roomId });
  });

  // Relay signaling messages
  socket.on('signal', (data) => {
    logDebug('Signal received', { sender: socket.id, roomId: data.roomId, type: Object.keys(data).filter((key) => key !== 'roomId') });
    io.to(data.roomId).emit('signal', data);
    logDebug('Signal relayed to room', { roomId: data.roomId });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    logDebug('User disconnected', { socketId: socket.id, roomId: socket.roomId });
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logDebug(`Server is running on port ${PORT}`);
});

