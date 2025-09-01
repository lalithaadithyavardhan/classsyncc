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
const bcrypt = require('bcryptjs');
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
const mongoose = require('mongoose');
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
let currentAttendanceSession = null; // Track current faculty attendance session

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
    case 'STUDENT_ATTENDANCE_SIGNAL':
      handleStudentAttendanceSignal(clientId, data);
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
        
        // Check if there's an active faculty attendance session
        if (!currentAttendanceSession) {
            return sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: false,
                message: 'No active attendance session. Please wait for faculty to start.'
            });
        }
        
        // Check if student belongs to the class being marked
        if (student.branch !== currentAttendanceSession.branch || 
            student.year !== currentAttendanceSession.year || 
            student.section !== currentAttendanceSession.section) {
            return sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: false,
                message: 'You are not enrolled in this class.'
            });
        }
        
        // Check if attendance already marked for this session
        const existingRecord = currentAttendanceSession.attendanceRecords.find(
            record => record.roll === roll
        );
        
        if (existingRecord) {
            return sendToClient(clientId, {
                type: 'ATTENDANCE_RESPONSE',
                success: false,
                message: 'Attendance already marked for this session.'
            });
        }
        
        // Add to session attendance records
        const attendanceRecord = {
            roll,
            deviceId,
            rssi: discoveredDevice.rssi,
            timestamp: new Date(),
            period: period || 1 // Default to period 1 if not specified
        };
        
        currentAttendanceSession.attendanceRecords.push(attendanceRecord);
        
        // Also add to discovered devices for faculty view
        discoveredDevices.set(deviceId, {
            deviceId,
            deviceName: 'Student Device',
            rssi: discoveredDevice.rssi,
            roll,
            timestamp: Date.now(),
            clientId
        });
        
        sendToClient(clientId, {
            type: 'ATTENDANCE_RESPONSE',
            success: true,
            message: 'Attendance marked successfully!'
        });
        
        // Notify faculty about new attendance
        if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
            const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
            if (facultyWs) {
                facultyWs.send(JSON.stringify({
                    type: 'ATTENDANCE_MARKED',
                    roll,
                    deviceId,
                    rssi: discoveredDevice.rssi,
                    period: attendanceRecord.period,
                    subject: currentAttendanceSession.subject
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

// Handle student attendance signals - ensures subject-specific attendance
async function handleStudentAttendanceSignal(clientId, data) {
    const { roll, name, deviceId, timestamp, subject } = data;
    
    try {
        // Check if there's an active faculty attendance session
        if (!currentAttendanceSession) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: 'No active attendance session. Please wait for faculty to start.'
            });
        }
        
        // CRITICAL FIX: Check if student is trying to mark attendance for the correct subject
        if (currentAttendanceSession.subject !== subject) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: `Attendance session is for subject: ${currentAttendanceSession.subject}, not ${subject}. Please wait for the correct subject session.`
            });
        }
        
        // Check if student belongs to the class being marked
        const student = await User.findOne({ roll });
        if (!student) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: 'Student not found.'
            });
        }
        
        if (student.branch !== currentAttendanceSession.branch || 
            student.year !== currentAttendanceSession.year || 
            student.section !== currentAttendanceSession.section) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: 'You are not enrolled in this class.'
            });
        }
        
        // Check if attendance already marked for this session
        const existingRecord = currentAttendanceSession.attendanceRecords.find(
            record => record.roll === roll
        );
        
        if (existingRecord) {
            return sendToClient(clientId, {
                type: 'STUDENT_SIGNAL_RESPONSE',
                success: false,
                message: 'Attendance already marked for this session.'
            });
        }
        
        // Add to session attendance records with subject information
        const attendanceRecord = {
            roll,
            name,
            deviceId,
            rssi: -65, // Simulated signal strength
            timestamp: new Date(timestamp),
            period: currentAttendanceSession.periods?.[0] || 1, // Use first selected period
            subject: currentAttendanceSession.subject
        };
        
        currentAttendanceSession.attendanceRecords.push(attendanceRecord);
        
        // Add to discovered devices for faculty view with complete student info
        discoveredDevices.set(deviceId, {
            deviceId,
            deviceName: `Student: ${name}`,
            rssi: -65,
            roll,
            name,
            timestamp: Date.now(),
            clientId,
            subject: currentAttendanceSession.subject
        });
        
        // Send success response to student
        sendToClient(clientId, {
            type: 'STUDENT_SIGNAL_RESPONSE',
            success: true,
            message: `Attendance marked successfully for ${currentAttendanceSession.subject}!`,
            subject: currentAttendanceSession.subject,
            period: attendanceRecord.period
        });
        
        // Notify faculty about new attendance with complete student information
        if (activeBluetoothSession && activeBluetoothSession.facultyClientId) {
            const facultyWs = connectedClients.get(activeBluetoothSession.facultyClientId);
            if (facultyWs) {
                facultyWs.send(JSON.stringify({
                    type: 'ATTENDANCE_MARKED',
                    roll,
                    name,
                    deviceId,
                    rssi: -65,
                    period: attendanceRecord.period,
                    subject: currentAttendanceSession.subject,
                    timestamp: attendanceRecord.timestamp
                }));
            }
        }
        
        console.log(`Student ${roll} (${name}) marked attendance for ${currentAttendanceSession.subject}`);
        
    } catch (error) {
        console.error('Student attendance signal error:', error);
        sendToClient(clientId, {
            type: 'STUDENT_SIGNAL_RESPONSE',
            success: false,
            message: 'Database error processing attendance signal.'
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

// Change password (current simple plaintext approach)
app.put('/api/user/password', async (req, res) => {
  try {
    const { roll, oldPassword, newPassword } = req.body || {};
    if (!roll || !oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'roll, oldPassword, newPassword are required.' });
    }
    const user = await User.findOne({ roll });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (String(user.password) !== String(oldPassword)) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }
    user.password = String(newPassword);
    await user.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Failed to update password.' });
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

// New endpoint for path-based student timetable access
app.get('/api/timetable/student/:branch/:year/:section', async (req, res) => {
    try {
        const { branch, year, section } = req.params;
        const { day, semester } = req.query;
        
        const filter = { 
            branch, 
            year: parseInt(year), 
            section 
        };
        
        if (semester) filter.semester = semester;
        if (day) filter.day = day;

        const timetable = await Timetable.find(filter).sort({ startTime: 1 });
        res.json({ success: true, timetable });
    } catch (err) {
        console.error('Student timetable error:', err);
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

// Add this code to backend-server.js

app.get('/api/faculty/class/:classId/students', async (req, res) => {
  try {
    const { classId } = req.params;
    console.log(`[DEBUG] Received request for classId: ${classId}`); // Log 1

    const cls = await Class.findById(classId).lean();
    if (!cls) {
        console.log('[DEBUG] Class not found in database.'); // Log 2
        return res.status(404).json({ success: false, error: 'Class not found' });
    }

    console.log('[DEBUG] Found Class document:', cls); // Log 3

    const studentQuery = {
      role: 'student',
      branch: cls.branch,
      year: cls.year,
      section: cls.section,
      semester: cls.semester
    };
    
    console.log('[DEBUG] Searching for students with this exact query:', studentQuery); // Log 4

    const students = await User.find(studentQuery);
    
    console.log(`[DEBUG] Found ${students.length} students.`); // Log 5

    res.json({ success: true, students, classData: cls });

  } catch (error) {
    console.error('[DEBUG] Error fetching students:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
});

app.post('/api/faculty/attendance/session', async (req, res) => {
  try {
    const { classId, date, periods, facultyId } = req.body;
    
    // Check if session already exists
    const existingSession = await AttendanceSession.findOne({ classId, date });
    if (existingSession) {
      // Instead of blocking, update the existing session with new periods
      console.log(`Session already exists for class ${classId} on ${date}. Updating existing session.`);
      
      const updatedSession = await AttendanceSession.findByIdAndUpdate(
        existingSession._id,
        { 
          periods,
          facultyId,
          updatedAt: new Date()
        },
        { new: true }
      );
      
      return res.json({ 
        success: true, 
        sessionId: updatedSession._id, 
        message: 'Existing session updated successfully.',
        isUpdated: true
      });
    }
    
    // Create new session if none exists
    const session = await AttendanceSession.create({
      classId,
      date,
      periods,
      facultyId
    });
    
    res.json({ success: true, sessionId: session._id, message: 'New attendance session created.' });
  } catch (error) {
    console.error('Error creating/updating attendance session:', error);
    res.status(500).json({ success: false, message: 'Failed to create/update session.' });
  }
});

// Get attendance records for a specific session
app.get('/api/faculty/attendance/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await AttendanceSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }
    
    // Get attendance records for this session
    const attendanceRecords = await Attendance.find({ sessionId });
    
    res.json({ 
      success: true, 
      session: {
        ...session.toObject(),
        attendanceRecords
      }
    });
    
  } catch (error) {
    console.error('Error fetching attendance session:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance session.' });
  }
});

// Get attendance sessions for a faculty
app.get('/api/faculty/attendance/sessions/:facultyId', async (req, res) => {
  try {
    const { facultyId } = req.params;
    const { date } = req.query;
    const filter = { };
    if (facultyId) filter.facultyId = facultyId;
    if (date) filter.date = date;
    const sessions = await AttendanceSession.find(filter).lean();
    res.json({ success: true, sessions });
  } catch (err) {
    console.error('List sessions error:', err);
    res.status(500).json({ success: false, message: 'Failed to list sessions' });
  }
});

// Get active attendance sessions for students by class and period
app.get('/api/faculty/attendance/sessions', async (req, res) => {
  try {
    const { date, classId, period } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date is required' 
      });
    }
    
    const filter = { date, status: 'active' };
    
    // If classId is provided, find sessions for that specific class
    if (classId) {
      // Find classes that match the classId pattern (branch-year-section)
      const [branch, year, section] = classId.split('-');
      if (branch && year && section) {
        const classes = await Class.find({ branch, year, section }).select('_id');
        const classIds = classes.map(c => c._id);
        filter.classId = { $in: classIds };
      }
    }
    
    // If period is provided, find sessions that include that period
    if (period) {
      filter.periods = parseInt(period);
    }
    
    const sessions = await AttendanceSession.find(filter)
      .populate('classId', 'branch year section')
      .lean();
    
    res.json({ success: true, sessions });
  } catch (err) {
    console.error('List student sessions error:', err);
    res.status(500).json({ success: false, message: 'Failed to list sessions' });
  }
});

// Get student attendance status for a specific date
app.get('/api/student/attendance/status', async (req, res) => {
  try {
    const { roll, date } = req.query;
    
    if (!roll || !date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Roll number and date are required' 
      });
    }
    
    // Find attendance records for this student on this date
    const attendance = await Attendance.findOne({ 
      studentRoll: roll, 
      date: date 
    }).populate('facultyId', 'name');
    
    if (attendance) {
      res.json({
        success: true,
        attendance: {
          ...attendance.toObject(),
          facultyName: attendance.facultyId?.name || 'Unknown Faculty'
        }
      });
    } else {
      res.json({
        success: true,
        attendance: null
      });
    }
    
  } catch (error) {
    console.error('Error fetching student attendance status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch attendance status' 
    });
  }
});

// Get student attendance summary with overall and subject-wise statistics
app.get('/api/student/attendance/summary/:roll', async (req, res) => {
  try {
    const { roll } = req.params;
    
    if (!roll) {
      return res.status(400).json({ 
        success: false, 
        message: 'Roll number is required' 
      });
    }
    
    // Get student information to find their class details
    const student = await User.findOne({ roll, role: 'student' });
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }
    
    const { branch, year, section } = student;
    
    // Get student's timetable to know what subjects they should have
    const timetable = await Timetable.find({ 
      branch, 
      year: parseInt(year), 
      section 
    });
    
    // Get all attendance records for this student
    const attendanceRecords = await Attendance.find({ 
      studentRoll: roll 
    }).sort({ date: -1 });
    
    // Calculate overall statistics
    const totalClasses = attendanceRecords.length;
    const attendedClasses = attendanceRecords.filter(record => 
      record.status && record.status.toLowerCase().includes('present')
    ).length;
    const overallPercentage = totalClasses > 0 ? Math.round((attendedClasses / totalClasses) * 100) : 0;
    
    // Calculate subject-wise statistics
    const subjectWise = {};
    
    // Get unique subjects from timetable
    const subjects = [...new Set(timetable.map(t => t.subject).filter(Boolean))];
    
    // If no subjects found in timetable, still show attendance data
    if (subjects.length === 0) {
      // Show attendance records without subject mapping
      subjectWise['General Attendance'] = {
        attended: attendedClasses,
        total: totalClasses,
        percentage: overallPercentage
      };
      
      res.json({
        success: true,
        overall: {
          attended: attendedClasses,
          total: totalClasses,
          percentage: overallPercentage
        },
        subjectWise,
        message: 'No timetable data found, showing general attendance'
      });
      return;
    }
    
    for (const subject of subjects) {
      // Find attendance records for this specific subject
      const subjectAttendance = attendanceRecords.filter(record => record.subject === subject);
      
      const subjectTotal = subjectAttendance.length;
      const subjectAttended = subjectAttendance.filter(record => 
        record.status && record.status.toLowerCase().includes('present')
      ).length;
      const subjectPercentage = subjectTotal > 0 ? Math.round((subjectAttended / subjectTotal) * 100) : 0;
      
      subjectWise[subject] = {
        attended: subjectAttended,
        total: subjectTotal,
        percentage: subjectPercentage
      };
    }
    
    res.json({
      success: true,
      overall: {
        attended: attendedClasses,
        total: totalClasses,
        percentage: overallPercentage
      },
      subjectWise
    });
    
  } catch (error) {
    console.error('Error fetching student attendance summary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch attendance summary' 
    });
  }
});
// Add this new endpoint to backend-server.js
app.post('/api/faculty/attendance/submit-roster', async (req, res) => {
  try {
      const { classId, date, periods, records } = req.body;
      const cls = await Class.findById(classId);
      if (!cls) return res.status(404).json({ success: false, message: 'Class not found.' });

      const bulkOps = [];
      for (const record of records) {
          for (const period of periods) {
              bulkOps.push({
                  updateOne: {
                      filter: { studentRoll: record.roll, date, period },
                      update: {
                          $set: {
                              studentRoll: record.roll,
                              date,
                              period,
                              status: record.status,
                              subject: cls.subject,
                              branch: cls.branch,
                              year: cls.year,
                              section: cls.section,
                              facultyId: cls.facultyId,
                              method: 'manual_roster'
                          }
                      },
                      upsert: true
                  }
              });
          }
      }

      if (bulkOps.length > 0) {
          await Attendance.bulkWrite(bulkOps);
      }
      
      res.json({ success: true, message: 'Roster submitted.' });
  } catch (error) {
      console.error('Error submitting roster:', error);
      res.status(500).json({ success: false, message: 'Server error.' });
  }
});
// ========================================================
//                  ADMIN TIMETABLE ENDPOINTS
// ========================================================

// Get timetable for admin editing
app.get('/api/admin/timetable', async (req, res) => {
  try {
    const { branch, year, section, semester } = req.query;
    
    console.log('[BACKEND] Admin timetable request:', { branch, year, section, semester });
    
    if (!branch || !year || !section) {
      console.log('[BACKEND] Missing required fields');
      return res.status(400).json({ 
        success: false, 
        message: 'Branch, year, and section are required' 
      });
    }
    
    // Convert year to number and validate
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
      console.log('[BACKEND] Invalid year value:', year);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid year value. Must be between 1 and 4.' 
      });
    }
    
    const filter = { branch, year: yearNum, section };
    console.log('[BACKEND] Semester value:', semester, 'Type:', typeof semester, 'Length:', semester ? semester.length : 'undefined');
    
    if (semester && semester.trim()) {
      filter.semester = semester.trim();
      console.log('[BACKEND] Added semester filter:', semester.trim());
    } else {
      console.log('[BACKEND] No semester filter added - semester is empty or undefined');
    }
    
    console.log('[BACKEND] Final filter:', filter);
    
    const timetable = await Timetable.find(filter).sort({ day: 1, startTime: 1 });
    
    console.log('[BACKEND] Found timetable entries:', timetable.length);
    if (timetable.length > 0) {
      console.log('[BACKEND] Sample entry:', timetable[0]);
    }
    
    res.json({ 
      success: true, 
      timetable 
    });
    
  } catch (error) {
    console.error('Error fetching admin timetable:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch timetable' 
    });
  }
});

// Bulk update timetable for admin
app.post('/api/admin/timetable/bulk-update', async (req, res) => {
  try {
    // Check if database is connected
    if (!mongoose.connection.readyState) {
      console.error('[BACKEND] Database not connected');
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection error. Please try again.' 
      });
    }
    
    // Check if mongoose is available
    if (typeof mongoose === 'undefined') {
      console.error('[BACKEND] Mongoose not available');
      return res.status(500).json({ 
        success: false, 
        message: 'Database system error. Please try again.' 
      });
    }
    
    // Check if Timetable model is available
    if (typeof Timetable === 'undefined') {
      console.error('[BACKEND] Timetable model not available');
      return res.status(500).json({ 
        success: false, 
        message: 'System configuration error. Please contact administrator.' 
      });
    }
    
    // Check if Timetable model has required methods
    if (typeof Timetable.deleteMany !== 'function' || typeof Timetable.insertMany !== 'function') {
      console.error('[BACKEND] Timetable model missing required methods');
      return res.status(500).json({ 
        success: false, 
        message: 'System configuration error. Please contact administrator.' 
      });
    }
    
    const { branch, year, section, semester, updates } = req.body;
    
    console.log('[BACKEND] Timetable update request:', { branch, year, section, semester, updatesCount: updates?.length });
    
    // Check request body size
    const requestSize = JSON.stringify(req.body).length;
    if (requestSize > 1024 * 1024) { // 1MB limit
      console.error('[BACKEND] Request body too large:', requestSize, 'bytes');
      return res.status(400).json({ 
        success: false, 
        message: 'Request data too large. Please reduce the number of timetable entries.' 
      });
    }
    
    // Check if request body is properly formatted
    if (!req.body || typeof req.body !== 'object') {
      console.error('[BACKEND] Invalid request body format');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request format. Please check your data and try again.' 
      });
    }
    
    // Check if request body has required properties
    const requiredProps = ['branch', 'year', 'section', 'updates'];
    const missingProps = requiredProps.filter(prop => !(prop in req.body));
    
    if (missingProps.length > 0) {
      console.error('[BACKEND] Missing required properties:', missingProps);
      return res.status(400).json({ 
        success: false, 
        message: `Missing required properties: ${missingProps.join(', ')}` 
      });
    }
    
    // Check if request body properties have valid values
    const invalidProps = [];
    if (req.body.branch === null || req.body.branch === undefined) invalidProps.push('branch');
    if (req.body.year === null || req.body.year === undefined) invalidProps.push('year');
    if (req.body.section === null || req.body.section === undefined) invalidProps.push('section');
    if (req.body.updates === null || req.body.updates === undefined) invalidProps.push('updates');
    
    if (invalidProps.length > 0) {
      console.error('[BACKEND] Invalid property values:', invalidProps);
      return res.status(400).json({ 
        success: false, 
        message: `Invalid values for properties: ${invalidProps.join(', ')}` 
      });
    }
    
    if (!branch || !year || !section || !updates || !Array.isArray(updates)) {
      console.log('[BACKEND] Validation failed:', { branch, year, section, updates: !!updates, isArray: Array.isArray(updates) });
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request data. Please ensure all required fields are provided.' 
      });
    }
    
    // Additional validation for updates array
    if (updates.length === 0) {
      console.log('[BACKEND] Empty updates array');
      return res.status(400).json({ 
        success: false, 
        message: 'No timetable data provided. Please fill in at least one timetable entry.' 
      });
    }
    
    // Check if updates array contains valid objects
    if (!updates.every(update => update && typeof update === 'object')) {
      console.error('[BACKEND] Invalid update objects in array');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid timetable data format. Please check your input and try again.' 
      });
    }
    
    // Check if updates array objects have required properties
    const requiredUpdateProps = ['subject', 'day', 'startTime', 'facultyId', 'room'];
    const invalidUpdates = updates.filter(update => {
      return !requiredUpdateProps.every(prop => prop in update);
    });
    
    if (invalidUpdates.length > 0) {
      console.error('[BACKEND] Updates missing required properties:', invalidUpdates);
      return res.status(400).json({ 
        success: false, 
        message: 'Some timetable entries are missing required fields. Please check all entries have subject, day, time, faculty ID, and room.' 
      });
    }
    
    // Check if updates array objects have valid property values
    const updatesWithInvalidValues = updates.filter(update => {
      return requiredUpdateProps.some(prop => {
        const value = update[prop];
        return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
      });
    });
    
    if (updatesWithInvalidValues.length > 0) {
      console.error('[BACKEND] Updates with invalid property values:', updatesWithInvalidValues);
      return res.status(400).json({ 
        success: false, 
        message: 'Some timetable entries have empty or invalid values. Please ensure all required fields are properly filled.' 
      });
    }
    
    // Convert year to number and validate
    const yearNum = parseInt(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
      console.log('[BACKEND] Invalid year value:', { year, yearNum });
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid year value. Must be between 1 and 4.' 
      });
    }
    
    // Validate branch and section
    if (!branch.trim() || !section.trim()) {
      console.log('[BACKEND] Invalid branch or section:', { branch, section });
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid branch or section value.' 
      });
    }
    
    // Validate branch and section values against allowed values
    const allowedBranches = ['CSE', 'IT', 'ECE', 'AIML', 'DS', 'EEE', 'MECH', 'CIVIL', 'MCA'];
    const allowedSections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    if (!allowedBranches.includes(branch.trim())) {
      console.log('[BACKEND] Invalid branch value:', branch);
      return res.status(400).json({ 
        success: false, 
        message: `Invalid branch value. Allowed values: ${allowedBranches.join(', ')}` 
      });
    }
    
    if (!allowedSections.includes(section.trim())) {
      console.log('[BACKEND] Invalid section value:', section);
      return res.status(400).json({ 
        success: false, 
        message: `Invalid section value. Allowed values: ${allowedSections.join(', ')}` 
      });
    }
    
    // Validate semester value if provided
    if (semester && semester.trim()) {
      const allowedSemesters = ['1', '2', '3', '4', '5', '6', '7', '8'];
      if (!allowedSemesters.includes(semester.trim())) {
        console.log('[BACKEND] Invalid semester value:', semester);
        return res.status(400).json({ 
          success: false, 
          message: `Invalid semester value. Allowed values: ${allowedSemesters.join(', ')}` 
        });
      }
    }
    
    const filter = { branch: branch.trim(), year: yearNum, section: section.trim() };
    if (semester && semester.trim()) filter.semester = semester.trim();
    
    console.log('[BACKEND] Deleting existing entries with filter:', filter);
    
    // Delete existing timetable entries
    try {
      await Timetable.deleteMany(filter);
      console.log('[BACKEND] Existing entries deleted successfully');
    } catch (deleteError) {
      console.error('[BACKEND] Error deleting existing entries:', deleteError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to clear existing timetable. Please try again.' 
      });
    }
    
    // Validate each update entry
    const validUpdates = updates.filter(update => {
      if (!update.subject || !update.subject.trim()) {
        console.log('[BACKEND] Skipping entry with empty subject:', update);
        return false;
      }
      if (!update.day || !update.startTime) {
        console.log('[BACKEND] Skipping entry with missing day or startTime:', update);
        return false;
      }
      if (!update.facultyId || !update.facultyId.trim()) {
        console.log('[BACKEND] Skipping entry with empty facultyId:', update);
        return false;
      }
      if (!update.room || !update.room.trim()) {
        console.log('[BACKEND] Skipping entry with empty room:', update);
        return false;
      }
      
      // Validate day format (should be capitalized properly)
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayLower = update.day.toLowerCase();
      if (!validDays.includes(dayLower)) {
        console.log('[BACKEND] Skipping entry with invalid day:', update);
        return false;
      }
      
      // Validate time format
      const validTimes = ['9:30', '10:20', '11:10', '12:00', '1:50', '2:40', '3:30'];
      if (!validTimes.includes(update.startTime)) {
        console.log('[BACKEND] Skipping entry with invalid time:', update);
        return false;
      }
      
      // Validate faculty ID format (should not be empty and should be reasonable length)
      if (update.facultyId.length < 2 || update.facultyId.length > 50) {
        console.log('[BACKEND] Skipping entry with invalid faculty ID length:', update);
        return false;
      }
      
      // Validate room format (should not be empty and should be reasonable length)
      if (update.room.length < 1 || update.room.length > 20) {
        console.log('[BACKEND] Skipping entry with invalid room length:', update);
        return false;
      }
      
      return true;
    });
    
    if (validUpdates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid timetable entries found. Please ensure all entries have subject, day, faculty ID, room, and valid day/time format.' 
      });
    }
    
    console.log('[BACKEND] Valid updates count:', validUpdates.length);
    
    // Check if we have a reasonable number of entries (max 7 periods * 6 days = 42)
    if (validUpdates.length > 42) {
      return res.status(400).json({ 
        success: false, 
        message: 'Too many timetable entries. Maximum allowed is 42 entries (7 periods × 6 days).' 
      });
    }
    
    // Check for duplicate entries (same day, time, and subject)
    const duplicateCheck = new Set();
    const duplicates = [];
    
    validUpdates.forEach(update => {
      const key = `${update.day}-${update.startTime}-${update.subject}`;
      if (duplicateCheck.has(key)) {
        duplicates.push(key);
      } else {
        duplicateCheck.add(key);
      }
    });
    
    if (duplicates.length > 0) {
      console.log('[BACKEND] Duplicate entries detected:', duplicates);
      return res.status(400).json({ 
        success: false, 
        message: 'Duplicate timetable entries detected. Please check for duplicate subjects in the same time slot.' 
      });
    }
    
    // Check for conflicting entries (same day and time but different subjects)
    const timeSlotCheck = new Map();
    const conflicts = [];
    
    validUpdates.forEach(update => {
      const timeSlot = `${update.day}-${update.startTime}`;
      if (timeSlotCheck.has(timeSlot)) {
        const existingSubject = timeSlotCheck.get(timeSlot);
        if (existingSubject !== update.subject) {
          conflicts.push(`${update.day} ${update.startTime}: ${existingSubject} vs ${update.subject}`);
        }
      } else {
        timeSlotCheck.set(timeSlot, update.subject);
      }
    });
    
    if (conflicts.length > 0) {
      console.log('[BACKEND] Time slot conflicts detected:', conflicts);
      return res.status(400).json({ 
        success: false, 
        message: 'Time slot conflicts detected. Multiple subjects cannot be scheduled at the same time on the same day.' 
      });
    }
    
    // Insert new entries
    const newEntries = validUpdates.map(update => ({
      ...update,
      branch: branch.trim(),
      year: yearNum,
      section: section.trim(),
      semester: (semester && semester.trim()) ? semester.trim() : null
    }));
    
    // Final validation of new entries
    const finalValidEntries = newEntries.filter(entry => {
      return entry.branch && entry.year && entry.section && entry.subject && entry.day && entry.startTime && entry.facultyId && entry.room;
    });
    
    // Log validation results
    console.log('[BACKEND] Final validation results:', {
      original: newEntries.length,
      final: finalValidEntries.length,
      sample: finalValidEntries[0]
    });
    
    if (finalValidEntries.length !== newEntries.length) {
      console.log('[BACKEND] Some entries failed final validation:', { original: newEntries.length, final: finalValidEntries.length });
      return res.status(400).json({ 
        success: false, 
        message: 'Some timetable entries failed validation. Please check all fields are properly filled.' 
      });
    }
    
    // Additional validation: ensure no empty strings
    const hasEmptyFields = finalValidEntries.some(entry => {
      return Object.values(entry).some(value => 
        value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
      );
    });
    
    if (hasEmptyFields) {
      console.log('[BACKEND] Some entries have empty fields after validation');
      return res.status(400).json({ 
        success: false, 
        message: 'Some timetable entries have empty fields. Please ensure all fields are properly filled.' 
      });
    }
    
    // Additional validation: ensure data types are correct
    const hasInvalidTypes = finalValidEntries.some(entry => {
      return typeof entry.branch !== 'string' || 
             typeof entry.year !== 'number' || 
             typeof entry.section !== 'string' || 
             typeof entry.subject !== 'string' || 
             typeof entry.day !== 'string' || 
             typeof entry.startTime !== 'string' || 
             typeof entry.facultyId !== 'string' || 
             typeof entry.room !== 'string' ||
             (entry.semester !== null && typeof entry.semester !== 'string');
    });
    
    if (hasInvalidTypes) {
      console.log('[BACKEND] Some entries have invalid data types');
      return res.status(400).json({ 
        success: false, 
        message: 'Some timetable entries have invalid data types. Please check your input and try again.' 
      });
    }
    
    console.log('[BACKEND] Inserting new entries:', finalValidEntries.length);
    
    try {
      const result = await Timetable.insertMany(finalValidEntries);
      
      console.log('[BACKEND] Timetable updated successfully:', result.length, 'entries created');
      
      res.json({ 
        success: true, 
        message: `Timetable updated successfully. ${result.length} entries created.`,
        count: result.length
      });
    } catch (dbError) {
      console.error('[BACKEND] Database error during insert:', dbError);
      
      // If insert fails, try to restore the deleted entries (if any existed)
      if (dbError.code === 11000) {
        return res.status(400).json({ 
          success: false, 
          message: 'Duplicate entry detected. Please check for duplicate subjects in the same time slot.' 
        });
      }
      
      // Handle other database errors
      if (dbError.name === 'ValidationError') {
        return res.status(400).json({ 
          success: false, 
          message: 'Data validation error. Please check all fields are properly formatted.' 
        });
      }
      
      if (dbError.name === 'CastError') {
        return res.status(400).json({ 
          success: false, 
          message: 'Data type error. Please check all fields have correct data types.' 
        });
      }
      
          // Handle connection errors
    if (dbError.name === 'MongoNetworkError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection error. Please try again later.' 
      });
    }
    
    // Handle timeout errors
    if (dbError.name === 'MongoTimeoutError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Database operation timed out. Please try again.' 
      });
    }
    
    // Handle server selection errors
    if (dbError.name === 'MongoServerSelectionError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Database server unavailable. Please try again later.' 
      });
    }
      
      throw dbError; // Re-throw to be caught by outer catch block
    }
    
  } catch (error) {
    console.error('Error updating admin timetable:', error);
    
    // Handle specific error types
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Database server error. Please try again later.' 
      });
    }
    
    if (error.name === 'TypeError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Data processing error. Please check your input and try again.' 
      });
    }
    
    if (error.name === 'ReferenceError') {
      return res.status(500).json({ 
        success: false, 
        message: 'System error. Please refresh the page and try again.' 
      });
    }
    
    if (error.name === 'SyntaxError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Data format error. Please check your input and try again.' 
      });
    }
    
    if (error.name === 'RangeError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Data range error. Please check your input values and try again.' 
      });
    }
    
    if (error.name === 'URIError') {
      return res.status(500).json({ 
        success: false, 
        message: 'Data encoding error. Please check your input and try again.' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update timetable. Please try again.' 
    });
  }
});

// ========================================================
//                  ADMIN USER MANAGEMENT
// ========================================================

// Get filter options for admin attendance dashboard
app.get('/api/filter-options', async (req, res) => {
  try {
    const { field, branch, year, section } = req.query;
    
    console.log(`[BACKEND] Filter options request:`, { field, branch, year, section });
    
    let options = [];
    
    switch (field) {
      case 'branch':
        // Get unique branches from users
        options = await User.distinct('branch');
        console.log(`[BACKEND] Found ${options.length} branches:`, options);
        
        // If no branches found in database, provide some default options
        if (options.length === 0) {
          console.log(`[BACKEND] No branches found in database, using default options`);
          options = ['CSE', 'IT', 'ECE', 'AIML', 'DS', 'EEE', 'MECH', 'CIVIL', 'MCA'];
        }
        break;
        
      case 'year':
        // Handle both single values and arrays for branch
        if (!branch || (Array.isArray(branch) && branch.length === 0) || branch === 'All') {
          console.log(`[BACKEND] Year filter - no branch or "All" selected, getting all years`);
          options = await User.distinct('year');
        } else {
          // Handle array of branches
          if (Array.isArray(branch)) {
            options = await User.distinct('year', { branch: { $in: branch } });
          } else {
            // Handle single branch value
            options = await User.distinct('year', { branch });
          }
        }
        console.log(`[BACKEND] Found ${options.length} years:`, options);
        break;
        
      case 'section':
        // Handle both single values and arrays
        let sectionQuery = {};
        if (branch && branch !== 'All') {
          if (Array.isArray(branch)) {
            sectionQuery.branch = { $in: branch };
          } else {
            sectionQuery.branch = branch;
          }
        }
        if (year && year !== 'All') {
          if (Array.isArray(year)) {
            sectionQuery.year = { $in: year.map(y => parseInt(y)) };
          } else {
            sectionQuery.year = parseInt(year);
          }
        }
        
        if (Object.keys(sectionQuery).length === 0) {
          console.log(`[BACKEND] Section filter - no specific filters, getting all sections`);
          options = await User.distinct('section');
        } else {
          options = await User.distinct('section', sectionQuery);
        }
        console.log(`[BACKEND] Found ${options.length} sections with query:`, sectionQuery);
        break;
        
      case 'semester':
        // Handle both single values and arrays
        let semesterQuery = {};
        if (branch && branch !== 'All') {
          if (Array.isArray(branch)) {
            semesterQuery.branch = { $in: branch };
          } else {
            semesterQuery.branch = branch;
          }
        }
        if (year && year !== 'All') {
          if (Array.isArray(year)) {
            semesterQuery.year = { $in: year.map(y => parseInt(y)) };
          } else {
            semesterQuery.year = parseInt(year);
          }
        }
        if (section && section !== 'All') {
          if (Array.isArray(section)) {
            semesterQuery.section = { $in: section };
          } else {
            semesterQuery.section = section;
          }
        }
        
        if (Object.keys(semesterQuery).length === 0) {
          console.log(`[BACKEND] Semester filter - no specific filters, getting all semesters`);
          options = await User.distinct('semester');
        } else {
          options = await User.distinct('semester', semesterQuery);
        }
        console.log(`[BACKEND] Found ${options.length} semesters with query:`, semesterQuery);
        break;
        
      default:
        console.log(`[BACKEND] Invalid field specified: ${field}`);
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid field specified' 
        });
    }
    
    // Filter out null/undefined values and sort
    options = options.filter(option => option != null && option !== '').sort();
    console.log(`[BACKEND] Final filtered options for ${field}:`, options);
    
    res.json({ 
      success: true, 
      options,
      field,
      filters: { branch, year, section }
    });
    
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch filter options' 
    });
  }
});

// Get all users for admin
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users' 
    });
  }
});

// Create new user
app.post('/api/admin/users', async (req, res) => {
  try {
    const { name, email, role, department, roll, password } = req.body;
    
    if (!name || !email || !role || !roll || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { roll }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email or roll number already exists' 
      });
    }
    
    // Create new user
    const user = new User({
      name,
      email,
      role,
      department,
      roll,
      password: await bcrypt.hash(password, 10)
    });
    
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'User created successfully',
      user: { ...user.toObject(), password: undefined }
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create user' 
    });
  }
});

// Update user
app.put('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, role, department, roll, password } = req.body;
    
    if (!name || !email || !role || !roll) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, role, and roll are required' 
      });
    }
    
    const updateData = { name, email, role, department, roll };
    
    // Only update password if provided
    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const user = await User.findByIdAndUpdate(
      userId, 
      updateData, 
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'User updated successfully',
      user
    });
    
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user' 
    });
  }
});

// Delete user
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findByIdAndDelete(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });
    
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user' 
    });
  }
});

// ========================================================
//                  FACULTY ATTENDANCE MARKING
// ========================================================

// Mark student attendance via Bluetooth
app.post('/api/faculty/attendance/mark', async (req, res) => {
  try {
    const { sessionId, studentRoll, deviceId, method, timestamp } = req.body;
    
    if (!sessionId || !studentRoll) {
      return res.status(400).json({ 
        success: false, 
        message: 'Session ID and student roll are required' 
      });
    }
    
    // Get the session to find faculty ID
    const session = await AttendanceSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ 
        success: false, 
        message: 'Attendance session not found' 
      });
    }
    
    // Check if attendance already exists for this student in this session
    const existingAttendance = await Attendance.findOne({ 
      sessionId, 
      studentRoll 
    });
    
    if (existingAttendance) {
      // Update existing attendance
      existingAttendance.status = 'present';
      existingAttendance.method = method || 'bluetooth';
      existingAttendance.timestamp = timestamp || new Date();
      existingAttendance.deviceId = deviceId;
      await existingAttendance.save();
      
      res.json({ 
        success: true, 
        message: 'Attendance updated successfully',
        attendance: existingAttendance
      });
    } else {
      // Create new attendance record
      const attendance = new Attendance({
        sessionId,
        studentRoll,
        facultyId: session.facultyId,
        status: 'present',
        method: method || 'bluetooth',
        timestamp: timestamp || new Date(),
        deviceId: deviceId,
        date: session.date
      });
      
      await attendance.save();
      
      res.json({ 
        success: true, 
        message: 'Attendance marked successfully',
        attendance
      });
    }
    
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark attendance' 
    });
  }
});

// Start faculty attendance session with subject and class info
app.post('/api/faculty/attendance/start-session', async (req, res) => {
  try {
    const { subject, branch, year, section, periods, date, facultyId } = req.body;
    
    if (!subject || !branch || !year || !section || !periods || !date || !facultyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required: subject, branch, year, section, periods, date, facultyId' 
      });
    }
    
    // Clear any existing session
    if (currentAttendanceSession) {
      currentAttendanceSession = null;
    }
    
    // Create new session
    currentAttendanceSession = {
      subject,
      branch,
      year,
      section,
      periods: Array.isArray(periods) ? periods : [periods],
      date,
      facultyId,
      startTime: new Date(),
      discoveredDevices: new Map(),
      attendanceRecords: []
    };
    
    // Clear discovered devices
    discoveredDevices.clear();
    
    res.json({ 
      success: true, 
      message: 'Attendance session started successfully',
      session: currentAttendanceSession
    });
    
  } catch (error) {
    console.error('Error starting attendance session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start attendance session' 
    });
  }
});

// Stop faculty attendance session and get final records
app.post('/api/faculty/attendance/stop-session', async (req, res) => {
  try {
    if (!currentAttendanceSession) {
      return res.status(400).json({ 
        success: false, 
        message: 'No active attendance session' 
      });
    }
    
    // Mark session as paused (not completed yet)
    currentAttendanceSession.endTime = new Date();
    currentAttendanceSession.status = 'paused';
    
    // Get collected attendance records (but don't save yet)
    const records = Array.from(currentAttendanceSession.attendanceRecords.values());
    
    const sessionData = { ...currentAttendanceSession };
    
    res.json({ 
      success: true, 
      message: 'Attendance session stopped successfully',
      session: sessionData,
      records: records,
      totalRecords: records.length
    });
    
  } catch (error) {
    console.error('Error stopping attendance session:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop attendance session' 
    });
  }
});

// Submit attendance records manually
app.post('/api/faculty/attendance/submit', async (req, res) => {
  try {
    if (!currentAttendanceSession) {
      return res.status(400).json({ 
        success: false, 
        message: 'No attendance session to submit' 
      });
    }
    
    // Mark session as completed
    currentAttendanceSession.endTime = new Date();
    currentAttendanceSession.status = 'completed';
    
    // Get final attendance records
    const finalRecords = Array.from(currentAttendanceSession.attendanceRecords.values());
    
    if (finalRecords.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No attendance records to submit' 
      });
    }
    
    // Save attendance records to database
    const savedRecords = [];
    for (const record of finalRecords) {
      try {
        const attendance = await Attendance.create({
          studentRoll: record.roll,
          date: currentAttendanceSession.date,
          status: 'Present (Bluetooth)',
          subject: currentAttendanceSession.subject,
          period: record.period,
          method: 'bluetooth',
          deviceId: record.deviceId,
          rssi: record.rssi,
          timestamp: record.timestamp,
          branch: currentAttendanceSession.branch,
          year: currentAttendanceSession.year,
          section: currentAttendanceSession.section,
          facultyId: currentAttendanceSession.facultyId
        });
        savedRecords.push(attendance);
      } catch (error) {
        console.error('Error saving attendance record:', error);
      }
    }
    
    const sessionData = { ...currentAttendanceSession };
    currentAttendanceSession = null;
    
    res.json({ 
      success: true, 
      message: 'Attendance submitted successfully',
      session: sessionData,
      savedRecords: savedRecords,
      totalRecords: savedRecords.length,
      subject: sessionData.subject,
      date: sessionData.date
    });
    
  } catch (error) {
    console.error('Error submitting attendance:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit attendance' 
    });
  }
});

// Get current attendance session status
app.get('/api/faculty/attendance/session-status', async (req, res) => {
  try {
    if (!currentAttendanceSession) {
      return res.json({ 
        success: true, 
        active: false,
        message: 'No active session' 
      });
    }
    
    const records = Array.from(currentAttendanceSession.attendanceRecords.values());
    
    res.json({ 
      success: true, 
      active: true,
      session: currentAttendanceSession,
      totalRecords: records.length,
      records: records
    });
    
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get session status' 
    });
  }
});

// ========================================================
//                  ADMIN ATTENDANCE ENDPOINTS
// ========================================================

// Get attendance summary for admin
// Replace this entire function in backend-server.js

// Replace this entire function in backend-server.js

// Replace this entire function in backend-server.js

app.post('/api/admin/attendance/summary/excel', async (req, res) => {
  try {
    const { date, fromDate, toDate, periods, branches, years, sections, semesters } = req.body;
    const reportDate = date || new Date().toISOString().split('T')[0];

    // 1. Fetch all necessary data from the database
    const studentQuery = {};
    if (branches && branches.length > 0) studentQuery.branch = { $in: branches };
    if (years && years.length > 0) studentQuery.year = { $in: years.map(y => parseInt(y)) };
    if (sections && sections.length > 0) studentQuery.section = { $in: sections };
    if (semesters && semesters.length > 0) studentQuery.semester = { $in: semesters };
    
    const students = await User.find(studentQuery).select('roll name branch year section semester').lean();
    if (students.length === 0) {
      return res.status(404).json({ message: 'No students found for the selected filters.' });
    }

    const attendanceQuery = { period: { $in: periods } };
    if (date) {
      attendanceQuery.date = date;
    } else if (fromDate && toDate) {
      attendanceQuery.date = { $gte: fromDate, $lte: toDate };
    }
    
    // Get a unique set of students who were present
    const presentStudentRolls = new Set(
      await Attendance.find(attendanceQuery).distinct('studentRoll')
    );

    // 2. Group students by class to process data
    const classGroups = {};
    students.forEach(student => {
      const classKey = `${student.year} ${student.branch}-${student.section}`;
      if (!classGroups[classKey]) {
        classGroups[classKey] = { studentRolls: [] };
      }
      classGroups[classKey].studentRolls.push(student.roll);
    });

    // 3. Prepare the data for the two sections of the Excel report
    const excelData = [];
    const summaryRows = [];
    const absenteeRows = [];
    let grandTotalStrength = 0, grandTotalPresent = 0, grandTotalAbsentees = 0;

    // Add headers for the summary table
    summaryRows.push(['', '', '', '', '', reportDate]); // Date in top-right
    summaryRows.push([]); // Spacer
    summaryRows.push(['S.No.', 'Class', 'Total Strength', 'Total Present', 'No. of Absentees', 'Attendance (%)']);
    
    let sno = 1;
    const sortedClassKeys = Object.keys(classGroups).sort();

    for (const className of sortedClassKeys) {
      const group = classGroups[className];
      const strength = group.studentRolls.length;
      const presentCount = group.studentRolls.filter(roll => presentStudentRolls.has(roll)).length;
      const absentCount = strength - presentCount;
      const percentage = strength > 0 ? Math.round((presentCount / strength) * 100) : 0;

      // Add a row to the main summary table
      summaryRows.push([sno, className, strength, presentCount, absentCount, percentage]);

      // Find the list of absentee roll numbers for this class
      const absentRolls = group.studentRolls.filter(roll => !presentStudentRolls.has(roll));
      if (absentRolls.length > 0) {
        absenteeRows.push(['ABSENTEES ROLL NO :']);
        absenteeRows.push([sno, className, absentRolls.join(',')]);
      }
      
      grandTotalStrength += strength;
      grandTotalPresent += presentCount;
      grandTotalAbsentees += absentCount;
      sno++;
    }

    // Add the final "Total" row to the summary
    const grandTotalPercentage = grandTotalStrength > 0 ? Math.round((grandTotalPresent / grandTotalStrength) * 100) : 0;
    summaryRows.push(['Total', '', grandTotalStrength, grandTotalPresent, grandTotalAbsentees, grandTotalPercentage]);

    // 4. Combine all parts into the final structure for the Excel sheet
    excelData.push(...summaryRows);
    if (absenteeRows.length > 0) {
        excelData.push([]); // Spacer row
        excelData.push([]); // Spacer row
        excelData.push(...absenteeRows);
    }
    
    // 5. Generate and send the Excel file
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);

    // Set column widths for better appearance
    worksheet['!cols'] = [ { wch: 8 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 } ];
    
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Disposition', `attachment; filename="Attendance-Report-${reportDate}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error('[BACKEND] Error generating custom Excel summary:', error);
    res.status(500).json({ message: 'Failed to generate Excel file.' });
  }
});

// Download attendance summary as Excel (Updated for specific format)
// Replace this entire function in backend-server.js

// Add this entire function back into your backend-server.js file

app.post('/api/admin/attendance/summary', async (req, res) => {
  try {
    const { date, fromDate, toDate, periods, branches, years, sections, semesters } = req.body;

    const studentQuery = {};
    if (branches && branches.length > 0) studentQuery.branch = { $in: branches };
    if (years && years.length > 0) studentQuery.year = { $in: years.map(y => parseInt(y)) };
    if (sections && sections.length > 0) studentQuery.section = { $in: sections };
    if (semesters && semesters.length > 0) studentQuery.semester = { $in: semesters };

    const students = await User.find(studentQuery).select('roll name branch year section semester').lean();
    if (students.length === 0) {
      return res.json({ success: true, summary: [], absentees: [] });
    }

    const attendanceQuery = { period: { $in: periods } };
    if (date) {
      attendanceQuery.date = date;
    } else if (fromDate && toDate) {
      attendanceQuery.date = { $gte: fromDate, $lte: toDate };
    }
    
    const presentStudentRolls = new Set(
      await Attendance.find(attendanceQuery).distinct('studentRoll')
    );
    
    const classGroups = {};
    students.forEach(student => {
      const classKey = `${student.branch}-${student.year}-${student.section}-${student.semester}`;
      if (!classGroups[classKey]) {
        classGroups[classKey] = {
          className: `${student.branch} - ${student.year} Year - ${student.section} Sec - Sem ${student.semester}`,
          studentRolls: []
        };
      }
      classGroups[classKey].studentRolls.push(student.roll);
    });

    const summary = [];
    const absentees = [];
    let sno = 1;

    for (const key in classGroups) {
      const group = classGroups[key];
      const totalStrength = group.studentRolls.length;
      const totalPresent = group.studentRolls.filter(roll => presentStudentRolls.has(roll)).length;
      const totalAbsentees = totalStrength - totalPresent;
      const attendancePercent = totalStrength > 0 ? Math.round((totalPresent / totalStrength) * 100) : 0;
      
      summary.push({
        sno: sno++,
        className: group.className,
        totalStrength,
        totalPresent,
        totalAbsentees,
        attendancePercent
      });
      
      group.studentRolls.forEach(roll => {
        if (!presentStudentRolls.has(roll)) {
          const student = students.find(s => s.roll === roll);
          absentees.push({ roll: student.roll, name: student.name, className: group.className });
        }
      });
    }

    res.json({ success: true, summary, absentees });

  } catch (error) {
    console.error('[BACKEND] Error generating admin attendance summary:', error);
    res.status(500).json({ success: false, message: 'Failed to generate attendance summary' });
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
