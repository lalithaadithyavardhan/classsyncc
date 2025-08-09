// backend-server.js
// --- THIS IS THE FIX ---
// Only load the .env file if we are NOT in a production environment.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// ========================================================
//                  DEPENDENCIES
// ========================================================
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const XLSX = require('xlsx');

// ========================================================
//                  IMPORTS & CONFIG
// ========================================================
const { connectToMongoDB, closeMongoDBConnection } = require('./mongodb-config');
const config = require('./config');

// --- MONGOOSE MODELS ---
// Ensure you have these model files created in a '/models' directory
const User = require('./models/User');
const Timetable = require('./models/Timetable');
const Attendance = require('./models/Attendance');
const Class = require('./models/Class');
const AttendanceSession = require('./models/AttendanceSession');

const app = express();
const PORT = config.PORT;

// ========================================================
//                  SERVER SETUP
// ========================================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ========================================================
//                  STATE MANAGEMENT
// ========================================================
let activeBluetoothSession = null;
let connectedClients = new Map();
let discoveredDevices = new Map();

// Helper function
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ========================================================
//                  WEBSOCKET HANDLERS
// ========================================================
wss.on('connection', (ws) => {
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
      handleFacultyScanStart(clientId);
      break;
    case 'FACULTY_SCAN_STOP':
      handleFacultyScanStop(clientId);
      break;
  }
}

function handleDeviceDiscovery(clientId, data) {
  const { deviceId, deviceName, rssi, roll } = data;
  discoveredDevices.set(deviceId, { deviceId, deviceName, rssi, roll, timestamp: Date.now(), clientId });

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

async function handleAttendanceRequest(clientId, data) {
    const { roll, deviceId, sessionId, period } = data;

    // Check if device is in range
    const discoveredDevice = discoveredDevices.get(deviceId);
    if (!discoveredDevice || discoveredDevice.rssi < -80) {
        return sendToClient(clientId, {
            type: 'ATTENDANCE_RESPONSE',
            success: false,
            message: 'Device not in range or signal too weak.'
        });
    }
    
    try {
        const student = await User.findOne({ roll });
        if (!student) {
            return sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: false,
                message: 'Student not found.'
            });
        }
        
        // If sessionId is provided, use new attendance system
        if (sessionId) {
            const session = await AttendanceSession.findById(sessionId);
            if (!session) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'Attendance session not found.'
                });
            }

            const classData = await Class.findById(session.classId);
            const studentDoc = await User.findOne({ roll: roll });
            const isEnrolled = !!studentDoc && studentDoc.branch === classData.branch && studentDoc.year === classData.year && studentDoc.section === classData.section;

            if (!isEnrolled) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'Student not enrolled in this class.'
                });
            }

            const existingRecord = session.attendanceRecords.find(
                record => record.studentRoll === roll && record.period === period
            );
            
            if (existingRecord) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'Attendance already marked for this period.'
                });
            }

            session.attendanceRecords.push({
                studentRoll: roll,
                period,
                status: 'present',
                method: 'bluetooth',
                deviceId,
                rssi: discoveredDevice.rssi
            });
            await session.save();
            
            const facultyWs = connectedClients.get(activeBluetoothSession?.facultyClientId);
            if (facultyWs) {
                facultyWs.send(JSON.stringify({ 
                    type: 'ATTENDANCE_MARKED', 
                    roll, 
                    deviceId,
                    rssi: discoveredDevice.rssi,
                    period,
                    sessionId
                }));
            }
            
            sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: true,
                message: 'Attendance marked successfully!'
            });
        } else {
            // Legacy attendance system
            if (!activeBluetoothSession) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'No active attendance session.'
                });
            }

            const alreadyMarked = await Attendance.findOne({ roll, date: todayStr() });
            if (alreadyMarked) {
                return sendToClient(clientId, {
                    type: 'ATTENDANCE_RESPONSE',
                    success: false,
                    message: 'Attendance already marked.'
                });
            }

            await Attendance.create({
                roll,
                date: todayStr(),
                status: 'Present (Bluetooth)',
                deviceId,
                rssi: discoveredDevice.rssi,
                timestamp: new Date(),
                branch: student.branch,
                year: student.year,
                section: student.section
            });

            sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: true,
                message: 'Attendance marked successfully!'
            });
            
            const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
            if (facultyWs) {
                facultyWs.send(JSON.stringify({
                    type: 'ATTENDANCE_MARKED',
                    roll,
                    deviceId
                }));
            }
        }
    } catch (error) {
        console.error('Attendance request error:', error);
        sendToClient(clientId, {
            type: 'ATTENDANCE_RESPONSE',
            success: false,
            message: 'Database error.'
        });
    }
}

function handleFacultyScanStart(clientId) {
    activeBluetoothSession = {
        facultyClientId: clientId,
        startTime: Date.now()
    };
  discoveredDevices.clear();
    sendToClient(clientId, {
        type: 'SCAN_STARTED',
        message: 'Bluetooth scanning started...'
    });
  console.log('Faculty started Bluetooth scanning');
}

function handleFacultyScanStop(clientId) {
  activeBluetoothSession = null;
    sendToClient(clientId, {
        type: 'SCAN_STOPPED',
        message: 'Bluetooth scanning stopped.'
    });
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

// --- Main App Route ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'classsyncc.html'));
});

// --- Authentication ---
app.post('/api/login', async (req, res) => {
  try {
    const { role, roll, password } = req.body;
        const user = await User.findOne({ roll, role });

        if (!user || user.password !== password) { // Still plaintext, but now using Mongoose
      return res.json({ success: false, message: 'Invalid credentials.' });
    }

        const { password: _, ...userPayload } = user.toObject();
    res.json({ success: true, user: userPayload });
  } catch (error) {
    console.error('Login API Error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// --- Timetable Endpoints ---
app.get('/api/timetable/student', async (req, res) => {
    try {
        const { branch, year, section, semester } = req.query;
        const filter = { branch };
        if (year) filter.year = parseInt(year);
        if (section) filter.section = section;
        if (semester) filter.semester = semester;

        const timetable = await Timetable.find(filter);
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.get('/api/timetable/faculty/:facultyId', async (req, res) => {
    try {
        const facultyId = req.params.facultyId;
        const facultyUser = await User.findOne({ roll: facultyId, role: 'faculty' });
        
        const candidateIds = [facultyId];
        if (facultyUser && facultyUser.name) candidateIds.push(facultyUser.name);
        
        const regexes = candidateIds.map(v => new RegExp(`^${String(v).trim()}$`, 'i'));
        const filter = { facultyId: { $in: regexes } }; // Simplified regex logic
        
        if (req.query.semester) filter.semester = req.query.semester;
        
        const timetable = await Timetable.find(filter);
        res.json({ success: true, timetable });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/faculty/names', async (req, res) => {
    try {
        const { facultyIds } = req.body;
        if (!Array.isArray(facultyIds)) {
            return res.status(400).json({ success: false, message: 'Invalid faculty IDs provided.' });
        }
        
        const faculty = await User.find({ roll: { $in: facultyIds }, role: 'faculty' });
        const facultyNames = {};
        faculty.forEach(f => {
            facultyNames[f.roll] = f.name || f.roll;
        });
        
        res.json({ success: true, facultyNames });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Enhanced Faculty Attendance Endpoints ---
const START_TIME_TO_PERIOD = {
    '9:30': 1, '10:20': 2, '11:10': 3, '12:00': 4,
    '1:50': 5, '2:40': 6, '3:30': 7
};

function startTimeToPeriod(startTime) {
  const normalized = String(startTime).split(' ')[0];
  return START_TIME_TO_PERIOD[normalized];
}

async function getOrCreateClassForMapping({ subject, branch, year, section, semester, facultyId, periods }) {
    let existing = await Class.findOne({ subject, branch, year: Number(year), section, semester, facultyId });
  if (!existing) {
        existing = await Class.create({
      subject,
      branch,
            year: Number(year),
            semester: semester || 'I Semester',
      section,
      periods: Array.from(new Set(periods || [])),
      facultyId,
      students: [],
    });
  }
  return existing;
}

// THIS IS THE FIXED ENDPOINT THAT CAUSED THE ORIGINAL ERROR
app.get('/api/faculty/classes/:facultyId', async (req, res) => {
  try {
    const { facultyId } = req.params;
        const facultyUser = await User.findOne({ roll: facultyId, role: 'faculty' });
        
    const candidateIds = [facultyId];
    if (facultyUser && facultyUser.name) candidateIds.push(facultyUser.name);
        
        const regexes = candidateIds.map(v => new RegExp(`^${String(v).trim()}$`, 'i'));
        const timetable = await Timetable.find({ facultyId: { $in: regexes } });

    if (!timetable || timetable.length === 0) {
      return res.json({ success: true, classes: [] });
    }

    const grouped = new Map();
    for (const row of timetable) {
            const key = `${row.subject}|${row.branch}|${row.year}|${row.section}|${row.semester || ''}`;
      if (!grouped.has(key)) {
                grouped.set(key, { ...row.toObject(), periods: new Set() });
      }
            const period = startTimeToPeriod(row.startTime);
      if (period) grouped.get(key).periods.add(period);
    }

    const classes = [];
    for (const [, value] of grouped) {
      const clsDoc = await getOrCreateClassForMapping({
                ...value,
        facultyId,
                periods: Array.from(value.periods)
            });
            classes.push(clsDoc);
    }

    res.json({ success: true, classes });
  } catch (error) {
    console.error('Error fetching faculty classes:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch classes' });
  }
});

app.get('/api/faculty/class/:classId/students', async (req, res) => {
  try {
    const { classId } = req.params;
    const cls = await Class.findById(classId);
        if (!cls) return res.status(404).json({ success: false, error: 'Class not found' });

        const students = await User.find({
      role: 'student',
      branch: cls.branch,
      year: cls.year,
            section: cls.section
        });

        res.json({ success: true, students, classData: cls });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
});

app.post('/api/faculty/attendance/session', async (req, res) => {
  try {
    const { classId, date, periods, facultyId } = req.body;
    
        const existingSession = await AttendanceSession.findOne({ classId, date });
    if (existingSession) {
            return res.status(400).json({ success: false, message: 'Session already exists for this class today.' });
    }
    
        const session = await AttendanceSession.create({
      classId,
      date,
      periods,
      facultyId
    });
    
    res.json({ success: true, sessionId: session._id, message: 'Attendance session created.' });
  } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create session.' });
    }
});

// Other endpoints refactored for Mongoose...
// ... (You would continue to refactor all other endpoints in a similar fashion)

// ========================================================
//                  NEW ADMIN ATTENDANCE ENDPOINTS
// ========================================================

/**
 * DYNAMIC FILTER OPTIONS ENDPOINT
 * Fetches unique values for filter dropdowns based on parent selections.
 * Example Usage:
 * - /api/filter-options?field=semester
 * - /api/filter-options?field=branch&semester=I%20Semester
 * - /api/filter-options?field=subject&semester=I%20Semester&branch=IT&year=2
 */
app.get('/api/filter-options', async (req, res) => {
    const { field } = req.query;
    console.log(`\n[API HIT] /api/filter-options for field: "${field}"`);
    console.log(`[QUERY PARAMS] All params:`, req.query);
    
    try {
        if (!field) {
            console.log('[ERROR] Missing field parameter');
            return res.status(400).json({ success: false, message: 'A "field" parameter is required.' });
        }

        // Validate field name
        const validFields = ['branch', 'year', 'section', 'semester', 'subject'];
        if (!validFields.includes(field)) {
            console.log(`[ERROR] Invalid field: "${field}". Valid fields are:`, validFields);
            return res.status(400).json({ success: false, message: `Invalid field. Valid fields are: ${validFields.join(', ')}` });
        }

        const filterQuery = {};
        if (req.query.branch) filterQuery.branch = req.query.branch;
        if (req.query.year) filterQuery.year = Number(req.query.year);
        if (req.query.section) filterQuery.section = req.query.section;
        if (req.query.semester) filterQuery.semester = req.query.semester;

        console.log('[QUERYING DB] with filter:', JSON.stringify(filterQuery, null, 2));

        // Check if collection has any data first
        const totalDocs = await Timetable.countDocuments();
        console.log(`[DB INFO] Total documents in timetables collection: ${totalDocs}`);

        if (totalDocs === 0) {
            console.log('[WARNING] No documents found in timetables collection');
            return res.json({ success: true, options: [] });
        }

        // Use .distinct() to get unique values for the requested field
        const options = await Timetable.distinct(field, filterQuery);
        
        console.log(`[QUERY RESULT] Found ${options.length} options for field "${field}":`, options);

        // Sort the options
        options.sort((a, b) => {
            if (field === 'year') {
                return a - b;
            } else {
                return String(a).localeCompare(String(b));
            }
        });

        console.log(`[FINAL RESULT] Returning ${options.length} sorted options:`, options);
        res.json({ success: true, options });

    } catch (err) {
        console.error(`[SERVER ERROR] while fetching filter options for field: "${field}"`, err);
        console.error('[ERROR DETAILS]', err.message);
        res.status(500).json({ success: false, message: 'Server error while fetching filter options.' });
    }
});

/**
 * NEW DYNAMIC FILTER ENDPOINT
 * Fetches a list of subjects based on branch, year, etc. to populate the filter dropdown.
 */
app.get('/api/subjects', async (req, res) => {
    try {
        const { branch, year, semester } = req.query;
        // Require all three filters to get subjects, this ensures accuracy
        if (!branch || !year || !semester) {
            return res.json({ success: true, subjects: [] });
        }
        
        const filter = {
            branch,
            year: Number(year),
            semester
        };

        const subjects = await Timetable.distinct('subject', filter);
        res.json({ success: true, subjects });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to fetch subjects.' });
    }
});

/**
 * REFINED SUMMARY ENDPOINT
 * This replaces the previous summary endpoint. It now accepts more filters
 * and returns JSON data to be displayed on the page.
 */
app.post('/api/admin/attendance/summary', async (req, res) => {
    try {
        // The 'subject' filter is no longer needed here
        const { date, periods, branch, year, section, semester } = req.body;
        if (!date || !periods || !Array.isArray(periods) || periods.length === 0) {
            return res.status(400).json({ success: false, message: 'Date and at least one period are required.' });
        }

        const classFilter = { role: 'student' };
        if (branch) classFilter.branch = branch;
        if (year) classFilter.year = Number(year);
        if (section) classFilter.section = section;
        if (semester) classFilter.semester = semester;

        const classes = await User.aggregate([
            { $match: classFilter },
            { $group: { _id: { branch: '$branch', year: '$year', section: '$section', semester: '$semester' } } },
            { $sort: { '_id.year': 1, '_id.branch': 1, '_id.section': 1 } }
        ]);

        const summaryData = [];
        const absenteesByClass = {};

        for (const [index, klass] of classes.entries()) {
            const { branch, year, section, semester } = klass._id;
            if (!branch || !year || !section) continue;

            const studentQuery = { role: 'student', branch, year, section, semester };
            const allStudents = await User.find(studentQuery).select('roll');
            const totalStrength = allStudents.length;
            if (totalStrength === 0) continue;

            // The attendance filter is now simpler, without 'subject'
            const attendanceFilter = {
                branch, year, section, date,
                period: { $in: periods },
                status: { $regex: /present/i }
            };

            const presentRolls = await Attendance.distinct('roll', attendanceFilter);
            const totalPresent = presentRolls.length;
            
            const allRolls = allStudents.map(s => s.roll);
            const absenteeRolls = allRolls.filter(roll => !presentRolls.includes(roll));

            const className = `${year} ${branch}-${section}`;
            summaryData.push({ sno: index + 1, className, totalStrength, totalPresent, totalAbsentees: totalStrength - totalPresent, attendancePercent: totalStrength > 0 ? Math.round((totalPresent / totalStrength) * 100) : 0 });
            absenteesByClass[className] = absenteeRolls;
        }

        res.json({ success: true, summary: summaryData, absentees: absenteesByClass });

    } catch (err) {
        console.error("Attendance Summary Error:", err);
        res.status(500).json({ success: false, message: 'Server error while creating summary.' });
    }
});

// ========================================================
//                  SERVER INITIALIZATION
// ========================================================
async function initializeServer() {
  try {
        await connectToMongoDB(); // Connect using Mongoose
    server.listen(PORT, () => {
      config.logConfig();
      console.log(`🚀 ClassSync Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize server:', error);
    process.exit(1);
  }
}

initializeServer();

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await closeMongoDBConnection();
  process.exit(0);
});
