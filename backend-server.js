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
const mongoose = require('mongoose'); // Added for database connection check

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
      // Find attendance records for this subject by matching dates with timetable
      const subjectAttendance = attendanceRecords.filter(record => {
        // Find timetable entries for this subject
        const subjectTimetableEntries = timetable.filter(t => t.subject === subject);
        
        // Check if the attendance date matches any of the subject's timetable dates
        return subjectTimetableEntries.some(timetableEntry => {
          // For now, we'll consider all attendance records as potentially related to this subject
          // In a more sophisticated system, you might want to link attendance to specific subjects via session IDs
          return true;
        });
      });
      
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

// ========================================================
//                  ADMIN TIMETABLE ENDPOINTS
// ========================================================

// Get timetable for admin editing
app.get('/api/admin/timetable', async (req, res) => {
  try {
    const { branch, year, section, semester } = req.query;
    
    if (!branch || !year || !section) {
      return res.status(400).json({ 
        success: false, 
        message: 'Branch, year, and section are required' 
      });
    }
    
    const filter = { branch, year, section };
    if (semester) filter.semester = semester;
    
    const timetable = await Timetable.find(filter).sort({ day: 1, startTime: 1 });
    
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
    const { branch, year, section, semester, updates } = req.body;
    
    if (!branch || !year || !section || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request data' 
      });
    }
    
    const filter = { branch, year, section };
    if (semester) filter.semester = semester;
    
    // Delete existing timetable entries
    await Timetable.deleteMany(filter);
    
    // Insert new entries
    const newEntries = updates.map(update => ({
      ...update,
      branch,
      year,
      section,
      semester: semester || null
    }));
    
    const result = await Timetable.insertMany(newEntries);
    
    res.json({ 
      success: true, 
      message: `Timetable updated successfully. ${result.length} entries created.`,
      count: result.length
    });
    
  } catch (error) {
    console.error('Error updating admin timetable:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update timetable' 
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

// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  console.log('🧪 [BACKEND] Test endpoint hit');
  res.json({ 
    success: true, 
    message: 'Server is working',
    timestamp: new Date().toISOString(),
    models: {
      Attendance: !!Attendance,
      Class: !!Class,
      User: !!User
    }
  });
});

// Mark student attendance via Bluetooth
app.post('/api/attendance/mark', async (req, res) => {
  try {
    console.log('🚀 [BACKEND] Attendance submission request received');
    console.log('📋 [BACKEND] Request body:', JSON.stringify(req.body, null, 2));
    
    // Check if Attendance model is available
    if (!Attendance) {
      console.error('💥 [BACKEND] Attendance model is not available');
      return res.status(500).json({ 
        success: false, 
        message: 'Attendance model not available' 
      });
    }
    
    // Check if Class model is available
    if (!Class) {
      console.error('💥 [BACKEND] Class model is not available');
      return res.status(500).json({ 
        success: false, 
        message: 'Class model not available' 
      });
    }
    
    console.log('✅ [BACKEND] Models are available');
    
    // Check database connection
    try {
      const dbState = mongoose.connection.readyState;
      console.log('🔌 [BACKEND] Database connection state:', dbState);
      if (dbState !== 1) {
        console.error('💥 [BACKEND] Database not connected. State:', dbState);
        return res.status(500).json({ 
          success: false, 
          message: 'Database connection not available' 
        });
      }
      console.log('✅ [BACKEND] Database is connected');
    } catch (dbError) {
      console.error('💥 [BACKEND] Error checking database connection:', dbError);
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection error' 
      });
    }
    
    const { roster, classId, date, periods, facultyId } = req.body;
    
    // CRITICAL: Log the exact data received
    console.log('🔍 [BACKEND] EXACT DATA RECEIVED:');
    console.log('   - roster type:', typeof roster, 'isArray:', Array.isArray(roster), 'length:', roster?.length);
    console.log('   - classId:', classId, 'type:', typeof classId);
    console.log('   - date:', date, 'type:', typeof date);
    console.log('   - periods:', periods, 'type:', typeof periods, 'isArray:', Array.isArray(periods));
    console.log('   - facultyId:', facultyId, 'type:', typeof facultyId);
    
    // Validate required fields
    if (!roster || !Array.isArray(roster) || roster.length === 0) {
      console.log('❌ [BACKEND] Invalid roster data:', { roster, isArray: Array.isArray(roster), length: roster?.length });
      return res.status(400).json({ 
        success: false, 
        message: 'Attendance roster is required and must be an array' 
      });
    }
    
    if (!classId || !date || !periods) {
      console.log('❌ [BACKEND] Missing required fields:', { classId, date, periods });
      return res.status(400).json({ 
        success: false, 
        message: 'Class ID, date, and periods are required' 
      });
    }

    // Validate periods array
    if (!Array.isArray(periods) || periods.length === 0) {
      console.log('❌ [BACKEND] Invalid periods data:', { periods, isArray: Array.isArray(periods), length: periods?.length });
      return res.status(400).json({ 
        success: false, 
        message: 'Periods must be an array with at least one period' 
      });
    }

    console.log('✅ [BACKEND] Basic validation passed');
    console.log(`📊 [BACKEND] Processing ${roster.length} student records`);
    console.log(`🏫 [BACKEND] Class ID: ${classId}`);
    console.log(`📅 [BACKEND] Date: ${date}`);
    console.log(`⏰ [BACKEND] Periods: ${JSON.stringify(periods)}`);
    
    // Get class information
    console.log('🔍 [BACKEND] Fetching class information...');
    let classInfo;
    try {
      classInfo = await Class.findById(classId);
      if (!classInfo) {
        console.log('❌ [BACKEND] Class not found for ID:', classId);
        return res.status(404).json({ 
          success: false, 
          message: 'Class not found' 
        });
      }
    } catch (classError) {
      console.error('💥 [BACKEND] Error fetching class:', classError);
      return res.status(500).json({ 
        success: false, 
        message: 'Error fetching class information' 
      });
    }
    
    console.log('✅ [BACKEND] Class found:', {
      subject: classInfo.subject,
      branch: classInfo.branch,
      year: classInfo.year,
      section: classInfo.section
    });

    // Get faculty ID from the request body
    const actualFacultyId = facultyId || 'F101';
    console.log('👨‍🏫 [BACKEND] Faculty ID:', actualFacultyId);
    
    const allAttendanceRecords = [];
    const errors = [];
    let totalRecordsCreated = 0;

    console.log('🔄 [BACKEND] Starting to process student records...');
    console.log(`📊 [BACKEND] Expected total records: ${roster.length} students × ${periods.length} periods = ${roster.length * periods.length}`);

    // Process each student in the roster
    for (let i = 0; i < roster.length; i++) {
        const studentRecord = roster[i];
        
        console.log(`\n📝 [BACKEND] Processing student ${i + 1}/${roster.length}:`, {
            studentId: studentRecord.studentId,
            studentName: studentRecord.studentName,
            status: studentRecord.status
        });
        
        // Validate student record structure
        if (!studentRecord || typeof studentRecord !== 'object') {
            console.error(`🚨 [BACKEND] Invalid student record at index ${i}:`, studentRecord);
            errors.push(`Invalid student record at index ${i}`);
            continue;
        }
        
        if (!studentRecord.studentId || !studentRecord.status) {
            const errorMsg = `Invalid record for student: ${studentRecord.studentName || studentRecord.studentId}`;
            console.log('❌ [BACKEND]', errorMsg);
            errors.push(errorMsg);
            continue;
        }
        
        try {
            const { studentId, studentName, status, timestamp } = studentRecord;
            
            // Process each period for this student
            for (const periodNum of periods) {
                try {
                    console.log(`🔍 [BACKEND] Processing ${studentId} for period ${periodNum}`);
                    
                    // Check if attendance already exists for this student on this date and period
                    const existingAttendance = await Attendance.findOne({ 
                        studentRoll: studentId,
                        date: date,
                        period: periodNum,
                        subject: classInfo.subject
                    });
                    
                    if (existingAttendance) {
                        console.log(`✅ [BACKEND] Found existing attendance for ${studentId}, period ${periodNum}, updating...`);
                        // Update existing attendance
                        existingAttendance.status = status === 'Present' ? 'Present (Bluetooth)' : 'Absent';
                        existingAttendance.timestamp = timestamp || new Date();
                        existingAttendance.method = status === 'Present' ? 'bluetooth' : 'manual';
                        existingAttendance.deviceId = status === 'Present' ? 'faculty-override' : null;
                        existingAttendance.rssi = status === 'Present' ? -50 : null;
                        existingAttendance.period = parseInt(periodNum) || 1; // Ensure period is always a number
                        
                        await existingAttendance.save();
                        allAttendanceRecords.push(existingAttendance);
                        totalRecordsCreated++;
                        console.log(`✅ [BACKEND] Successfully updated attendance for ${studentId}, period ${periodNum}`);
                    } else {
                        console.log(`🆕 [BACKEND] Creating new attendance record for ${studentId}, period ${periodNum}...`);
                        // Create new attendance record
                        const attendanceData = {
                            studentRoll: studentId,
                            studentName: studentName,
                            date: date,
                            status: status === 'Present' ? 'Present (Bluetooth)' : 'Absent',
                            subject: classInfo.subject,
                            period: parseInt(periodNum) || 1, // Ensure period is always a number
                            method: status === 'Present' ? 'bluetooth' : 'manual',
                            deviceId: status === 'Present' ? 'faculty-override' : null,
                            rssi: status === 'Present' ? -50 : null,
                            timestamp: timestamp || new Date(),
                            branch: classInfo.branch,
                            year: classInfo.year,
                            section: classInfo.section,
                            facultyId: actualFacultyId
                        };
                        
                        console.log('📋 [BACKEND] Attendance data to save:', attendanceData);
                        
                        try {
                            const attendance = new Attendance(attendanceData);
                            const savedAttendance = await attendance.save();
                            console.log('💾 [BACKEND] Attendance saved to database:', savedAttendance._id);
                            
                            allAttendanceRecords.push(savedAttendance);
                            totalRecordsCreated++;
                            console.log(`✅ [BACKEND] Successfully created attendance for ${studentId}, period ${periodNum}`);
                        } catch (saveError) {
                            console.error(`💥 [BACKEND] Error saving attendance for ${studentId}, period ${periodNum}:`, saveError);
                            console.error(`💥 [BACKEND] Save error details:`, {
                                message: saveError.message,
                                code: saveError.code,
                                name: saveError.name,
                                attendanceData: attendanceData
                            });
                            
                            // Handle duplicate key errors specifically
                            if (saveError.code === 11000) {
                                console.log(`🔄 [BACKEND] Duplicate key error for ${studentId}, period ${periodNum} - trying to update existing record`);
                                try {
                                    // Try to find and update the existing record
                                    const existingRecord = await Attendance.findOneAndUpdate(
                                        { 
                                            studentRoll: studentId, 
                                            date: date, 
                                            period: periodNum 
                                        },
                                        {
                                            status: status === 'Present' ? 'Present (Bluetooth)' : 'Absent',
                                            timestamp: timestamp || new Date(),
                                            method: status === 'Present' ? 'bluetooth' : 'manual',
                                            deviceId: status === 'Present' ? 'faculty-override' : null,
                                            rssi: status === 'Present' ? -50 : null,
                                            studentName: studentName,
                                            subject: classInfo.subject,
                                            branch: classInfo.branch,
                                            year: classInfo.year,
                                            section: classInfo.section,
                                            facultyId: actualFacultyId
                                        },
                                        { new: true, upsert: false }
                                    );
                                    
                                    if (existingRecord) {
                                        console.log(`✅ [BACKEND] Successfully updated existing record for ${studentId}, period ${periodNum}`);
                                        allAttendanceRecords.push(existingRecord);
                                        totalRecordsCreated++;
                                    } else {
                                        console.log(`❌ [BACKEND] Could not find existing record to update for ${studentId}, period ${periodNum}`);
                                        errors.push(`Failed to save attendance for ${studentName || studentId}, period ${periodNum}: Record exists but could not be updated`);
                                    }
                                } catch (updateError) {
                                    console.error(`💥 [BACKEND] Error updating existing record for ${studentId}, period ${periodNum}:`, updateError);
                                    errors.push(`Failed to save attendance for ${studentName || studentId}, period ${periodNum}: ${updateError.message}`);
                                }
                            } else {
                                errors.push(`Failed to save attendance for ${studentName || studentId}, period ${periodNum}: ${saveError.message}`);
                            }
                        }
                    }
                } catch (periodError) {
                    console.error(`❌ [BACKEND] Error processing period ${periodNum} for student ${studentId}:`, periodError);
                    errors.push(`Failed to save attendance for ${studentName || studentId}, period ${periodNum}: ${periodError.message}`);
                }
            }
            
            console.log(`📊 [BACKEND] Student ${studentId} processed: ${periods.length} attendance records created/updated`);
            
        } catch (error) {
            console.error(`❌ [BACKEND] Error processing attendance for student ${studentRecord.studentId}:`, error);
            errors.push(`Failed to save attendance for ${studentRecord.studentName || studentRecord.studentId}: ${error.message}`);
        }
    }

    console.log(`\n📊 [BACKEND] Processing complete. Results:`);
    console.log(`   ✅ Successfully saved: ${allAttendanceRecords.length} records`);
    console.log(`   ❌ Errors: ${errors.length}`);
    console.log(`   📝 Total processed: ${roster.length} students`);
    console.log(`   📊 Total records created: ${totalRecordsCreated}`);
    console.log(`   📅 Expected records: ${roster.length * periods.length} (students × periods)`);

    if (allAttendanceRecords.length === 0) {
      console.log('❌ [BACKEND] No records were saved successfully');
      console.log('🚨 [BACKEND] CRITICAL: This means the loop is not processing students correctly!');
      console.log('🚨 [BACKEND] Loop ran but no records were created. Check the individual student processing logs above.');
      return res.status(400).json({ 
        success: false, 
        message: 'No attendance records were saved successfully',
        errors: errors,
        processedCount: roster.length,
        totalRecordsCreated: totalRecordsCreated,
        expectedCount: roster.length * periods.length,
        debugInfo: {
          rosterLength: roster.length,
          periodsLength: periods.length,
          classId: classId,
          date: date,
          facultyId: actualFacultyId
        }
      });
    }

    const response = {
      success: true, 
      message: `Attendance submitted successfully. ${allAttendanceRecords.length} records saved.`,
      totalRecords: allAttendanceRecords.length,
      savedRecords: allAttendanceRecords,
      errors: errors.length > 0 ? errors : null,
      subject: classInfo.subject,
      date: date,
      processedCount: roster.length,
      expectedCount: roster.length * periods.length
    };

    console.log('✅ [BACKEND] Sending success response:', response);
    res.json(response);
    
  } catch (error) {
    console.error('💥 [BACKEND] Critical error in attendance submission:', error);
    console.error('💥 [BACKEND] Error details:', {
      message: error.message,
      stack: error.stack,
      requestBody: req.body
    });
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit attendance roster',
      error: error.message
    });
  }
});

// Test endpoint to verify Attendance model and database
app.post('/api/test-attendance', async (req, res) => {
  try {
    console.log('🧪 [BACKEND] Testing Attendance model and database...');
    
    // Check if Attendance model is available
    if (!Attendance) {
      console.error('💥 [BACKEND] Attendance model is not available');
      return res.status(500).json({ 
        success: false, 
        message: 'Attendance model not available' 
      });
    }
    
    // Check database connection
    const dbState = mongoose.connection.readyState;
    console.log('🔌 [BACKEND] Database connection state:', dbState);
    if (dbState !== 1) {
      console.error('💥 [BACKEND] Database not connected. State:', dbState);
      return res.status(500).json({ 
        success: false, 
        message: 'Database connection not available' 
      });
    }
    
    // Try to create a test attendance record
    const testAttendance = new Attendance({
      studentRoll: 'TEST-001',
      studentName: 'Test Student',
      date: '2025-08-28',
      status: 'Present (Test)',
      subject: 'Test Subject',
      period: 1,
      method: 'test',
      timestamp: new Date(),
      branch: 'TEST',
      year: 1,
      section: 'A',
      facultyId: 'TEST-FACULTY'
    });
    
    console.log('📝 [BACKEND] Test attendance model created');
    
    const savedTest = await testAttendance.save();
    console.log('💾 [BACKEND] Test attendance saved:', savedTest._id);
    
    // Clean up - delete the test record
    await Attendance.findByIdAndDelete(savedTest._id);
    console.log('🧹 [BACKEND] Test attendance cleaned up');
    
    res.json({ 
      success: true, 
      message: 'Attendance model and database are working correctly',
      testId: savedTest._id,
      dbState: dbState
    });
    
  } catch (error) {
    console.error('💥 [BACKEND] Test failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Test failed: ' + error.message,
      error: error.message
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
app.post('/api/admin/attendance/summary', async (req, res) => {
  try {
    const { date, fromDate, toDate, periods, branch, year, section, semester, branches, years, sections, semesters } = req.body;
    
    console.log('[BACKEND] Admin attendance summary request:', req.body);
    
    // Build query based on provided filters
    const query = {};
    
    // Handle both single values (backwards compatibility) and arrays (new checkbox system)
    if (branches && Array.isArray(branches) && branches.length > 0) {
      query.branch = { $in: branches };
    } else if (branch && branch !== 'All') {
      query.branch = branch;
    }
    
    if (years && Array.isArray(years) && years.length > 0) {
      query.year = { $in: years.map(y => parseInt(y)) };
    } else if (year && year !== 'All') {
      query.year = parseInt(year);
    }
    
    if (sections && Array.isArray(sections) && sections.length > 0) {
      query.section = { $in: sections };
    } else if (section && section !== 'All') {
      query.section = section;
    }
    
    if (semesters && Array.isArray(semesters) && semesters.length > 0) {
      query.semester = { $in: semesters };
    } else if (semester && semester !== 'All') {
      query.semester = semester;
    }
    
    // Get students based on filters
    const students = await User.find(query).select('roll name branch year section semester');
    console.log(`[BACKEND] Found ${students.length} students matching filters`);
    
    if (students.length === 0) {
      return res.json({
        success: true,
        summary: [],
        absentees: [],
        message: 'No students found with the selected filters'
      });
    }
    
    // Build date query
    let dateQuery = {};
    if (date) {
      dateQuery.date = date;
    } else if (fromDate && toDate) {
      dateQuery.date = { $gte: fromDate, $lte: toDate };
    }
    
    // Get attendance records for the specified periods and dates
    const attendanceQuery = {
      ...dateQuery,
      period: { $in: periods }
    };
    
    const attendanceRecords = await Attendance.find(attendanceQuery);
    console.log(`[BACKEND] Found ${attendanceRecords.length} attendance records`);
    
    // Calculate summary for each class
    const classSummary = {};
    
    students.forEach(student => {
      const classKey = `${student.branch}-${student.year}-${student.section}-${student.semester}`;
      if (!classSummary[classKey]) {
        classSummary[classKey] = {
          className: `${student.branch} ${student.year} ${student.section} ${student.semester}`,
          totalStrength: 0,
          totalPresent: 0,
          totalAbsentees: 0,
          attendancePercent: 0
        };
      }
      classSummary[classKey].totalStrength++;
    });
    
    // Count present students
    attendanceRecords.forEach(record => {
      const student = students.find(s => s.roll === record.studentRoll);
      if (student) {
        const classKey = `${student.branch}-${student.year}-${student.section}-${student.semester}`;
        if (classSummary[classKey]) {
          classSummary[classKey].totalPresent++;
        }
      }
    });
    
    // Calculate absentees and percentages
    const summary = Object.values(classSummary).map((cls, index) => {
      cls.totalAbsentees = cls.totalStrength - cls.totalPresent;
      cls.attendancePercent = cls.totalStrength > 0 ? Math.round((cls.totalPresent / cls.totalStrength) * 100) : 0;
      cls.sno = index + 1;
      return cls;
    });
    
    // Get absentees list
    const absentees = [];
    students.forEach(student => {
      const hasAttendance = attendanceRecords.some(record => 
        record.studentRoll === student.roll && 
        periods.includes(record.period)
      );
      
      if (!hasAttendance) {
        absentees.push({
          roll: student.roll,
          name: student.name,
          branch: student.branch,
          year: student.year,
          section: student.section,
          semester: student.semester
        });
      }
    });
    
    console.log(`[BACKEND] Generated summary with ${summary.length} classes and ${absentees.length} absentees`);
    
    res.json({
      success: true,
      summary,
      absentees,
      totalStudents: students.length,
      totalRecords: attendanceRecords.length
    });
    
  } catch (error) {
    console.error('[BACKEND] Error generating admin attendance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate attendance summary'
    });
  }
});

// Download attendance summary as Excel
app.post('/api/admin/attendance/summary/excel', async (req, res) => {
  try {
    const { date, fromDate, toDate, periods, branch, year, section, semester, branches, years, sections, semesters } = req.body;
    
    console.log('[BACKEND] Admin attendance Excel download request:', req.body);
    
    // Build query based on provided filters
    const query = {};
    
    // Handle both single values (backwards compatibility) and arrays (new checkbox system)
    if (branches && Array.isArray(branches) && branches.length > 0) {
      query.branch = { $in: branches };
    } else if (branch && branch !== 'All') {
      query.branch = branch;
    }
    
    if (years && Array.isArray(years) && years.length > 0) {
      query.year = { $in: years.map(y => parseInt(y)) };
    } else if (year && year !== 'All') {
      query.year = parseInt(year);
    }
    
    if (sections && Array.isArray(sections) && sections.length > 0) {
      query.section = { $in: sections };
    } else if (section && section !== 'All') {
      query.section = section;
    }
    
    if (semesters && Array.isArray(semesters) && semesters.length > 0) {
      query.semester = { $in: semesters };
    } else if (semester && semester !== 'All') {
      query.semester = semester;
    }
    
    // Get students based on filters
    const students = await User.find(query).select('roll name branch year section semester');
    
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No students found with the selected filters'
      });
    }
    
    // Build date query
    let dateQuery = {};
    if (date) {
      dateQuery.date = date;
    } else if (fromDate && toDate) {
      dateQuery.date = { $gte: fromDate, $lte: toDate };
    }
    
    // Validate periods array
    if (!Array.isArray(periods) || periods.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Periods array is required and must not be empty'
      });
    }
    
    // Get attendance records for the specified periods and dates
    const attendanceQuery = {
      ...dateQuery,
      period: { $in: periods }
    };
    
    const attendanceRecords = await Attendance.find(attendanceQuery);
    console.log(`[BACKEND] Found ${attendanceRecords.length} attendance records for ${periods.length} periods`);
    
    // Group students by class (branch-year-section-semester combination)
    const classGroups = {};
    students.forEach(student => {
      const classKey = `${student.branch}-${student.year}-${student.section}-${student.semester}`;
      if (!classGroups[classKey]) {
        classGroups[classKey] = {
          branch: student.branch,
          year: student.year,
          section: student.section,
          semester: student.semester,
          students: []
        };
      }
      classGroups[classKey].students.push(student);
    });

    // Prepare data for Excel - Summary Table Format
    const excelData = [];
    
    // Add title row (will be merged across columns A-F)
    excelData.push([`Attendance Report - ${date || `${fromDate} to ${toDate}`}`]);
    excelData.push([]); // Empty row for spacing
    
    // Add summary table headers
    excelData.push(['S.No', 'Class', 'Total Strei', 'Total Pres', 'No.of Abs', 'Attendance (%)']);
    
    let totalStrength = 0;
    let totalPresent = 0;
    let totalAbsentees = 0;
    let serialNumber = 1;
    
    // Process each class
    for (const classKey in classGroups) {
      const classInfo = classGroups[classKey];
      const classStudents = classInfo.students;
      const classTotalStrength = classStudents.length;
      
      // Count present students for this class across all periods
      let classPresentCount = 0;
      const classAbsentRolls = [];
      
      classStudents.forEach(student => {
        let studentPresentInAnyPeriod = false;
        periods.forEach(period => {
          const hasAttendance = attendanceRecords.some(record => 
            record.studentRoll === student.roll && 
            record.period === period
          );
          if (hasAttendance) {
            studentPresentInAnyPeriod = true;
          }
        });
        
        if (studentPresentInAnyPeriod) {
          classPresentCount++;
        } else {
          classAbsentRolls.push(student.roll);
        }
      });
      
      const classAbsentCount = classTotalStrength - classPresentCount;
      const classAttendancePercentage = Math.round((classPresentCount / classTotalStrength) * 100);
      
      // Add class summary row
      excelData.push([
        serialNumber,
        `${classInfo.year} ${classInfo.branch}-${classInfo.section}`,
        classTotalStrength,
        classPresentCount,
        classAbsentCount,
        classAttendancePercentage
      ]);
      
      // Update totals
      totalStrength += classTotalStrength;
      totalPresent += classPresentCount;
      totalAbsentees += classAbsentCount;
      
      serialNumber++;
    }
    
    // Add totals row
    excelData.push([]); // Empty row for spacing
    excelData.push([
      'Total',
      '',
      totalStrength,
      totalPresent,
      totalAbsentees,
      Math.round((totalPresent / totalStrength) * 100)
    ]);
    
    // Add empty row for spacing
    excelData.push([]);
    
    // Add absentee roll numbers section header
    excelData.push(['ABSENTEES ROLL NO:']);
    
    // Add absentee roll numbers for each class
    serialNumber = 1;
    for (const classKey in classGroups) {
      const classInfo = classGroups[classKey];
      const classStudents = classInfo.students;
      
      // Count absent students for this class
      const classAbsentRolls = [];
      classStudents.forEach(student => {
        let studentPresentInAnyPeriod = false;
        periods.forEach(period => {
          const hasAttendance = attendanceRecords.some(record => 
            record.studentRoll === student.roll && 
            record.period === period
          );
          if (hasAttendance) {
            studentPresentInAnyPeriod = true;
          }
        });
        
        if (!studentPresentInAnyPeriod) {
          classAbsentRolls.push(student.roll);
        }
      });
      
      if (classAbsentRolls.length > 0) {
        // Add absentee row with S.No, Class, and roll numbers
        excelData.push([
          serialNumber,
          `${classInfo.year} ${classInfo.branch}-${classInfo.section}`,
          classAbsentRolls.join(','),
          '', '', '' // Empty cells for remaining columns
        ]);
      }
      
      serialNumber++;
    }
    
    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    
    // Set column widths for better formatting
    const columnWidths = [
      { wch: 8 },   // S.No
      { wch: 20 },  // Class
      { wch: 15 },  // Total Strei/Total Pres/No.of Abs
      { wch: 15 },  // Total Pres
      { wch: 15 },  // No.of Abs
      { wch: 15 }   // Attendance (%)
    ];
    worksheet['!cols'] = columnWidths;
    
    // Add merged cells for title (merge A3:F3)
    if (!worksheet['!merges']) worksheet['!merges'] = [];
    worksheet['!merges'].push({ s: { r: 2, c: 0 }, e: { r: 2, c: 5 } }); // A3:F3
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    console.log(`[BACKEND] Generated Excel file with ${excelData.length} rows, buffer size: ${excelBuffer.length} bytes`);
    
    // Generate filename with date
    const fileName = date ? 
      `attendance_summary_${date}.xlsx` : 
      `attendance_summary_${fromDate}_to_${toDate}.xlsx`;
    
    // Set proper headers for Excel file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', excelBuffer.length);
    
    // Send the Excel file
    res.send(excelBuffer);
    
  } catch (error) {
    console.error('[BACKEND] Error generating admin attendance Excel:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate attendance Excel'
    });
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

// Test endpoint to verify server is working
app.get('/api/test', (req, res) => {
  console.log('🧪 [BACKEND] Test endpoint hit');
  res.json({ 
    success: true, 
    message: 'Server is working',
    timestamp: new Date().toISOString(),
    models: {
      Attendance: !!Attendance,
      Class: !!Class,
      User: !!User
    }
  });
});

// Database cleanup endpoint to resolve duplicate constraints
app.post('/api/cleanup-duplicates', async (req, res) => {
  try {
    console.log('🧹 [BACKEND] Starting duplicate cleanup...');
    
    if (!Attendance) {
      return res.status(500).json({ success: false, message: 'Attendance model not available' });
    }
    
    // Find and remove duplicate records
    const duplicates = await Attendance.aggregate([
      {
        $group: {
          _id: { studentRoll: "$studentRoll", date: "$date", period: "$period" },
          count: { $sum: 1 },
          docs: { $push: "$_id" }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);
    
    console.log(`🔍 [BACKEND] Found ${duplicates.length} duplicate groups`);
    
    let cleanedCount = 0;
    for (const duplicate of duplicates) {
      // Keep the first record, remove the rest
      const [keep, ...remove] = duplicate.docs;
      if (remove.length > 0) {
        await Attendance.deleteMany({ _id: { $in: remove } });
        cleanedCount += remove.length;
        console.log(`🧹 [BACKEND] Cleaned ${remove.length} duplicates for ${duplicate._id.studentRoll}`);
      }
    }
    
    res.json({ 
      success: true, 
      message: `Cleanup completed. Removed ${cleanedCount} duplicate records.`,
      duplicatesFound: duplicates.length,
      recordsCleaned: cleanedCount
    });
    
  } catch (error) {
    console.error('💥 [BACKEND] Cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Cleanup failed',
      error: error.message
    });
  }
});
