// ClassSync Integrated Application JavaScript

// Global variables
let currentUser = null;
let currentRole = null;
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
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        if (data.success) {
            statusElement.textContent = data.message;
            statusElement.className = 'text-green-600 font-medium';
            loadStudentAttendance(currentUser.roll);
        } else {
            statusElement.textContent = data.message;
            statusElement.className = 'text-red-600 font-medium';
        }
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
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.textContent = `Attendance marked for ${roll} (${deviceId})`;
        statusElement.className = 'text-green-600 font-medium';
    }
    loadFacultyAttendance();
}

// Handle scan started (faculty)
function handleScanStarted(data) {
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.textContent = data.message;
        statusElement.className = 'text-green-600 font-medium';
    }
}

// Handle scan stopped (faculty)
function handleScanStopped(data) {
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.textContent = data.message;
        statusElement.className = 'text-gray-600 font-medium';
    }
}

// Add discovered device to faculty list
function addDiscoveredDevice(device) {
    const devicesList = document.getElementById('discovered-devices-list');
    if (!devicesList) return;
    
    const li = document.createElement('li');
    li.innerHTML = `
        <strong>${device.deviceName || 'Unknown Device'}</strong><br>
        ID: ${device.deviceId}<br>
        Signal: ${device.rssi} dBm<br>
        Roll: ${device.roll || 'Unknown'}
    `;
    li.className = 'p-3 border border-gray-200 rounded-lg mb-2 bg-blue-50';
    
    if (!document.querySelector(`[data-device-id="${device.deviceId}"]`)) {
        li.setAttribute('data-device-id', device.deviceId);
        devicesList.appendChild(li);
    }
}

// Login form handler
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const role = document.getElementById('role').value;
    const roll = document.getElementById('roll').value.trim();
    const password = document.getElementById('password').value;
    const loginError = document.getElementById('login-error');
    
    loginError.classList.add('hidden');
    
    if (!role || !roll || !password) {
        loginError.textContent = 'Please fill in all fields.';
        loginError.classList.remove('hidden');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, roll, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = data.user;
            currentRole = role;
            
            initWebSocket();
            showDashboard();
            updateUserInfo();
            
        } else {
            loginError.textContent = data.message || 'Login failed. Please check your credentials.';
            loginError.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = 'Network error. Please try again.';
        loginError.classList.remove('hidden');
    }
});

// Show dashboard after login
function showDashboard() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    showRoleView(currentRole);
    initMobileMenu();
    initUserMenu();
}

// Show role-specific view
function showRoleView(role) {
    const studentView = document.getElementById('studentView');
    const facultyView = document.getElementById('facultyView');
    const adminView = document.getElementById('adminView');
    const pageTitle = document.getElementById('pageTitle');
    
    studentView.classList.add('hidden');
    facultyView.classList.add('hidden');
    adminView.classList.add('hidden');
    
    if (role === 'student') {
        studentView.classList.remove('hidden');
        pageTitle.textContent = 'Student Dashboard';
    } else if (role === 'faculty') {
        facultyView.classList.remove('hidden');
        pageTitle.textContent = 'Faculty Dashboard';
    } else if (role === 'admin') {
        adminView.classList.remove('hidden');
        pageTitle.textContent = 'Admin Panel';
    }
}

// Update user information
function updateUserInfo() {
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const headerUserName = document.getElementById('headerUserName');
    
    if (currentUser) {
        const displayName = currentUser.name || (currentRole === 'student' ? `Student ${currentUser.roll}` : `Prof. ${currentUser.roll}`);
        const roleDisplay = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
        
        if (userName) userName.textContent = displayName;
        if (userRole) userRole.textContent = roleDisplay;
        if (headerUserName) headerUserName.textContent = displayName.split(' ')[0];
    }
}

// Mobile menu toggle
function initMobileMenu() {
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }
}

// User menu toggle
function initUserMenu() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    
    if (userMenuBtn && userMenu) {
        userMenuBtn.addEventListener('click', () => {
            userMenu.classList.toggle('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userMenu.contains(e.target)) {
                userMenu.classList.add('hidden');
            }
        });
    }
}

// Section navigation
function showSection(section) {
    const sections = ['dashboardSection', 'attendanceSection', 'timetableSection', 'notificationsSection'];
    
    sections.forEach(s => {
        document.getElementById(s).classList.add('hidden');
    });
    
    document.getElementById(section + 'Section').classList.remove('hidden');
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = section.charAt(0).toUpperCase() + section.slice(1);
    }
    
    loadSectionContent(section);
}

// ========================================================
//          NEW FEATURE INTEGRATION STARTS HERE
// ========================================================

// Load section content
function loadSectionContent(section) {
    if (section === 'attendance') {
        loadAttendanceContent();
    }
    // Add other sections like timetable later
}

// Load attendance content based on user role
function loadAttendanceContent() {
    const content = document.getElementById('attendanceContent');
    if (!content) return;
    
    if (currentRole === 'student') {
        // Build the new student UI with percentage summary
        content.innerHTML = `
            <div id="student-attendance-summary" class="mb-8">
                <div class="bg-white rounded-xl shadow-md p-6 mb-6 text-center">
                    <h3 class="text-lg font-medium text-gray-500">Overall Attendance</h3>
                    <p id="overall-percentage" class="text-5xl font-bold text-indigo-600 my-2">--%</p>
                    <p id="overall-details" class="text-gray-600">Attended -- out of -- classes</p>
                </div>
                <h3 class="text-xl font-bold mb-4">Subject-wise Attendance</h3>
                <div id="subject-wise-list" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <p class="text-gray-500">Loading attendance summary...</p>
                </div>
            </div>
            <hr class="my-8">
            <div class="text-center">
                <h3 class="text-xl font-bold mb-4">Mark Your Attendance</h3>
                <button onclick="markAttendance()" class="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                    <i class="fas fa-bluetooth mr-2"></i>Mark Attendance
                </button>
                <div id="attendance-status" class="mt-4 p-3 rounded-lg"></div>
            </div>
        `;
        loadStudentAttendanceSummary(currentUser.roll);

    } else if (currentRole === 'faculty') {
        // This is your existing, working faculty UI
        content.innerHTML = `
            <div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h3 class="text-xl font-bold mb-4">Start Attendance Session</h3>
                        <button onclick="startAttendanceSession()" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium mb-4">
                            <i class="fas fa-play mr-2"></i>Start Bluetooth Scanning
                        </button>
                        <div id="bluetooth-status" class="p-3 bg-gray-100 rounded-lg mb-4"></div>
                        <div>
                            <h4 class="font-semibold mb-2">Manual Attendance</h4>
                            <div class="flex gap-2">
                                <input type="text" id="manual-roll" placeholder="Enter Roll Number" class="flex-1 px-3 py-2 border rounded-lg">
                                <button onclick="addManualAttendance()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add</button>
                            </div>
                        </div>
                    </div>
                    <div>
                        <h4 class="font-semibold mb-2">Discovered Devices</h4>
                        <ul id="discovered-devices-list" class="space-y-2 max-h-60 overflow-y-auto"></ul>
                        <h4 class="font-semibold mb-2 mt-6">Today's Attendance</h4>
                        <div id="faculty-attendance-list" class="space-y-2"></div>
                    </div>
                </div>
            </div>
        `;
        loadFacultyAttendance();

    } else if (currentRole === 'admin') {
        // Build the new admin UI with filters and download button
        content.innerHTML = `
            <h3 class="text-xl font-bold mb-4">View Attendance Records</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div>
                    <label for="branchFilter" class="block text-sm font-medium text-gray-700">Branch:</label>
                    <select id="branchFilter" class="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md"><option value="">All</option><option value="CSE">CSE</option><option value="IT">IT</option><option value="ECE">ECE</option><option value="MECH">MECH</option><option value="CIVIL">CIVIL</option></select>
                </div>
                <div>
                    <label for="yearFilter" class="block text-sm font-medium text-gray-700">Year:</label>
                    <select id="yearFilter" class="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md"><option value="">All</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
                </div>
                <div>
                    <label for="sectionFilter" class="block text-sm font-medium text-gray-700">Section:</label>
                    <select id="sectionFilter" class="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md"><option value="">All</option><option value="A">A</option><option value="B">B</option><option value="C">C</option></select>
                </div>
                <div>
                    <label for="dateFilter" class="block text-sm font-medium text-gray-700">Date:</label>
                    <input type="date" id="dateFilter" class="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md">
                </div>
            </div>
            <div class="flex justify-between items-center mb-4">
                <button id="applyFilterBtn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">View Attendance</button>
                <button id="downloadBtn" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Download as Excel</button>
            </div>
            <div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-50"><tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500">Roll Number</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500">Status</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500">Date</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500">Timestamp</th></tr></thead><tbody id="admin-attendance-table" class="bg-white"></tbody></table></div>
        `;
        document.getElementById('applyFilterBtn').addEventListener('click', fetchAdminAttendance);
        document.getElementById('downloadBtn').addEventListener('click', downloadAttendance);
    }
}

// --- Attendance Functions (Your existing functions) ---
function markAttendance() {
    if (!isBluetoothSupported) {
        alert('Bluetooth not supported on this device.');
        return;
    }
    
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'BLUETOOTH_DEVICE_DISCOVERED',
                deviceId: currentUser.deviceId,
                deviceName: 'Student Device',
                rssi: -65 + Math.random() * 20,
                roll: currentUser.roll
            }));
            
            setTimeout(() => {
                ws.send(JSON.stringify({
                    type: 'ATTENDANCE_REQUEST',
                    roll: currentUser.roll,
                    deviceId: currentUser.deviceId
                }));
            }, 1000);
        }
    }, 2000);
}

function startAttendanceSession() {
    fetch('/api/attendance/session', { method: 'POST' });
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'FACULTY_SCAN_START' }));
    }
    document.getElementById('discovered-devices-list').innerHTML = '';
}

function addManualAttendance() {
    const rollInput = document.getElementById('manual-roll');
    const roll = rollInput.value.trim();
    if (!roll) return;
    
    fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll })
    }).then(response => response.json())
    .then(data => {
        if (data.success) {
            rollInput.value = '';
            loadFacultyAttendance();
        } else {
            alert(data.message);
        }
    });
}

// --- Data Loading Functions ---
function loadStudentAttendance(roll) {
    fetch(`/api/attendance/student/${roll}`)
    .then(response => response.json())
    .then(data => {
        const list = document.getElementById('student-attendance-list');
        if (list) {
            list.innerHTML = '';
            if (data.attendance && data.attendance.length) {
                data.attendance.forEach((rec) => {
                    const div = document.createElement('div');
                    div.className = 'p-3 border border-gray-200 rounded-lg';
                    div.innerHTML = `<strong>Date:</strong> ${rec.date} | <strong>Status:</strong> ${rec.status}`;
                    list.appendChild(div);
                });
            } else {
                list.innerHTML = '<div class="text-gray-500">No attendance records.</div>';
            }
        }
    });
}

function loadFacultyAttendance() {
    fetch('/api/attendance/today')
    .then(response => response.json())
    .then(data => {
        const list = document.getElementById('faculty-attendance-list');
        if (list) {
            list.innerHTML = '';
            if (data.attendance && data.attendance.length) {
                data.attendance.forEach((rec) => {
                    const div = document.createElement('div');
                    div.className = 'p-3 border border-gray-200 rounded-lg';
                    div.innerHTML = `<strong>Roll:</strong> ${rec.roll} | <strong>Method:</strong> ${rec.status}`;
                    list.appendChild(div);
                });
            } else {
                list.innerHTML = '<div class="text-gray-500">No attendance yet.</div>';
            }
        }
    });
}

// --- NEW FEATURE LOGIC ---

// Logic for Admin Attendance View
async function fetchAdminAttendance() {
    const branch = document.getElementById('branchFilter').value;
    const year = document.getElementById('yearFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const date = document.getElementById('dateFilter').value;
    const query = new URLSearchParams({ branch, year, section, date }).toString();
    
    try {
        const response = await fetch(`/api/admin/attendance?${query}`);
        const data = await response.json();
        const tableBody = document.getElementById('admin-attendance-table');
        tableBody.innerHTML = '';

        if (data.success && data.attendance.length > 0) {
            data.attendance.forEach(rec => {
                const row = tableBody.insertRow();
                row.innerHTML = `<td class="px-6 py-4">${rec.roll}</td><td class="px-6 py-4">${rec.status}</td><td class="px-6 py-4">${rec.date}</td><td class="px-6 py-4">${new Date(rec.timestamp).toLocaleString()}</td>`;
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">No records found for the selected filters.</td></tr>`;
        }
    } catch (error) {
        console.error("Failed to fetch admin attendance:", error);
    }
}

// Logic for Admin Download Button
function downloadAttendance() {
    const branch = document.getElementById('branchFilter').value;
    const year = document.getElementById('yearFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const date = document.getElementById('dateFilter').value;
    const query = new URLSearchParams({ branch, year, section, date }).toString();
    window.open(`/api/admin/attendance/export?${query}`, '_blank');
}

// Logic for Student Percentage Summary
async function loadStudentAttendanceSummary(roll) {
    try {
        const response = await fetch(`/api/student/attendance/summary/${roll}`);
        const data = await response.json();
        if (data.success) {
            document.getElementById('overall-percentage').textContent = `${data.overall.percentage}%`;
            document.getElementById('overall-details').textContent = `Attended ${data.overall.attended} of ${data.overall.total} classes`;
            const subjectListDiv = document.getElementById('subject-wise-list');
            subjectListDiv.innerHTML = '';
            if (Object.keys(data.subjectWise).length === 0) {
                subjectListDiv.innerHTML = `<p class="text-gray-500">No timetable data found to calculate percentages.</p>`;
                return;
            }
            for (const subject in data.subjectWise) {
                const stats = data.subjectWise[subject];
                const card = document.createElement('div');
                card.className = 'bg-white rounded-lg shadow p-4';
                card.innerHTML = `<div class="flex justify-between items-center"><span class="font-bold">${subject}</span><span>${stats.attended}/${stats.total}</span></div><div class="w-full bg-gray-200 rounded-full h-2.5 mt-2"><div class="bg-indigo-600 h-2.5 rounded-full" style="width: ${stats.percentage}%"></div></div><p class="text-right text-lg font-semibold mt-1">${stats.percentage}%</p>`;
                subjectListDiv.appendChild(card);
            }
        }
    } catch (error) {
        console.error("Failed to load summary:", error);
    }
}

// Logout function
function logout() {
    window.location.reload();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('ClassSync Integrated Application loaded');
});
