// ClassSync Integrated Dashboard JavaScript

// Global variables
let currentUser = null;
let currentRole = 'student';
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
    
    devicesList.appendChild(li);
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
        
        // Close user menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userMenu.contains(e.target)) {
                userMenu.classList.add('hidden');
            }
        });
    }
}

// Role switching
function switchRole(role) {
    const studentView = document.getElementById('studentView');
    const facultyView = document.getElementById('facultyView');
    const adminView = document.getElementById('adminView');
    const userName = document.getElementById('userName');
    const userRole = document.getElementById('userRole');
    const headerUserName = document.getElementById('headerUserName');
    const pageTitle = document.getElementById('pageTitle');
    
    currentRole = role;
    
    if (role === 'student') {
        studentView.classList.remove('hidden');
        facultyView.classList.add('hidden');
        adminView.classList.add('hidden');
        userName.textContent = 'John Doe';
        userRole.textContent = 'Student';
        headerUserName.textContent = 'John';
        pageTitle.textContent = 'Student Dashboard';
    } else if (role === 'faculty') {
        studentView.classList.add('hidden');
        facultyView.classList.remove('hidden');
        adminView.classList.add('hidden');
        userName.textContent = 'Prof. Smith';
        userRole.textContent = 'Faculty';
        headerUserName.textContent = 'Prof. Smith';
        pageTitle.textContent = 'Faculty Dashboard';
    } else if (role === 'admin') {
        studentView.classList.add('hidden');
        facultyView.classList.add('hidden');
        adminView.classList.remove('hidden');
        userName.textContent = 'Admin User';
        userRole.textContent = 'Administrator';
        headerUserName.textContent = 'Admin';
        pageTitle.textContent = 'Admin Panel';
    }
    
    // Close mobile menu if open
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

// Section navigation
function showSection(section) {
    const sections = ['dashboardSection', 'attendanceSection', 'timetableSection', 'notificationsSection'];
    
    sections.forEach(s => {
        const element = document.getElementById(s);
        if (element) {
            element.classList.add('hidden');
        }
    });
    
    const targetSection = document.getElementById(section + 'Section');
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }
    
    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        switch(section) {
            case 'dashboard':
                pageTitle.textContent = currentRole === 'student' ? 'Student Dashboard' : 
                                       currentRole === 'faculty' ? 'Faculty Dashboard' : 'Admin Panel';
                break;
            case 'attendance':
                pageTitle.textContent = 'Attendance System';
                break;
            case 'timetable':
                pageTitle.textContent = 'Weekly Timetable';
                break;
            case 'notifications':
                pageTitle.textContent = 'Notifications';
                break;
        }
    }
    
    // Load section content
    loadSectionContent(section);
}

// Load section content
function loadSectionContent(section) {
    switch(section) {
        case 'attendance':
            loadAttendanceContent();
            break;
        case 'timetable':
            loadTimetableContent();
            break;
        case 'notifications':
            loadNotificationsContent();
            break;
    }
}

// Load attendance content
function loadAttendanceContent() {
    const content = document.getElementById('attendanceContent');
    if (!content) return;
    
    if (currentRole === 'student') {
        content.innerHTML = `
            <div class="text-center">
                <h3 class="text-xl font-bold mb-4">Mark Your Attendance</h3>
                <p class="text-gray-600 mb-6">Use Bluetooth to mark your attendance for the current class.</p>
                <button onclick="markAttendance()" class="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                    <i class="fas fa-bluetooth mr-2"></i>Mark Attendance
                </button>
                <div id="attendance-status" class="mt-4 p-3 rounded-lg"></div>
                <div class="mt-6">
                    <h4 class="font-semibold mb-2">Your Attendance History</h4>
                    <div id="student-attendance-list" class="space-y-2"></div>
                </div>
            </div>
        `;
        loadStudentAttendance('S101'); // Demo roll number
    } else if (currentRole === 'faculty') {
        content.innerHTML = `
            <div>
                <div class="mb-6">
                    <h3 class="text-xl font-bold mb-4">Enhanced Attendance System</h3>
                    
                    <!-- Class Selection Form -->
                    <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                        <h4 class="font-semibold mb-4 text-gray-800">Select Class & Periods</h4>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Date:</label>
                                <input type="date" id="attendance-date" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" value="${new Date().toISOString().split('T')[0]}">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Subject:</label>
                                <select id="class-select" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500">
                                    <option value="">Select Subject</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Periods:</label>
                                <div class="flex flex-wrap gap-2">
                                    ${[1,2,3,4,5,6,7].map(p => `
                                        <label class="flex items-center">
                                            <input type="checkbox" value="${p}" class="mr-1">
                                            <span class="text-sm">Period ${p}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        
                        <button onclick="loadClassStudents()" class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                            <i class="fas fa-search mr-2"></i>Show Students
                        </button>
                    </div>
                    
                    <!-- Attendance Session Controls -->
                    <div id="session-controls" class="hidden bg-white p-6 rounded-lg shadow-md mb-6">
                        <h4 class="font-semibold mb-4 text-gray-800">Attendance Session</h4>
                        <div class="flex gap-4 mb-4">
                            <button onclick="startEnhancedAttendanceSession()" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                                <i class="fas fa-play mr-2"></i>Start Bluetooth Scanning
                            </button>
                            <button onclick="stopEnhancedAttendanceSession()" class="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                                <i class="fas fa-stop mr-2"></i>Stop Scanning
                            </button>
                        </div>
                        <div id="bluetooth-status" class="p-3 bg-gray-100 rounded-lg"></div>
                    </div>
                </div>
                
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- Students List -->
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h4 class="font-semibold mb-4 text-gray-800">Class Students</h4>
                        <div id="students-list" class="space-y-2 max-h-96 overflow-y-auto">
                            <p class="text-gray-500 text-center py-8">Select a class to view students</p>
                        </div>
                    </div>
                    
                    <!-- Attendance Records -->
                    <div class="bg-white p-6 rounded-lg shadow-md">
                        <h4 class="font-semibold mb-4 text-gray-800">Attendance Records</h4>
                        <div id="attendance-records" class="space-y-2 max-h-96 overflow-y-auto">
                            <p class="text-gray-500 text-center py-8">No attendance records yet</p>
                        </div>
                    </div>
                </div>
                
                <!-- Legacy Interface (Hidden by default) -->
                <div id="legacy-faculty-interface" class="hidden">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 class="text-xl font-bold mb-4">Legacy Attendance Session</h3>
                            <button onclick="startAttendanceSession()" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium mb-4">
                                <i class="fas fa-play mr-2"></i>Start Bluetooth Scanning
                            </button>
                            <div id="bluetooth-status-legacy" class="p-3 bg-gray-100 rounded-lg mb-4"></div>
                            <div>
                                <h4 class="font-semibold mb-2">Manual Attendance</h4>
                                <div class="flex gap-2">
                                    <input type="text" id="manual-roll" placeholder="Enter Roll Number" class="flex-1 px-3 py-2 border rounded-lg">
                                    <button onclick="addManualAttendance()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 class="font-semibold mb-2">Discovered Devices</h4>
                            <ul id="discovered-devices-list" class="space-y-2"></ul>
                            <h4 class="font-semibold mb-2 mt-6">Today's Attendance</h4>
                            <div id="faculty-attendance-list" class="space-y-2"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Load faculty classes
        loadFacultyClasses();
    } else if (currentRole === 'admin') {
        content.innerHTML = `
            <div>
                <h3 class="text-xl font-bold mb-4">Attendance Overview</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div class="bg-blue-50 p-4 rounded-lg text-center">
                        <p class="text-2xl font-bold text-blue-600">85%</p>
                        <p class="text-sm text-blue-500">Average Attendance</p>
                    </div>
                    <div class="bg-green-50 p-4 rounded-lg text-center">
                        <p class="text-2xl font-bold text-green-600">1,250</p>
                        <p class="text-sm text-green-500">Students Present Today</p>
                    </div>
                    <div class="bg-yellow-50 p-4 rounded-lg text-center">
                        <p class="text-2xl font-bold text-yellow-600">18</p>
                        <p class="text-sm text-yellow-500">Classes Completed</p>
                    </div>
                </div>
                <div id="admin-attendance-list" class="space-y-2"></div>
            </div>
        `;
        loadAdminAttendance();
    }
}

// Load timetable content
function loadTimetableContent() {
    const content = document.getElementById('timetableContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full">
                <thead>
                    <tr class="bg-gray-50">
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Monday</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tuesday</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Wednesday</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thursday</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Friday</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saturday</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">8:00 AM</td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="timetable-cell bg-blue-50 border-l-4 border-blue-500 p-2 rounded cursor-pointer">
                                <p class="font-medium text-blue-800">Math</p>
                                <p class="text-xs text-blue-600">Room 201</p>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap"></td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="timetable-cell bg-blue-50 border-l-4 border-blue-500 p-2 rounded cursor-pointer">
                                <p class="font-medium text-blue-800">Math</p>
                                <p class="text-xs text-blue-600">Room 201</p>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap"></td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="timetable-cell bg-blue-50 border-l-4 border-blue-500 p-2 rounded cursor-pointer">
                                <p class="font-medium text-blue-800">Math</p>
                                <p class="text-xs text-blue-600">Room 201</p>
                            </div>
                        </td>
                    </tr>
                    <tr class="bg-gray-50">
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">10:00 AM</td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="timetable-cell bg-purple-50 border-l-4 border-purple-500 p-2 rounded cursor-pointer">
                                <p class="font-medium text-purple-800">Data Structures</p>
                                <p class="text-xs text-purple-600">Room 302</p>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="timetable-cell bg-green-50 border-l-4 border-green-500 p-2 rounded cursor-pointer">
                                <p class="font-medium text-green-800">Physics</p>
                                <p class="text-xs text-green-600">Room 105</p>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="timetable-cell bg-purple-50 border-l-4 border-purple-500 p-2 rounded cursor-pointer">
                                <p class="font-medium text-purple-800">Data Structures</p>
                                <p class="text-xs text-purple-600">Room 302</p>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="timetable-cell bg-green-50 border-l-4 border-green-500 p-2 rounded cursor-pointer">
                                <p class="font-medium text-green-800">Physics</p>
                                <p class="text-xs text-green-600">Room 105</p>
                            </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            <div class="timetable-cell bg-purple-50 border-l-4 border-purple-500 p-2 rounded cursor-pointer">
                                <p class="font-medium text-purple-800">Data Structures</p>
                                <p class="text-xs text-purple-600">Room 302</p>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// Load notifications content
function loadNotificationsContent() {
    const content = document.getElementById('notificationsContent');
    if (!content) return;
    
    content.innerHTML = `
        <div class="space-y-4">
            <div class="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div class="flex items-start">
                    <div class="flex-shrink-0 pt-1">
                        <div class="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                            <i class="fas fa-exclamation-circle"></i>
                        </div>
                    </div>
                    <div class="ml-3 flex-1">
                        <div class="flex items-center justify-between">
                            <p class="text-sm font-medium text-gray-900">Class Cancelled</p>
                            <span class="text-xs text-gray-500">2h ago</span>
                        </div>
                        <p class="text-sm text-gray-500">Physics class at 10:00 AM has been cancelled by Prof. Johnson.</p>
                    </div>
                </div>
            </div>
            <div class="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div class="flex items-start">
                    <div class="flex-shrink-0 pt-1">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-500">
                            <i class="fas fa-info-circle"></i>
                        </div>
                    </div>
                    <div class="ml-3 flex-1">
                        <div class="flex items-center justify-between">
                            <p class="text-sm font-medium text-gray-900">Room Change</p>
                            <span class="text-xs text-gray-500">5h ago</span>
                        </div>
                        <p class="text-sm text-gray-500">Algorithms class moved from Room 415 to Room 312 for today.</p>
                    </div>
                </div>
            </div>
            <div class="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div class="flex items-start">
                    <div class="flex-shrink-0 pt-1">
                        <div class="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-500">
                            <i class="fas fa-check-circle"></i>
                        </div>
                    </div>
                    <div class="ml-3 flex-1">
                        <div class="flex items-center justify-between">
                            <p class="text-sm font-medium text-gray-900">Assignment Due</p>
                            <span class="text-xs text-gray-500">1d ago</span>
                        </div>
                        <p class="text-sm text-gray-500">Data Structures assignment due tomorrow at 11:59 PM.</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Enhanced Student Attendance Functions

// Global variables for student attendance
let currentStudentSessionId = null;
let currentStudentPeriod = null;

// Student attendance function - enhanced to work with sessions
function markAttendance() {
    if (!isBluetoothSupported) {
        const statusElement = document.getElementById('attendance-status');
        if (statusElement) {
            statusElement.textContent = 'Bluetooth not supported on this device.';
            statusElement.className = 'text-red-600 font-medium';
        }
        return;
    }
    
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        statusElement.textContent = 'Requesting Bluetooth device...';
        statusElement.className = 'text-yellow-600 font-medium';
    }
    
    // First, try to find an active session for the current student
    findActiveSessionForStudent();
}

// Find active session for current student
async function findActiveSessionForStudent() {
    try {
        const studentRoll = localStorage.getItem('currentUserId') || 'S101';
        const today = new Date().toISOString().split('T')[0];
        
        // Get active sessions for today
        const response = await fetch(`/api/faculty/attendance/sessions/F101?date=${today}`);
        const data = await response.json();
        
        if (data.success && data.sessions.length > 0) {
            // Find a session where this student is enrolled
            for (const session of data.sessions) {
                const classData = await fetch(`/api/faculty/class/${session.classId}/students`);
                const classResponse = await classResponse.json();
                
                if (classResponse.success) {
                    const isEnrolled = classResponse.students.some(student => student.roll === studentRoll);
                    if (isEnrolled) {
                        currentStudentSessionId = session._id;
                        currentStudentPeriod = session.periods[0]; // Use first period for now
                        markAttendanceForSession(studentRoll);
                        return;
                    }
                }
            }
        }
        
        // Fallback to legacy system if no session found
        markAttendanceLegacy();
        
    } catch (error) {
        console.error('Error finding active session:', error);
        markAttendanceLegacy();
    }
}

// Mark attendance for specific session
function markAttendanceForSession(studentRoll) {
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        statusElement.textContent = 'Marking attendance for active session...';
        statusElement.className = 'text-blue-600 font-medium';
    }
    
    // Simulate Bluetooth attendance marking with session
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'BLUETOOTH_DEVICE_DISCOVERED',
                deviceId: 'student-device-001',
                deviceName: 'Student Device',
                rssi: -65 + Math.random() * 20,
                roll: studentRoll
            }));
            
            setTimeout(() => {
                ws.send(JSON.stringify({
                    type: 'ATTENDANCE_REQUEST',
                    roll: studentRoll,
                    deviceId: 'student-device-001',
                    sessionId: currentStudentSessionId,
                    period: currentStudentPeriod
                }));
            }, 1000);
        }
    }, 2000);
}

// Legacy attendance function (fallback)
function markAttendanceLegacy() {
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        statusElement.textContent = 'No active session found, using legacy system...';
        statusElement.className = 'text-yellow-600 font-medium';
    }
    
    // Simulate Bluetooth attendance marking (legacy)
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'BLUETOOTH_DEVICE_DISCOVERED',
                deviceId: 'student-device-001',
                deviceName: 'Student Device',
                rssi: -65 + Math.random() * 20,
                roll: 'S101'
            }));
            
            setTimeout(() => {
                ws.send(JSON.stringify({
                    type: 'ATTENDANCE_REQUEST',
                    roll: 'S101',
                    deviceId: 'student-device-001'
                }));
            }, 1000);
        }
    }, 2000);
}

function startAttendanceSession() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'FACULTY_SCAN_START'
        }));
    }
    
    // Simulate device discovery
    setTimeout(() => {
        simulateDeviceDiscovery();
    }, 1000);
}

function addManualAttendance() {
    const rollInput = document.getElementById('manual-roll');
    const roll = rollInput.value.trim();
    
    if (!roll) return;
    
    // Send manual attendance request
    fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll })
    }).then(response => response.json())
    .then(data => {
        if (data.success) {
            rollInput.value = '';
            loadFacultyAttendance();
        }
    });
}

function simulateDeviceDiscovery() {
    const demoDevices = [
        { deviceId: 'student-device-001', deviceName: 'Student S101 Device', roll: 'S101' },
        { deviceId: 'student-device-002', deviceName: 'Student S102 Device', roll: 'S102' },
        { deviceId: 'student-device-003', deviceName: 'Student S103 Device', roll: 'S103' }
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

// Load attendance data
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
                    div.innerHTML = `
                        <strong>Date:</strong> ${rec.date} | 
                        <strong>Status:</strong> ${rec.status}
                        ${rec.rssi ? ` | <strong>Signal:</strong> ${rec.rssi} dBm` : ''}
                    `;
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
                    div.innerHTML = `
                        <strong>Roll:</strong> ${rec.roll} | 
                        <strong>Date:</strong> ${rec.date} | 
                        <strong>Method:</strong> ${rec.status}
                        ${rec.rssi ? ` | <strong>Signal:</strong> ${rec.rssi} dBm` : ''}
                    `;
                    list.appendChild(div);
                });
            } else {
                list.innerHTML = '<div class="text-gray-500">No attendance yet.</div>';
            }
        }
    });
}

function loadAdminAttendance() {
    fetch('/api/attendance/all')
    .then(response => response.json())
    .then(data => {
        const list = document.getElementById('admin-attendance-list');
        if (list) {
            list.innerHTML = '';
            if (data.attendance && data.attendance.length) {
                data.attendance.forEach((rec) => {
                    const div = document.createElement('div');
                    div.className = 'p-3 border border-gray-200 rounded-lg';
                    div.innerHTML = `
                        <strong>Roll:</strong> ${rec.roll} | 
                        <strong>Date:</strong> ${rec.date} | 
                        <strong>Status:</strong> ${rec.status}
                        ${rec.rssi ? ` | <strong>Signal:</strong> ${rec.rssi} dBm` : ''}
                    `;
                    list.appendChild(div);
                });
            } else {
                list.innerHTML = '<div class="text-gray-500">No attendance records.</div>';
            }
        }
    });
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '/classsyncc.html';
    }
}

// Enhanced Faculty Attendance Functions

let currentSessionId = null;
let currentClassData = null;
let currentPeriods = [];

// Load faculty classes
async function loadFacultyClasses() {
    try {
        const facultyId = localStorage.getItem('currentUserId') || 'F101'; // Demo faculty ID
        const response = await fetch(`/api/faculty/classes/${facultyId}`);
        const data = await response.json();
        
        if (data.success) {
            const classSelect = document.getElementById('class-select');
            classSelect.innerHTML = '<option value="">Select Subject</option>';
            
            data.classes.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls._id;
                option.textContent = `${cls.subject} => ${cls.branch}, ${cls.year} ${cls.branch} - ${cls.semester} ${cls.section}`;
                classSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading faculty classes:', error);
    }
}

// Load students for selected class
async function loadClassStudents() {
    const classId = document.getElementById('class-select').value;
    const date = document.getElementById('attendance-date').value;
    const selectedPeriods = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => parseInt(cb.value));
    
    if (!classId) {
        alert('Please select a class');
        return;
    }
    
    if (selectedPeriods.length === 0) {
        alert('Please select at least one period');
        return;
    }
    
    try {
        const response = await fetch(`/api/faculty/class/${classId}/students`);
        const data = await response.json();
        
        if (data.success) {
            currentClassData = data.classData;
            currentPeriods = selectedPeriods;
            
            // Display students
            const studentsList = document.getElementById('students-list');
            studentsList.innerHTML = `
                <div class="mb-4 p-3 bg-blue-50 rounded-lg">
                    <h5 class="font-semibold text-blue-800">${data.classData.subject} - ${data.classData.section}</h5>
                    <p class="text-sm text-blue-600">Date: ${date} | Periods: ${selectedPeriods.join(', ')}</p>
                </div>
            `;
            
            data.students.forEach((student, index) => {
                const studentDiv = document.createElement('div');
                studentDiv.className = 'p-3 border border-gray-200 rounded-lg flex justify-between items-center';
                studentDiv.innerHTML = `
                    <div>
                        <span class="font-medium">${index + 1}.</span>
                        <span class="font-medium">${student.name}</span>
                        <span class="text-sm text-gray-500">(${student.roll})</span>
                    </div>
                    <div class="flex gap-2">
                        ${selectedPeriods.map(period => `
                            <button onclick="markStudentAttendance('${student.roll}', ${period})" 
                                    class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 attendance-btn" 
                                    data-student="${student.roll}" data-period="${period}">
                                Period ${period}
                            </button>
                        `).join('')}
                    </div>
                `;
                studentsList.appendChild(studentDiv);
            });
            
            // Show session controls
            document.getElementById('session-controls').classList.remove('hidden');
            
        }
    } catch (error) {
        console.error('Error loading class students:', error);
        alert('Error loading students');
    }
}

// Mark attendance for a student
async function markStudentAttendance(studentRoll, period) {
    if (!currentSessionId) {
        alert('Please start an attendance session first');
        return;
    }
    
    try {
        const response = await fetch('/api/faculty/attendance/mark', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: currentSessionId,
                studentRoll,
                period,
                method: 'manual'
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update button appearance
            const btn = document.querySelector(`[data-student="${studentRoll}"][data-period="${period}"]`);
            if (btn) {
                btn.classList.remove('bg-green-100', 'text-green-700', 'hover:bg-green-200');
                btn.classList.add('bg-green-500', 'text-white');
                btn.textContent = '✓ Present';
                btn.disabled = true;
            }
            
            // Update attendance records
            updateAttendanceRecords();
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Error marking attendance:', error);
        alert('Error marking attendance');
    }
}

// Start enhanced attendance session
async function startEnhancedAttendanceSession() {
    if (!currentClassData || currentPeriods.length === 0) {
        alert('Please select a class and periods first');
        return;
    }
    
    const date = document.getElementById('attendance-date').value;
    
    try {
        const facultyId = localStorage.getItem('currentUserId') || 'F101';
        const response = await fetch('/api/faculty/attendance/session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                classId: currentClassData._id,
                date,
                periods: currentPeriods,
                facultyId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentSessionId = data.sessionId;
            
            // Update UI
            document.getElementById('bluetooth-status').innerHTML = `
                <div class="text-green-600 font-medium">
                    <i class="fas fa-bluetooth mr-2"></i>Session Active - Scanning for devices...
                </div>
                <div class="text-sm text-gray-600 mt-2">
                    Class: ${currentClassData.subject} | Periods: ${currentPeriods.join(', ')} | Date: ${date}
                </div>
            `;
            
            // Start WebSocket scanning
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'FACULTY_SCAN_START' }));
            }
            
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Error starting attendance session:', error);
        alert('Error starting attendance session');
    }
}

// Stop enhanced attendance session
function stopEnhancedAttendanceSession() {
    currentSessionId = null;
    
    // Update UI
    document.getElementById('bluetooth-status').innerHTML = `
        <div class="text-red-600 font-medium">
            <i class="fas fa-stop mr-2"></i>Session Stopped
        </div>
    `;
    
    // Stop WebSocket scanning
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'FACULTY_SCAN_STOP' }));
    }
}

// Update attendance records display
async function updateAttendanceRecords() {
    if (!currentSessionId) return;
    
    try {
        const response = await fetch(`/api/faculty/attendance/session/${currentSessionId}`);
        const data = await response.json();
        
        if (data.success) {
            const recordsDiv = document.getElementById('attendance-records');
            const session = data.session;
            
            recordsDiv.innerHTML = `
                <div class="mb-4 p-3 bg-blue-50 rounded-lg">
                    <h5 class="font-semibold text-blue-800">Session Summary</h5>
                    <p class="text-sm text-blue-600">Total Records: ${session.attendanceRecords.length}</p>
                </div>
            `;
            
            // Group records by student
            const studentRecords = {};
            session.attendanceRecords.forEach(record => {
                if (!studentRecords[record.studentRoll]) {
                    studentRecords[record.studentRoll] = [];
                }
                studentRecords[record.studentRoll].push(record);
            });
            
            Object.entries(studentRecords).forEach(([studentRoll, records]) => {
                const studentDiv = document.createElement('div');
                studentDiv.className = 'p-3 border border-gray-200 rounded-lg';
                studentDiv.innerHTML = `
                    <div class="font-medium mb-2">${studentRoll}</div>
                    <div class="text-sm text-gray-600">
                        ${records.map(r => `Period ${r.period}: ${r.status} (${r.method})`).join(', ')}
                    </div>
                `;
                recordsDiv.appendChild(studentDiv);
            });
        }
    } catch (error) {
        console.error('Error updating attendance records:', error);
    }
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('ClassSync Integrated Dashboard loaded');
    
    // Initialize mobile menu
    initMobileMenu();
    
    // Initialize user menu
    initUserMenu();
    
    // Initialize WebSocket
    initWebSocket();
    
    // Start with student view
    switchRole('student');
    
    // Show dashboard section by default
    showSection('dashboard');
}); 