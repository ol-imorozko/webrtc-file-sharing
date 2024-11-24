const socket = io();

// Debug log utility
function logDebug(message, data = null) {
  console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
  if (data) console.log(data);
}

// Get URL parameters
const params = new URLSearchParams(window.location.search);
const roomId = params.get('room');
const isSender = !roomId;

// Elements
const fileInput = document.getElementById('fileInput');
const selectFileBtn = document.getElementById('selectFileBtn');
const filesList = document.getElementById('filesList');
const shareLinkContainer = document.getElementById('shareLinkContainer');
const shareLink = document.getElementById('shareLink');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const receiveContainer = document.getElementById('receiveContainer');
const progressContainer = document.getElementById('progressContainer');
const progressStatus = document.getElementById('progressStatus');
const fileProgress = document.getElementById('fileProgress');

let peerConnection;
let dataChannel;
let receivedBuffers = [];
let fileMetadata = {};

// Event Listeners
selectFileBtn.addEventListener('click', () => {
  logDebug('Select file button clicked');
  fileInput.click();
});

fileInput.addEventListener('change', handleFileSelect);

copyLinkBtn.addEventListener('click', () => {
  copyShareLink();
  logDebug('Share link copied to clipboard', { shareLink: shareLink.value });
});

// Handle file selection
function handleFileSelect(event) {
  const files = event.target.files;
  logDebug('File(s) selected', { files });
  if (files.length > 0) {
    displaySelectedFiles(files);
    createRoom();
  }
}

// Display selected files
function displaySelectedFiles(files) {
  filesList.innerHTML = '<ul>';
  for (let file of files) {
    filesList.innerHTML += `<li>${file.name} (${file.size} bytes)</li>`;
  }
  filesList.innerHTML += '</ul>';
  logDebug('Selected files displayed');
}

// Copy share link
function copyShareLink() {
  shareLink.select();
  document.execCommand('copy');
  logDebug('Share link copied');
}

// Create a new room
function createRoom() {
  const newRoomId = Math.random().toString(36).substring(2, 10);
  logDebug('Creating new room', { roomId: newRoomId });
  socket.emit('join', newRoomId);
  shareLinkContainer.hidden = false;
  shareLink.value = `${window.location.origin}?room=${newRoomId}`;
  setupPeerConnection();
}

// Join an existing room
function joinRoom(roomId) {
  logDebug('Joining existing room', { roomId });
  socket.emit('join', roomId);
  receiveContainer.hidden = false;
  setupPeerConnection();
}

// Setup PeerConnection and DataChannel
function setupPeerConnection() {
  logDebug('Setting up peer connection');
  peerConnection = new RTCPeerConnection();

  // Data Channel for sender
  if (isSender) {
    dataChannel = peerConnection.createDataChannel('fileTransfer');
    dataChannel.binaryType = 'arraybuffer';
    dataChannel.onopen = () => {
      logDebug('Data channel opened');
      sendFile();
    };
    dataChannel.onclose = () => logDebug('Data channel closed');
  } else {
    // Receive Data Channel for receiver
    peerConnection.ondatachannel = (event) => {
      logDebug('Data channel received', { channel: event.channel.label });
      dataChannel = event.channel;
      dataChannel.binaryType = 'arraybuffer';
      dataChannel.onmessage = receiveMessage;
    };
  }

  // ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      logDebug('ICE candidate generated', { candidate: event.candidate });
      socket.emit('signal', {
        roomId: isSender ? socket.id : roomId,
        candidate: event.candidate,
      });
    }
  };

  // Signaling
  socket.on('signal', async (data) => {
    logDebug('Signal received', { data });
    if (data.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      logDebug('ICE candidate added');
    }
    if (data.offer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', {
        roomId: data.roomId,
        answer: answer,
      });
      logDebug('Answer sent', { answer });
    }
    if (data.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      logDebug('Answer received and set');
    }
  });

  // Create Offer for sender
  if (isSender) {
    peerConnection.createOffer().then((offer) => {
      peerConnection.setLocalDescription(offer);
      socket.emit('signal', {
        roomId: socket.id,
        offer: offer,
      });
      logDebug('Offer created and sent', { offer });
    });
  }
}

// Send file over Data Channel
function sendFile() {
  const file = fileInput.files[0];
  const chunkSize = 16384;
  let offset = 0;

  progressContainer.hidden = false;
  progressStatus.textContent = 'Sending...';

  const reader = new FileReader();

  function sendChunk() {
    const chunk = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(chunk);
  }

  reader.onload = (e) => {
    logDebug('Chunk read', { chunkSize: e.target.result.byteLength });
    dataChannel.send(e.target.result);
    offset += e.target.result.byteLength;
    fileProgress.value = (offset / file.size) * 100;

    if (offset < file.size) {
      sendChunk();
    } else {
      dataChannel.send(JSON.stringify({ done: true }));
      progressStatus.textContent = 'File sent!';
      logDebug('File sent completely');
    }
  };

  sendChunk();
}

// Receive messages
function receiveMessage(event) {
  if (typeof event.data === 'string') {
    const message = JSON.parse(event.data);
    if (message.done) {
      const receivedBlob = new Blob(receivedBuffers);
      downloadFile(receivedBlob, fileMetadata.fileName);
      progressStatus.textContent = 'File received!';
      logDebug('File received completely', { metadata: fileMetadata });
    } else if (message.fileName) {
      fileMetadata = message;
      progressContainer.hidden = false;
      progressStatus.textContent = 'Receiving...';
      logDebug('File metadata received', { fileMetadata });
    }
  } else {
    receivedBuffers.push(event.data);
    const receivedSize = receivedBuffers.reduce((acc, curr) => acc + curr.byteLength, 0);
    fileProgress.value = (receivedSize / fileMetadata.fileSize) * 100;
    logDebug('Chunk received', { receivedSize, totalSize: fileMetadata.fileSize });
  }
}

// Download received file
function downloadFile(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  logDebug('File downloaded', { fileName });
}

// Start the app
if (isSender) {
  logDebug('App started as sender');
} else {
  logDebug('App started as receiver');
  joinRoom(roomId);
}
