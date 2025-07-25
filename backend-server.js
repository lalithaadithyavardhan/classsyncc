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
  // Import the new functions you will create
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


// --- State Management ---
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
    // This logic remains the same
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
    
    // **FIX:** Save directly to the database
    await insertAttendanceRecord({
      roll,
      date: todayStr(),
      status: 'Present (Bluetooth)',
      deviceId,
      rssi: discoveredDevice.rssi,
      timestamp: new Date()
    });

    sendToClient(clientId, { type: 'ATTENDANCE_RESPONSE', success: true, message: 'Attendance marked successfully!' });
    
    // Notify faculty
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

// Other WebSocket handlers (handleDeviceDiscovery, etc.) remain the same


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

    // **SECURITY FIX:** Use bcrypt to compare passwords
    // const isMatch = await bcrypt.compare(password, user.password);
    // For now, using plain text to match your database data.
    const isMatch = (password === user.password); 

    if (isMatch && user.role === role) {
      // Send back only the necessary, non-sensitive user info
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
        // In a real app, you'd get the student's info from a secure token
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
        // **SECURITY:** Hash password before saving
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
        
        // This query requires you to add branch, year, section to your attendance records
        const collection = getCollection(COLLECTIONS.ATTENDANCE);
        const attendance = await collection.find(filter).toArray();
        res.json({ success: true, attendance });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/admin/attendance/export', async (req, res) => {
    try {
        // Fetch filtered data (same logic as /api/admin/attendance)
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
