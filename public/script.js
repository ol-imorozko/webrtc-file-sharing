const socket = io();

// Debug log utility
function logDebug(message, data = null) {
  console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`);
  if (data) console.log(data);
}

// Get URL parameters
const params = new URLSearchParams(window.location.search);
let roomId = params.get('room');
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

// Socket event listeners
socket.on('signal', async (data) => {
  logDebug('Signal received', { data });

  // Ensure peerConnection is initialized
  if (!peerConnection) {
    logDebug('PeerConnection not initialized yet. Waiting...');
    return;
  }

  if (data.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      logDebug('ICE candidate added', { candidate: data.candidate });
    } catch (error) {
      logDebug('Error adding ICE candidate', { error });
    }
  }

  if (data.offer) {
    try {
      logDebug('Offer received and setting remote description');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit('signal', {
        roomId: roomId,
        answer: peerConnection.localDescription,
      });
      logDebug('Answer created and sent', { answer: peerConnection.localDescription });
    } catch (error) {
      logDebug('Error handling offer', { error });
    }
  }

  if (data.answer) {
    try {
      logDebug('Answer received and setting remote description');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
      logDebug('Error setting remote description with answer', { error });
    }
  }
});

// Notify the sender when a receiver joins
socket.on('peer-joined', (data) => {
  logDebug('Peer joined', { data });
  if (isSender) {
    // Only the sender needs to handle this event
    setupPeerConnection();
  }
});

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
  roomId = newRoomId; // Assign newRoomId to roomId
  shareLinkContainer.hidden = false;
  shareLink.value = `${window.location.origin}?room=${newRoomId}`;
  // Do not call setupPeerConnection() here
}

// Join an existing room
function joinRoom(roomId) {
  logDebug('Joining existing room', { roomId });
  socket.emit('join', roomId);

  // Update UI for receiver
  receiveContainer.hidden = false;
  progressContainer.hidden = true;
  progressStatus.textContent = 'Waiting for file...';

  // Receiver sets up peer connection immediately
  setupPeerConnection();
}

// Setup PeerConnection and DataChannel
function setupPeerConnection() {
  logDebug('Setting up peer connection');
  peerConnection = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  });

  // Debug: Track connection state
  peerConnection.onconnectionstatechange = () => {
    logDebug('Peer connection state changed', { state: peerConnection.connectionState });
  };

  // Signaling state change
  peerConnection.onsignalingstatechange = () => {
    logDebug('Signaling state changed', { state: peerConnection.signalingState });
  };

  // Data Channel for sender
  if (isSender) {
    dataChannel = peerConnection.createDataChannel('fileTransfer');
    dataChannel.binaryType = 'arraybuffer';
    dataChannel.onopen = () => {
      logDebug('Data channel opened (sender)');
      // Send file metadata first
      sendFileMetadata();
    };
    dataChannel.onmessage = handleSenderMessage;
    dataChannel.onclose = () => logDebug('Data channel closed (sender)');
    dataChannel.onerror = (error) => logDebug('Data channel error (sender)', { error });
  } else {
    // Receive Data Channel for receiver
    peerConnection.ondatachannel = (event) => {
      logDebug('Data channel received', { channelLabel: event.channel.label });
      dataChannel = event.channel;
      dataChannel.binaryType = 'arraybuffer';
      dataChannel.onopen = () => logDebug('Data channel opened (receiver)');
      dataChannel.onmessage = receiveMessage;
      dataChannel.onclose = () => logDebug('Data channel closed (receiver)');
      dataChannel.onerror = (error) => logDebug('Data channel error (receiver)', { error });
    };
  }

  // ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      logDebug('ICE candidate generated', { candidate: event.candidate });
      socket.emit('signal', {
        roomId: roomId,
        candidate: event.candidate,
      });
    }
  };

  // Create Offer for sender
  if (isSender) {
    peerConnection.createOffer().then((offer) => {
      peerConnection.setLocalDescription(offer);
      socket.emit('signal', {
        roomId: roomId,
        offer: offer,
      });
      logDebug('Offer created and sent', { offer });
    }).catch((error) => {
      logDebug('Error creating offer', { error });
    });
  }
}

// Send file metadata
function sendFileMetadata() {
  const file = fileInput.files[0];
  const metadata = { fileName: file.name, fileSize: file.size };
  dataChannel.send(JSON.stringify(metadata));
  logDebug('File metadata sent', metadata);
  progressContainer.hidden = false;
  progressStatus.textContent = 'Waiting for receiver to accept...';
}

// Handle messages received by sender
function handleSenderMessage(event) {
  if (event.data === 'ACCEPT') {
    // Receiver accepted the file transfer
    logDebug('Receiver accepted the file transfer');
    progressStatus.textContent = 'Sending...';
    sendFile(); // Start sending the file
  } else if (event.data === 'DECLINE') {
    // Receiver declined the file transfer
    logDebug('Receiver declined the file transfer');
    progressStatus.textContent = 'File transfer declined by receiver.';
    dataChannel.close();
  } else {
    logDebug('Unknown message received by sender', { data: event.data });
  }
}

// Send file over Data Channel
function sendFile() {
  const file = fileInput.files[0];
  const chunkSize = 16384;
  let offset = 0;

  function sendChunk() {
    const reader = new FileReader();

    reader.onload = (e) => {
      dataChannel.send(e.target.result);
      offset += e.target.result.byteLength;
      fileProgress.value = (offset / file.size) * 100;

      if (offset < file.size) {
        sendChunk();
      } else {
        // Signal end of file transfer
        dataChannel.send(JSON.stringify({ done: true }));
        progressStatus.textContent = 'File sent!';
        logDebug('File sent completely');
      }
    };

    reader.onerror = (error) => {
      logDebug('Error reading file', { error });
    };

    const chunk = file.slice(offset, offset + chunkSize);
    reader.readAsArrayBuffer(chunk);
  }

  sendChunk();
}

// Receive messages
function receiveMessage(event) {
  if (typeof event.data === 'string') {
    try {
      const message = JSON.parse(event.data);
      if (message.done) {
        const receivedBlob = new Blob(receivedBuffers);
        downloadFile(receivedBlob, fileMetadata.fileName);
        progressStatus.textContent = 'File received!';
        logDebug('File received completely', { metadata: fileMetadata });
      } else if (message.fileName) {
        // File metadata received
        fileMetadata = message;
        logDebug('File metadata received', { fileMetadata });

        // Prompt user to accept or decline the file
        promptFileAcceptance();
      } else {
        logDebug('Unknown JSON message received', { message });
      }
    } catch (e) {
      // Handle control messages
      if (event.data === 'ACCEPT' || event.data === 'DECLINE') {
        // Should not happen, but log it
        logDebug('Control message received on receiver', { data: event.data });
      } else {
        logDebug('Unknown string message received', { data: event.data });
      }
    }
  } else {
    // Binary data received
    receivedBuffers.push(event.data);
    const receivedSize = receivedBuffers.reduce((acc, curr) => acc + curr.byteLength, 0);
    fileProgress.value = (receivedSize / fileMetadata.fileSize) * 100;
    logDebug('Chunk received', { receivedSize, totalSize: fileMetadata.fileSize });
  }
}

// Prompt the user for file acceptance
function promptFileAcceptance() {
  // Update UI to show file details
  progressContainer.hidden = false;
  progressStatus.textContent = `Incoming file: ${fileMetadata.fileName} (${fileMetadata.fileSize} bytes)`;

  // Display accept/decline buttons
  const acceptBtn = document.createElement('button');
  acceptBtn.id = 'acceptBtn';
  acceptBtn.textContent = 'Accept';
  const declineBtn = document.createElement('button');
  declineBtn.id = 'declineBtn';
  declineBtn.textContent = 'Decline';

  // Append buttons to the progress container
  progressContainer.appendChild(acceptBtn);
  progressContainer.appendChild(declineBtn);

  // Handle button clicks
  acceptBtn.addEventListener('click', () => {
    dataChannel.send('ACCEPT');
    logDebug('User accepted file transfer');
    // Remove buttons
    acceptBtn.remove();
    declineBtn.remove();
    progressStatus.textContent = 'Receiving file...';
  });

  declineBtn.addEventListener('click', () => {
    dataChannel.send('DECLINE');
    logDebug('User declined file transfer');
    progressStatus.textContent = 'File transfer declined.';
    // Remove buttons and close data channel
    acceptBtn.remove();
    declineBtn.remove();
    dataChannel.close();
  });
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
  // Sender will wait for receiver to join before setting up peer connection
} else {
  logDebug('App started as receiver');
  joinRoom(roomId);
}

