// ClassSync Front-End Script (Bluetooth-based)

const loginForm = document.getElementById('login-form');
const loginContainer = document.getElementById('login-container');
const loginError = document.getElementById('login-error');

const studentDashboard = document.getElementById('student-dashboard');
const facultyDashboard = document.getElementById('faculty-dashboard');
const adminDashboard = document.getElementById('admin-dashboard');

// Student
const scanAttendanceBtn = document.getElementById('scan-attendance');
const studentInfo = document.getElementById('student-info');
const studentAttendanceList = document.getElementById('student-attendance-list');
const attendanceStatus = document.getElementById('attendance-status');
const logoutStudent = document.getElementById('logout-student');

// Faculty
const generateAttendanceBtn = document.getElementById('generate-attendance');
const facultyInfo = document.getElementById('faculty-info');
const facultyAttendanceList = document.getElementById('faculty-attendance-list');
const bluetoothStatus = document.getElementById('bluetooth-status');
const manualAttendanceForm = document.getElementById('manual-attendance-form');
const manualRollInput = document.getElementById('manual-roll');
const logoutFaculty = document.getElementById('logout-faculty');
const discoveredDevicesList = document.getElementById('discovered-devices-list');

// Admin
const adminInfo = document.getElementById('admin-info');
const adminAttendanceList = document.getElementById('admin-attendance-list');
const logoutAdmin = document.getElementById('logout-admin');

let currentUser = null;
let currentRole = null;
let facultySessionActive = false;
let ws = null;
let bluetoothDevice = null;
let isBluetoothSupported = false;

// Check Bluetooth support
if (navigator.bluetooth) {
  isBluetoothSupported = true;
  console.log('Web Bluetooth API is supported');
} else {
  console.log('Web Bluetooth API is not supported');
}

// Initialize WebSocket connection
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket connected');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  };
  
  ws.onclose = () => {
    console.log('WebSocket disconnected');
    // Reconnect after 3 seconds
    setTimeout(initWebSocket, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
  switch (data.type) {
    case 'ATTENDANCE_RESPONSE':
      handleAttendanceResponse(data);
      break;
    case 'DEVICE_FOUND':
      handleDeviceFound(data);
      break;
    case 'ATTENDANCE_MARKED':
      handleAttendanceMarked(data);
      break;
    case 'SCAN_STARTED':
      handleScanStarted(data);
      break;
    case 'SCAN_STOPPED':
      handleScanStopped(data);
      break;
  }
}

// Handle attendance response
function handleAttendanceResponse(data) {
  if (data.success) {
    attendanceStatus.textContent = data.message;
    attendanceStatus.style.color = '#10b981';
    loadStudentAttendance(currentUser.roll);
  } else {
    attendanceStatus.textContent = data.message;
    attendanceStatus.style.color = '#ef4444';
  }
}

// Handle device found (faculty)
function handleDeviceFound(data) {
  const { device } = data;
  addDiscoveredDevice(device);
}

// Handle attendance marked (faculty)
function handleAttendanceMarked(data) {
  const { roll, deviceId } = data;
  bluetoothStatus.textContent = `Attendance marked for ${roll} (${deviceId})`;
  loadFacultyAttendance();
}

// Handle scan started (faculty)
function handleScanStarted(data) {
  bluetoothStatus.textContent = data.message;
  bluetoothStatus.style.color = '#10b981';
  facultySessionActive = true;
}

// Handle scan stopped (faculty)
function handleScanStopped(data) {
  bluetoothStatus.textContent = data.message;
  bluetoothStatus.style.color = '#6b7280';
  facultySessionActive = false;
}

// Add discovered device to faculty list
function addDiscoveredDevice(device) {
  if (!discoveredDevicesList) return;
  
  const li = document.createElement('li');
  li.innerHTML = `
    <strong>${device.deviceName || 'Unknown Device'}</strong><br>
    ID: ${device.deviceId}<br>
    Signal: ${device.rssi} dBm<br>
    Roll: ${device.roll || 'Unknown'}
  `;
  li.style.border = '1px solid #e5e7eb';
  li.style.padding = '0.5rem';
  li.style.margin = '0.25rem 0';
  li.style.borderRadius = '0.375rem';
  
  discoveredDevicesList.appendChild(li);
}

function showDashboard(role, user) {
  loginContainer.classList.add('hidden');
  studentDashboard.classList.add('hidden');
  facultyDashboard.classList.add('hidden');
  adminDashboard.classList.add('hidden');
  
  if (role === 'student') {
    studentDashboard.classList.remove('hidden');
    studentInfo.textContent = `Welcome, ${user.roll}`;
    loadStudentAttendance(user.roll);
  } else if (role === 'faculty') {
    facultyDashboard.classList.remove('hidden');
    facultyInfo.textContent = `Welcome, Faculty ${user.roll}`;
    loadFacultyAttendance();
    // Initialize discovered devices list
    if (discoveredDevicesList) {
      discoveredDevicesList.innerHTML = '<li>No devices discovered yet...</li>';
    }
  } else if (role === 'admin') {
    adminDashboard.classList.remove('hidden');
    adminInfo.textContent = `Welcome, Admin`;
    loadAdminAttendance();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const role = document.getElementById('role').value;
  const roll = document.getElementById('roll').value.trim();
  const password = document.getElementById('password').value;
  loginError.classList.add('hidden');
  
  // Call backend for login
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, roll, password })
  });
  const data = await res.json();
  
  if (data.success) {
    currentUser = data.user;
    currentRole = role;
    showDashboard(role, data.user);
    
    // Initialize WebSocket after login
    initWebSocket();
  } else {
    loginError.textContent = data.message || 'Login failed.';
    loginError.classList.remove('hidden');
  }
});

// Student: Scan for Attendance using Bluetooth
if (scanAttendanceBtn) {
  scanAttendanceBtn.addEventListener('click', async () => {
    if (!isBluetoothSupported) {
      attendanceStatus.textContent = 'Bluetooth not supported on this device.';
      attendanceStatus.style.color = '#ef4444';
      return;
    }
    
    attendanceStatus.textContent = 'Requesting Bluetooth device...';
    attendanceStatus.style.color = '#f59e0b';
    
    try {
      // Request Bluetooth device
      bluetoothDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access']
      });
      
      attendanceStatus.textContent = 'Device selected. Broadcasting presence...';
      
      // Simulate device discovery by faculty
      // In real implementation, this would be handled by the Web Bluetooth API
      setTimeout(() => {
        // Send device discovery to server
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'BLUETOOTH_DEVICE_DISCOVERED',
            deviceId: currentUser.deviceId,
            deviceName: bluetoothDevice.name || 'Student Device',
            rssi: -65 + Math.random() * 20, // Simulate RSSI
            roll: currentUser.roll
          }));
          
          // Request attendance
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: 'ATTENDANCE_REQUEST',
              roll: currentUser.roll,
              deviceId: currentUser.deviceId
            }));
          }, 1000);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Bluetooth error:', error);
      attendanceStatus.textContent = 'Bluetooth error: ' + error.message;
      attendanceStatus.style.color = '#ef4444';
    }
  });
}

// Faculty: Start Bluetooth Scanning
if (generateAttendanceBtn) {
  generateAttendanceBtn.addEventListener('click', async () => {
    if (!isBluetoothSupported) {
      bluetoothStatus.textContent = 'Bluetooth not supported on this device.';
      bluetoothStatus.style.color = '#ef4444';
      return;
    }
    
    // Start session
    await fetch('/api/attendance/session', { method: 'POST' });
    
    // Start Bluetooth scanning
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'FACULTY_SCAN_START'
      }));
    }
    
    // Clear discovered devices list
    if (discoveredDevicesList) {
      discoveredDevicesList.innerHTML = '<li>Scanning for devices...</li>';
    }
    
    // Simulate device discovery for demo
    simulateDeviceDiscovery();
  });
}

// Simulate device discovery for demo purposes
function simulateDeviceDiscovery() {
  const demoDevices = [
    { deviceId: 'student-device-001', deviceName: 'Student S101 Device', roll: 'S101' },
    { deviceId: 'student-device-002', deviceName: 'Student S102 Device', roll: 'S102' },
    { deviceId: 'student-device-003', deviceName: 'Student S103 Device', roll: 'S103' },
    { deviceId: 'student-device-004', deviceName: 'Student S104 Device', roll: 'S104' },
    { deviceId: 'student-device-005', deviceName: 'Student S105 Device', roll: 'S105' }
  ];
  
  demoDevices.forEach((device, index) => {
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'BLUETOOTH_DEVICE_DISCOVERED',
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          rssi: -60 + Math.random() * 30,
          roll: device.roll
        }));
      }
    }, (index + 1) * 1000);
  });
}

// Faculty: Manual Attendance
if (manualAttendanceForm) {
  manualAttendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const roll = manualRollInput.value.trim();
    if (!roll) return;
    
    const res = await fetch('/api/attendance/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roll })
    });
    const data = await res.json();
    
    if (data.success) {
      manualRollInput.value = '';
      loadFacultyAttendance();
      bluetoothStatus.textContent = `Manual attendance added for ${roll}`;
      bluetoothStatus.style.color = '#10b981';
    } else {
      bluetoothStatus.textContent = data.message || 'Could not add attendance.';
      bluetoothStatus.style.color = '#ef4444';
    }
  });
}

// Logout handlers
if (logoutStudent) logoutStudent.onclick = () => location.reload();
if (logoutFaculty) logoutFaculty.onclick = () => location.reload();
if (logoutAdmin) logoutAdmin.onclick = () => location.reload();

// Load attendance for student
async function loadStudentAttendance(roll) {
  const res = await fetch(`/api/attendance/student/${roll}`);
  const data = await res.json();
  studentAttendanceList.innerHTML = '';
  
  if (data.attendance && data.attendance.length) {
    data.attendance.forEach((rec) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>Date:</strong> ${rec.date} | 
        <strong>Status:</strong> ${rec.status}
        ${rec.rssi ? ` | <strong>Signal:</strong> ${rec.rssi} dBm` : ''}
      `;
      studentAttendanceList.appendChild(li);
    });
  } else {
    studentAttendanceList.innerHTML = '<li>No attendance records.</li>';
  }
}

// Load attendance for faculty (today's session)
async function loadFacultyAttendance() {
  const res = await fetch('/api/attendance/today');
  const data = await res.json();
  facultyAttendanceList.innerHTML = '';
  
  if (data.attendance && data.attendance.length) {
    data.attendance.forEach((rec) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>Roll:</strong> ${rec.roll} | 
        <strong>Date:</strong> ${rec.date} | 
        <strong>Method:</strong> ${rec.status}
        ${rec.rssi ? ` | <strong>Signal:</strong> ${rec.rssi} dBm` : ''}
      `;
      facultyAttendanceList.appendChild(li);
    });
  } else {
    facultyAttendanceList.innerHTML = '<li>No attendance yet.</li>';
  }
}

// Load all attendance for admin
async function loadAdminAttendance() {
  const res = await fetch('/api/attendance/all');
  const data = await res.json();
  adminAttendanceList.innerHTML = '';
  
  if (data.attendance && data.attendance.length) {
    data.attendance.forEach((rec) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <strong>Roll:</strong> ${rec.roll} | 
        <strong>Date:</strong> ${rec.date} | 
        <strong>Status:</strong> ${rec.status}
        ${rec.rssi ? ` | <strong>Signal:</strong> ${rec.rssi} dBm` : ''}
      `;
      adminAttendanceList.appendChild(li);
    });
  } else {
    adminAttendanceList.innerHTML = '<li>No attendance records.</li>';
  }
}

// Initialize WebSocket on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('ClassSync Bluetooth Frontend loaded');
});