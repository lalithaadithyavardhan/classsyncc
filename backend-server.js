// ClassSync Node.js Back-End (Bluetooth-based Attendance)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { 
  connectToMongoDB, 
  insertUser, 
  insertAttendanceRecord, 
  findUserByRoll, 
  getAttendanceByDate,
  closeMongoDBConnection 
} = require('./mongodb-config');
const config = require('./config');
const app = express();
const PORT = config.PORT;

// Create WebSocket server
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

// Initialize MongoDB connection
async function initializeServer() {
  try {
    await connectToMongoDB();
    console.log('🚀 Server initialized with MongoDB connection');
  } catch (error) {
    console.error('❌ Failed to initialize MongoDB connection:', error);
    process.exit(1);
  }
}

// Initialize server on startup
initializeServer();

app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Serve the main integrated application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'classsyncc.html'));
});

// In-memory demo data
const users = [
  { role: 'student', roll: 'S101', password: 'pass', deviceId: 'student-device-001' },
  { role: 'student', roll: 'S102', password: 'pass', deviceId: 'student-device-002' },
  { role: 'student', roll: 'S103', password: 'pass', deviceId: 'student-device-003' },
  { role: 'student', roll: 'S104', password: 'pass', deviceId: 'student-device-004' },
  { role: 'student', roll: 'S105', password: 'pass', deviceId: 'student-device-005' },
  { role: 'faculty', roll: 'F201', password: 'pass', deviceId: 'faculty-device-001' },
  { role: 'admin', roll: 'admin', password: 'admin', deviceId: 'admin-device-001' }
];

let attendanceRecords = [];
let todaySessionActive = false;
let activeBluetoothSession = null;
let connectedClients = new Map(); // WebSocket clients
let discoveredDevices = new Map(); // Bluetooth discovered devices

// Helper: get today date string
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  connectedClients.set(clientId, ws);
  
  console.log(`Client connected: ${clientId}`);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(clientId, data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    connectedClients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

// Handle WebSocket messages
function handleWebSocketMessage(clientId, data) {
  switch (data.type) {
    case 'BLUETOOTH_DEVICE_DISCOVERED':
      handleDeviceDiscovery(clientId, data);
      break;
    case 'ATTENDANCE_REQUEST':
      handleAttendanceRequest(clientId, data);
      break;
    case 'FACULTY_SCAN_START':
      handleFacultyScanStart(clientId, data);
      break;
    case 'FACULTY_SCAN_STOP':
      handleFacultyScanStop(clientId, data);
      break;
  }
}

// Handle Bluetooth device discovery
function handleDeviceDiscovery(clientId, data) {
  const { deviceId, deviceName, rssi, roll } = data;
  
  // Store discovered device
  discoveredDevices.set(deviceId, {
    deviceId,
    deviceName,
    rssi,
    roll,
    timestamp: Date.now(),
    clientId
  });
  
  console.log(`Device discovered: ${deviceName} (${deviceId}) - RSSI: ${rssi}`);
  
  // If faculty is scanning, notify them
  if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
    const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
    if (facultyWs) {
      facultyWs.send(JSON.stringify({
        type: 'DEVICE_FOUND',
        device: { deviceId, deviceName, rssi, roll }
      }));
    }
  }
}

// Handle attendance request from student
async function handleAttendanceRequest(clientId, data) {
  const { roll, deviceId } = data;
  
  if (!todaySessionActive) {
    sendToClient(clientId, {
      type: 'ATTENDANCE_RESPONSE',
      success: false,
      message: 'No active session.'
    });
    return;
  }
  
  // Check if device was discovered by faculty
  const discoveredDevice = discoveredDevices.get(deviceId);
  if (!discoveredDevice) {
    sendToClient(clientId, {
      type: 'ATTENDANCE_RESPONSE',
      success: false,
      message: 'Device not found in classroom range.'
    });
    return;
  }
  
  // Check RSSI strength (signal strength) - must be within reasonable range
  if (discoveredDevice.rssi < -80) { // Adjust threshold as needed
    sendToClient(clientId, {
      type: 'ATTENDANCE_RESPONSE',
      success: false,
      message: 'Signal too weak. Please move closer to faculty device.'
    });
    return;
  }
  
  // Prevent duplicate for today
  const already = attendanceRecords.find(r => r.roll === roll && r.date === todayStr());
  if (already) {
    sendToClient(clientId, {
      type: 'ATTENDANCE_RESPONSE',
      success: false,
      message: 'Attendance already marked for today.'
    });
    return;
  }
  
  // Mark attendance in MongoDB
  try {
    await insertAttendanceRecord({
      roll,
      date: todayStr(),
      status: 'Present (Bluetooth)',
      deviceId,
      rssi: discoveredDevice.rssi,
      timestamp: new Date()
    });
    
    // Also keep in memory for backward compatibility
    attendanceRecords.push({
      roll,
      date: todayStr(),
      status: 'Present (Bluetooth)',
      deviceId,
      rssi: discoveredDevice.rssi,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error saving attendance to MongoDB:', error);
    sendToClient(clientId, {
      type: 'ATTENDANCE_RESPONSE',
      success: false,
      message: 'Database error occurred.'
    });
    return;
  }
  
  sendToClient(clientId, {
    type: 'ATTENDANCE_RESPONSE',
    success: true,
    message: 'Attendance marked successfully!'
  });
  
  // Notify faculty
  if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
    const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
    if (facultyWs) {
      facultyWs.send(JSON.stringify({
        type: 'ATTENDANCE_MARKED',
        roll,
        deviceId
      }));
    }
  }
}

// Handle faculty scan start
function handleFacultyScanStart(clientId, data) {
  activeBluetoothSession = {
    facultyClientId: clientId,
    startTime: Date.now(),
    discoveredDevices: []
  };
  
  // Clear previous discoveries
  discoveredDevices.clear();
  
  sendToClient(clientId, {
    type: 'SCAN_STARTED',
    message: 'Bluetooth scanning started. Waiting for student devices...'
  });
  
  console.log('Faculty started Bluetooth scanning');
}

// Handle faculty scan stop
function handleFacultyScanStop(clientId, data) {
  activeBluetoothSession = null;
  
  sendToClient(clientId, {
    type: 'SCAN_STOPPED',
    message: 'Bluetooth scanning stopped.'
  });
  
  console.log('Faculty stopped Bluetooth scanning');
}

// Send message to specific client
function sendToClient(clientId, message) {
  const ws = connectedClients.get(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Login endpoint
app.post('/api/login', (req, res) => {
  const { role, roll, password } = req.body;
  const user = users.find(u => u.role === role && u.roll === roll && u.password === password);
  if (user) {
    res.json({ 
      success: true, 
      user: {
        role: user.role,
        roll: user.roll,
        deviceId: user.deviceId
      }
    });
  } else {
    res.json({ success: false, message: 'Invalid credentials.' });
  }
});

// Start attendance session (faculty)
app.post('/api/attendance/session', (req, res) => {
  todaySessionActive = true;
  // Optionally clear today's attendance for demo
  attendanceRecords = attendanceRecords.filter(r => r.date !== todayStr());
  res.json({ success: true });
});

// Get today's attendance (faculty)
app.get('/api/attendance/today', (req, res) => {
  const today = todayStr();
  const attendance = attendanceRecords.filter(r => r.date === today);
  res.json({ attendance });
});

// Get student attendance
app.get('/api/attendance/student/:roll', (req, res) => {
  const { roll } = req.params;
  const attendance = attendanceRecords.filter(r => r.roll === roll);
  res.json({ attendance });
});

// Get all attendance (admin)
app.get('/api/attendance/all', (req, res) => {
  res.json({ attendance: attendanceRecords });
});

// Get discovered devices (for faculty)
app.get('/api/bluetooth/devices', (req, res) => {
  const devices = Array.from(discoveredDevices.values());
  res.json({ devices });
});

// Manual attendance (faculty)
app.post('/api/attendance/manual', (req, res) => {
  if (!todaySessionActive) {
    return res.json({ success: false, message: 'No active session.' });
  }
  const { roll } = req.body;
  const already = attendanceRecords.find(r => r.roll === roll && r.date === todayStr());
  if (already) {
    return res.json({ success: false, message: 'Already marked.' });
  }
  attendanceRecords.push({ 
    roll, 
    date: todayStr(), 
    status: 'Present (Manual)', 
    deviceId: 'manual',
    timestamp: Date.now()
  });
  res.json({ success: true });
});

// Start server
server.listen(PORT, () => {
  config.logConfig();
  console.log(`🚀 ClassSync Server running on port ${PORT}`);
  if (config.isProduction()) {
    console.log(`🌐 Deployed at: ${config.BASE_URL}`);
  } else {
    console.log(`📱 Open ${config.BASE_URL} in your browser`);
  }
  console.log('🔗 WebSocket server ready for Bluetooth communication');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await closeMongoDBConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await closeMongoDBConnection();
  process.exit(0);
});