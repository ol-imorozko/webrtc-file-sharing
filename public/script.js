const socket = io();

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
selectFileBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
copyLinkBtn.addEventListener('click', copyShareLink);

// Handle file selection
function handleFileSelect(event) {
  const files = event.target.files;
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
}

// Copy share link
function copyShareLink() {
  shareLink.select();
  document.execCommand('copy');
  alert('Link copied to clipboard!');
}

// Create a new room
function createRoom() {
  const newRoomId = Math.random().toString(36).substring(2, 10);
  socket.emit('join', newRoomId);
  shareLinkContainer.hidden = false;
  shareLink.value = `${window.location.origin}?room=${newRoomId}`;
  setupPeerConnection();
}

// Join an existing room
function joinRoom(roomId) {
  socket.emit('join', roomId);
  receiveContainer.hidden = false;
  setupPeerConnection();
}

// Setup PeerConnection and DataChannel
function setupPeerConnection() {
  peerConnection = new RTCPeerConnection();

  // Data Channel for sender
  if (isSender) {
    dataChannel = peerConnection.createDataChannel('fileTransfer');
    dataChannel.binaryType = 'arraybuffer';
    dataChannel.onopen = sendFile;
  } else {
    // Receive Data Channel for receiver
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      dataChannel.binaryType = 'arraybuffer';
      dataChannel.onmessage = receiveMessage;
    };
  }

  // ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', {
        roomId: isSender ? socket.id : roomId,
        candidate: event.candidate,
      });
    }
  };

  // Signaling
  socket.on('signal', async (data) => {
    if (data.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
    if (data.offer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', {
        roomId: data.roomId,
        answer: answer,
      });
    }
    if (data.answer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
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
  reader.onload = (e) => {
    sendChunk();
  };

  function sendChunk() {
    const chunk = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(chunk);
  }

  reader.onloadend = (e) => {
    dataChannel.send(e.target.result);
    offset += e.target.result.byteLength;
    fileProgress.value = (offset / file.size) * 100;

    if (offset < file.size) {
      sendChunk();
    } else {
      dataChannel.send(JSON.stringify({ done: true }));
      progressStatus.textContent = 'File sent!';
    }
  };
}

// Receive messages
function receiveMessage(event) {
  if (typeof event.data === 'string') {
    const message = JSON.parse(event.data);
    if (message.done) {
      const receivedBlob = new Blob(receivedBuffers);
      downloadFile(receivedBlob, message.fileName);
      progressStatus.textContent = 'File received!';
    } else if (message.fileName) {
      fileMetadata = message;
      progressContainer.hidden = false;
      progressStatus.textContent = 'Receiving...';
    }
  } else {
    receivedBuffers.push(event.data);
    const receivedSize = receivedBuffers.reduce((acc, curr) => acc + curr.byteLength, 0);
    fileProgress.value = (receivedSize / fileMetadata.fileSize) * 100;
  }
}

// Download received file
function downloadFile(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
}

// Start the app
if (isSender) {
  // Sender's logic
  console.log('Sender ready');
} else {
  // Receiver's logic
  joinRoom(roomId);
}

