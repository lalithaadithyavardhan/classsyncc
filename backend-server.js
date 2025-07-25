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
    console.log('Server initialized with MongoDB connection');
  } catch (error) {
    console.error(' Failed to initialize MongoDB connection:', error);
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

// Import Mongoose and models
const mongoose = require('mongoose');
const User = require('./models/User');
const Timetable = require('./models/Timetable');
const Attendance = require('./models/Attendance');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

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

// --- LOGIN ENDPOINT (SECURE) ---
app.post('/api/login', async (req, res) => {
  const { role, roll, password } = req.body;
  try {
    // Find user by role and rollNumber/facultyId
    let user;
    if (role === 'student') {
      user = await User.findOne({ role, rollNumber: roll });
    } else if (role === 'faculty') {
      user = await User.findOne({ role, facultyId: roll });
    } else if (role === 'admin') {
      user = await User.findOne({ role, rollNumber: roll }); // Admins may use rollNumber
    }
    if (!user) {
      return res.json({ success: false, message: 'User not found.' });
    }
    // Compare password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.json({ success: false, message: 'Invalid credentials.' });
    }
    res.json({
      success: true,
      user: {
        role: user.role,
        name: user.name,
        rollNumber: user.rollNumber,
        facultyId: user.facultyId,
        branch: user.branch,
        year: user.year,
        section: user.section
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// --- STUDENT TIMETABLE ENDPOINT ---
app.get('/api/timetable/student/:studentId', async (req, res) => {
  try {
    const student = await User.findOne({ role: 'student', rollNumber: req.params.studentId });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const timetable = await Timetable.find({
      branch: student.branch,
      year: student.year,
      section: student.section
    });
    res.json({ timetable });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// --- FACULTY TIMETABLE ENDPOINT ---
app.get('/api/timetable/faculty/:facultyId', async (req, res) => {
  try {
    const timetable = await Timetable.find({ facultyId: req.params.facultyId });
    res.json({ timetable });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// --- ADMIN: CREATE USER ---
app.post('/api/admin/users', async (req, res) => {
  try {
    const { role, name, password, rollNumber, facultyId, branch, year, section } = req.body;
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      role,
      name,
      password: hashedPassword,
      rollNumber: role === 'student' ? rollNumber : undefined,
      facultyId: role === 'faculty' ? facultyId : undefined,
      branch: role === 'student' ? branch : undefined,
      year: role === 'student' ? year : undefined,
      section: role === 'student' ? section : undefined
    });
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- ADMIN: UPDATE USER ---
app.put('/api/admin/users/:userId', async (req, res) => {
  try {
    const update = { ...req.body };
    if (update.password) {
      update.password = await bcrypt.hash(update.password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.userId, update, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- ADMIN: ADD TIMETABLE SLOT ---
app.post('/api/admin/timetable', async (req, res) => {
  try {
    const { day, startTime, endTime, subject, room, branch, year, section, facultyId } = req.body;
    const slot = new Timetable({ day, startTime, endTime, subject, room, branch, year, section, facultyId });
    await slot.save();
    res.json({ success: true, slot });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// --- ADMIN: GET ATTENDANCE WITH FILTERS ---
app.get('/api/admin/attendance', async (req, res) => {
  try {
    const { branch, year, section, date } = req.query;
    const filter = {};
    if (branch) filter.branch = branch;
    if (year) filter.year = Number(year);
    if (section) filter.section = section;
    if (date) filter.date = date;
    // Join with Timetable for classId info if needed
    const attendance = await Attendance.find(filter).populate('classId');
    res.json({ attendance });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// --- ADMIN: EXPORT ATTENDANCE TO EXCEL ---
app.get('/api/admin/attendance/export', async (req, res) => {
  try {
    const { branch, year, section, date } = req.query;
    const filter = {};
    if (branch) filter.branch = branch;
    if (year) filter.year = Number(year);
    if (section) filter.section = section;
    if (date) filter.date = date;
    const attendance = await Attendance.find(filter).populate('classId');
    // Prepare data for Excel
    const data = attendance.map(a => ({
      Roll: a.roll,
      Date: a.date,
      Status: a.status,
      Timestamp: a.timestamp,
      Subject: a.classId ? a.classId.subject : '',
      Faculty: a.classId ? a.classId.facultyId : '',
      Room: a.classId ? a.classId.room : ''
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="attendance.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
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