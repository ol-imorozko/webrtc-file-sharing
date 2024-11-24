const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto'); // For generating secure room IDs
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static('../public'));

// Socket.IO for signaling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // User creates or joins a room
  socket.on('join', (roomId, password) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.password = password;
    socket.emit('joined', roomId);
  });

  // Relay signaling messages
  socket.on('signal', (data) => {
    io.to(data.roomId).emit('signal', data);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
