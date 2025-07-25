require('dotenv').config(); // <-- This MUST be the first line to load your .env file on Render

// ClassSync Node.js Back-End (Final Unified Version)
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

// --- Using your existing, excellent MongoDB config ---
const { 
  connectToMongoDB, 
  insertUser, 
  insertAttendanceRecord, 
  findUserByRoll, 
  getAttendanceByDate,
  getCollection,
  COLLECTIONS,
  closeMongoDBConnection,
  // Import the new functions for admin and timetable features
  getUsersByRole,
  insertTimetableEntry,
  findTimetableForStudent,
  findTimetableForFaculty
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


// --- State Management (For live WebSocket sessions) ---
let todaySessionActive = false;
let activeBluetoothSession = null;
let connectedClients = new Map();
let discoveredDevices = new Map();

// Helper
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ========================================================
//                  WebSocket Handlers
// ========================================================

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

function handleDeviceDiscovery(clientId, data) {
  const { deviceId, deviceName, rssi, roll } = data;
  discoveredDevices.set(deviceId, { deviceId, deviceName, rssi, roll, timestamp: Date.now(), clientId });
  console.log(`Device discovered: ${deviceName} (${deviceId}) - RSSI: ${rssi}`);
  
  if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
    const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
    if (facultyWs) {
      facultyWs.send(JSON.stringify({ type: 'DEVICE_FOUND', device: { deviceId, deviceName, rssi, roll } }));
    }
  }
}

async function handleAttendanceRequest(clientId, data) {
  const { roll, deviceId } = data;
  
  if (!todaySessionActive) {
    return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'No active session.' });
  }
  
  const discoveredDevice = discoveredDevices.get(deviceId);
  if (!discoveredDevice) {
    return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Device not found in classroom range.' });
  }
  
  if (discoveredDevice.rssi < -80) {
    return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Signal too weak.' });
  }
  
  try {
    const collection = getCollection(COLLECTIONS.ATTENDANCE);
    const already = await collection.findOne({ roll, date: todayStr() });

    if (already) {
      return sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Attendance already marked for today.' });
    }
    
    await insertAttendanceRecord({
      roll,
      date: todayStr(),
      status: 'Present (Bluetooth)',
      deviceId,
      rssi: discoveredDevice.rssi,
      timestamp: new Date()
    });

    sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: true, message: 'Attendance marked successfully!' });
    
    if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
      const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
      if (facultyWs) {
        facultyWs.send(JSON.stringify({ type: 'ATTENDANCE_MARKED', roll, deviceId }));
      }
    }
  } catch (error) {
    console.error('Error saving attendance to MongoDB:', error);
    sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: false, message: 'Database error occurred.' });
  }
}

function handleFacultyScanStart(clientId, data) {
  activeBluetoothSession = { facultyClientId: clientId, startTime: Date.now(), discoveredDevices: [] };
  discoveredDevices.clear();
  sendToClient(clientId, { type: 'SCAN_STARTED', message: 'Bluetooth scanning started. Waiting for student devices...' });
  console.log('Faculty started Bluetooth scanning');
}

function handleFacultyScanStop(clientId, data) {
  activeBluetoothSession = null;
  sendToClient(clientId, { type: 'SCAN_STOPPED', message: 'Bluetooth scanning stopped.' });
  console.log('Faculty stopped Bluetooth scanning');
}

function sendToClient(clientId, message) {
  const ws = connectedClients.get(clientId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}


// ========================================================
//                  API ENDPOINTS
// ========================================================

// --- User & Auth Endpoints ---
app.post('/api/login', async (req, res) => {
  try {
    const { role, roll, password } = req.body;
    const user = await findUserByRoll(roll);

    if (!user) {
      return res.json({ success: false, message: 'User not found.' });
    }

    // Using plain text password check to match your demo data.
    // In a real app, you would hash passwords and use:
    // const isMatch = await bcrypt.compare(password, user.password);
    const isMatch = (password === user.password); 

    if (isMatch && user.role === role) {
      const userPayload = {
        role: user.role,
        roll: user.roll,
        name: user.name,
        branch: user.branch,
        year: user.year,
        section: user.section
      };
      res.json({ success: true, user: userPayload });
    } else {
      res.json({ success: false, message: 'Invalid credentials.' });
    }
  } catch (error) {
    console.error('Login API Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// --- Timetable Endpoints ---
app.get('/api/timetable/student', async (req, res) => {
    try {
        const { branch, year, section } = req.query; 
        const timetable = await findTimetableForStudent(branch, year, section);
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/timetable/faculty/:facultyId', async (req, res) => {
    try {
        const timetable = await findTimetableForFaculty(req.params.facultyId);
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Attendance Endpoints ---
app.post('/api/attendance/session', (req, res) => {
  todaySessionActive = true;
  res.json({ success: true });
});

app.get('/api/attendance/today', async (req, res) => {
  const today = todayStr();
  const attendance = await getAttendanceByDate(today);
  res.json({ attendance });
});

app.get('/api/attendance/student/:roll', async (req, res) => {
  const { roll } = req.params;
  const collection = getCollection(COLLECTIONS.ATTENDANCE);
  const attendance = await collection.find({ roll }).toArray();
  res.json({ attendance });
});

// --- Admin Endpoints ---
app.post('/api/admin/users', async (req, res) => {
    try {
        const userData = req.body;
        // For a real app, hash the password before inserting
        // userData.password = await bcrypt.hash(userData.password, 10);
        const result = await insertUser(userData);
        res.json({ success: true, userId: result.insertedId });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.post('/api/admin/timetable', async (req, res) => {
    try {
        const result = await insertTimetableEntry(req.body);
        res.json({ success: true, entryId: result.insertedId });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

app.get('/api/admin/attendance', async (req, res) => {
    try {
        const { branch, year, section, date } = req.query;
        const filter = {};
        if (branch) filter.branch = branch;
        if (year) filter.year = Number(year);
        if (section) filter.section = section;
        if (date) filter.date = date;
        
        const collection = getCollection(COLLECTIONS.ATTENDANCE);
        const attendance = await collection.find(filter).toArray();
        res.json({ success: true, attendance });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/admin/attendance/export', async (req, res) => {
    try {
        const collection = getCollection(COLLECTIONS.ATTENDANCE);
        const attendance = await collection.find(req.query).toArray();
        
        const data = attendance.map(a => ({
            'Roll Number': a.roll,
            'Date': a.date,
            'Status': a.status,
            'Timestamp': a.timestamp,
            'Device ID': a.deviceId,
            'Signal (RSSI)': a.rssi
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
        
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Disposition', 'attachment; filename="attendance.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error("Export Error:", err);
        res.status(500).json({ success: false, message: 'Server error during export' });
    }
});

// Start server
server.listen(PORT, () => {
  config.logConfig();
  console.log(`🚀 ClassSync Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await closeMongoDBConnection();
  process.exit(0);
});
