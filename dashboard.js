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

// Initialize login form
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
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
                    loginError.textContent = data.message || 'Login failed.';
                    loginError.classList.remove('hidden');
                }
            } catch (error) {
                console.error('Login error:', error);
                loginError.textContent = 'Network error. Please try again.';
                loginError.classList.remove('hidden');
            }
        });
    }
});

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
    ['studentView', 'facultyView', 'adminView'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    });
    const roleView = document.getElementById(`${role}View`);
    if (roleView) roleView.classList.remove('hidden');
    showSection(role);
}

// Update user information display
function updateUserInfo() {
    if (currentUser) {
        const displayName = currentUser.name || (currentRole === 'student' ? `Student ${currentUser.roll}` : `Prof. ${currentUser.roll}`);
        const roleDisplay = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
        
        const userNameElement = document.getElementById('userName');
        const userRoleElement = document.getElementById('userRole');
        const headerUserNameElement = document.getElementById('headerUserName');
        
        if (userNameElement) userNameElement.textContent = displayName;
        if (userRoleElement) userRoleElement.textContent = roleDisplay;
        if (headerUserNameElement) headerUserNameElement.textContent = displayName.split(' ')[0];
    }
}

// Show different sections
function showSection(section) {
    ['dashboardSection', 'attendanceSection', 'timetableSection', 'notificationsSection'].forEach(s => {
        const element = document.getElementById(s);
        if (element) element.classList.add('hidden');
    });
    const sectionElement = document.getElementById(`${section}Section`);
    if (sectionElement) sectionElement.classList.remove('hidden');
    
    const pageTitleElement = document.getElementById('pageTitle');
    if (pageTitleElement) {
        pageTitleElement.textContent = section.charAt(0).toUpperCase() + section.slice(1);
    }
    
    loadSectionContent(section);
}

// Load section content
function loadSectionContent(section) {
    if (section === 'dashboard') {
        loadDashboardContent(currentRole);
    } else if (section === 'attendance') {
        loadAttendanceContent();
    } else if (section === 'timetable') {
        loadTimetableContent();
    }
}

// Load dashboard content based on role
async function loadDashboardContent(role) {
    if (role === 'admin') {
        // Fetch and display user counts for the admin dashboard
        try {
            const response = await fetch('/api/admin/users');
            const data = await response.json();
            if (data.success) {
                const students = data.users.filter(u => u.role === 'student').length;
                const faculty = data.users.filter(u => u.role === 'faculty').length;
                document.getElementById('student-count').textContent = students;
                document.getElementById('faculty-count').textContent = faculty;
                // Also load the user management table
                populateUserTable(data.users);
            }
        } catch (error) {
            console.error("Failed to load user stats:", error);
        }
    } else if (role === 'student') {
        // Load current and next class information for students
        await loadStudentDashboardClasses();
    } else if (role === 'faculty') {
        // Load faculty dashboard information
        await loadFacultyDashboardClasses();
    }
}

// Load student dashboard classes
async function loadStudentDashboardClasses() {
    if (!currentUser || currentRole !== 'student') return;
    
    try {
        const { branch, year, section } = currentUser;
        const response = await fetch(`/api/timetable/student?branch=${branch}&year=${year}&section=${section}`);
        const data = await response.json();
        
        if (data.success && data.timetable.length > 0) {
            const currentTime = new Date();
            const currentDay = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
            const currentTimeStr = currentTime.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false 
            });
            
            // Get today's classes
            const todayClasses = data.timetable.filter(entry => entry.day === currentDay);
            
            // Sort classes by time
            const timeSlots = TIME_SLOTS.map(slot => timeStringToMinutes(slot.start));
            todayClasses.sort((a, b) => timeSlots.indexOf(timeStringToMinutes(a.startTime)) - timeSlots.indexOf(timeStringToMinutes(b.startTime)));
            
            let currentClass = null;
            let nextClass = null;
            
            // Find current class
            for (let i = 0; i < todayClasses.length; i++) {
                const classTime = todayClasses[i].startTime;
                const classEndTime = getClassEndTime(classTime);
                
                if (timeStringToMinutes(currentTimeStr) >= timeStringToMinutes(classTime) && timeStringToMinutes(currentTimeStr) < timeStringToMinutes(classEndTime)) {
                    currentClass = todayClasses[i];
                    nextClass = todayClasses[i + 1] || null;
                    break;
                } else if (timeStringToMinutes(currentTimeStr) < timeStringToMinutes(classTime)) {
                    nextClass = todayClasses[i];
                    break;
                }
            }
            
            // Update display
            if (currentClass) {
                updateClassDisplay(
                    currentClass.subject,
                    `${currentClass.startTime} - ${getClassEndTime(currentClass.startTime)}`,
                    `Room ${currentClass.room}`,
                    nextClass ? nextClass.subject : 'No next class',
                    nextClass ? `${nextClass.startTime} - ${getClassEndTime(nextClass.startTime)}` : '',
                    nextClass ? `Room ${nextClass.room}` : ''
                );
            } else if (nextClass) {
                updateClassDisplay(
                    'No current class',
                    '',
                    '',
                    nextClass.subject,
                    `${nextClass.startTime} - ${getClassEndTime(nextClass.startTime)}`,
                    `Room ${nextClass.room}`
                );
            } else {
                updateClassDisplay('No classes today', '', '', 'No classes today', '', '');
            }
        } else {
            updateClassDisplay('No timetable found', '', '', 'No timetable found', '', '');
        }
    } catch (error) {
        console.error("Failed to load dashboard classes:", error);
        updateClassDisplay('Error loading classes', '', '', 'Error loading classes', '', '');
    }
}

// Load faculty dashboard classes
async function loadFacultyDashboardClasses() {
    if (!currentUser || currentRole !== 'faculty') return;
    
    try {
        const response = await fetch(`/api/timetable/faculty/${currentUser.roll}`);
        const data = await response.json();
        
        if (data.success && data.timetable.length > 0) {
            const currentTime = new Date();
            const currentDay = currentTime.toLocaleDateString('en-US', { weekday: 'long' });
            const currentTimeStr = currentTime.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit', 
                hour12: false 
            });
            
            // Get today's classes
            const todayClasses = data.timetable.filter(entry => entry.day === currentDay);
            
            // Sort classes by time
            const timeSlots = TIME_SLOTS.map(slot => timeStringToMinutes(slot.start));
            todayClasses.sort((a, b) => timeSlots.indexOf(timeStringToMinutes(a.startTime)) - timeSlots.indexOf(timeStringToMinutes(b.startTime)));
            
            let nextClass = null;
            
            // Find next class
            for (let i = 0; i < todayClasses.length; i++) {
                const classTime = todayClasses[i].startTime;
                if (timeStringToMinutes(currentTimeStr) < timeStringToMinutes(classTime)) {
                    nextClass = todayClasses[i];
                    break;
                }
            }
            
            // Update faculty dashboard
            const nextClassSubjectEl = document.getElementById('faculty-next-class-subject');
            const nextClassTimeEl = document.getElementById('faculty-next-class-time');
            const nextClassRoomEl = document.getElementById('faculty-next-class-room');
            
            if (nextClass) {
                if (nextClassSubjectEl) nextClassSubjectEl.textContent = nextClass.subject;
                if (nextClassTimeEl) nextClassTimeEl.textContent = `${nextClass.startTime} - ${getClassEndTime(nextClass.startTime)}`;
                if (nextClassRoomEl) nextClassRoomEl.textContent = `Room ${nextClass.room}`;
            } else {
                if (nextClassSubjectEl) nextClassSubjectEl.textContent = 'No more classes today';
                if (nextClassTimeEl) nextClassTimeEl.textContent = '';
                if (nextClassRoomEl) nextClassRoomEl.textContent = '';
            }
            
            // Update today's schedule
            const scheduleEl = document.getElementById('faculty-today-schedule');
            if (scheduleEl) {
                if (todayClasses.length > 0) {
                    scheduleEl.innerHTML = todayClasses.map(cls => 
                        `<div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <span class="font-medium">${cls.subject}</span>
                            <span class="text-sm text-gray-600">${cls.startTime} - ${getClassEndTime(cls.startTime)} | Room ${cls.room}</span>
                        </div>`
                    ).join('');
                } else {
                    scheduleEl.innerHTML = '<p class="text-gray-500">No classes scheduled today</p>';
                }
            }
        } else {
            const nextClassSubjectEl = document.getElementById('faculty-next-class-subject');
            if (nextClassSubjectEl) nextClassSubjectEl.textContent = 'No timetable found';
        }
    } catch (error) {
        console.error("Failed to load faculty dashboard classes:", error);
    }
}

// Helper function to get class end time
function getClassEndTime(startTime) {
    const timeMap = {
        '9:30': '10:20',
        '10:20': '11:10',
        '11:10': '12:00',
        '12:00': '12:30',
        '12:30': '1:20',
        '1:20': '2:10',
        '2:10': '3:00'
    };
    return timeMap[startTime] || 'Unknown';
}

// Helper function to update class display
function updateClassDisplay(currentSubject, currentTime, currentRoom, nextSubject, nextTime, nextRoom) {
    const currentSubjectEl = document.getElementById('current-class-subject');
    const currentTimeEl = document.getElementById('current-class-time');
    const currentRoomEl = document.getElementById('current-class-room');
    const nextSubjectEl = document.getElementById('next-class-subject');
    const nextTimeEl = document.getElementById('next-class-time');
    const nextRoomEl = document.getElementById('next-class-room');
    
    if (currentSubjectEl) currentSubjectEl.textContent = currentSubject;
    if (currentTimeEl) currentTimeEl.textContent = currentTime;
    if (currentRoomEl) currentRoomEl.textContent = currentRoom;
    if (nextSubjectEl) nextSubjectEl.textContent = nextSubject;
    if (nextTimeEl) nextTimeEl.textContent = nextTime;
    if (nextRoomEl) nextRoomEl.textContent = nextRoom;
}

// Helper: Convert 12-hour time string to minutes since midnight
function timeStringToMinutes(timeStr) {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
}

// Centralized Time Slot Mapping
const TIME_SLOTS = [
    { period: 1, start: '9:30 AM', end: '10:20 AM' },
    { period: 2, start: '10:20 AM', end: '11:10 AM' },
    { period: 3, start: '11:10 AM', end: '12:00 PM' },
    { period: 4, start: '12:00 PM', end: '12:50 PM' },
    { period: 5, start: '1:50 PM', end: '2:40 PM' },
    { period: 6, start: '2:40 PM', end: '3:30 PM' },
    { period: 7, start: '3:30 PM', end: '4:20 PM' }
];

// Admin User Management Functions
function populateUserTable(users) {
    const tableBody = document.getElementById('user-list-table-body');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    users.forEach(user => {
        const row = tableBody.insertRow();
        row.innerHTML = `
            <td class="px-6 py-4">${user.name || 'N/A'}</td>
            <td class="px-6 py-4"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'student' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}">${user.role}</span></td>
            <td class="px-6 py-4">${user.department || 'N/A'}</td>
            <td class="px-6 py-4">${user.roll}</td>
            <td class="px-6 py-4"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Active</span></td>
            <td class="px-6 py-4 text-right text-sm font-medium">
                <button onclick="openUserModal(event)" data-user='${JSON.stringify(user)}' class="text-indigo-600 hover:text-indigo-900"><i class="fas fa-edit"></i></button>
                <button onclick="deleteUser('${user._id}')" class="text-red-600 hover:text-red-900 ml-4"><i class="fas fa-trash"></i></button>
            </td>
        `;
    });
}

function openUserModal(event) {
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');
    form.reset();
    document.getElementById('user-id').value = '';
    
    if (event && event.target.closest('button').dataset.user) {
        // Edit mode
        const user = JSON.parse(event.target.closest('button').dataset.user);
        document.getElementById('user-modal-title').textContent = 'Edit User';
        document.getElementById('user-id').value = user._id;
        document.getElementById('user-name').value = user.name;
        document.getElementById('user-email').value = user.email;
        document.getElementById('user-role').value = user.role;
        document.getElementById('user-department').value = user.department;
        document.getElementById('user-roll').value = user.roll;
        document.getElementById('user-password').placeholder = "Leave blank to keep unchanged";
    } else {
        // Add mode
        document.getElementById('user-modal-title').textContent = 'Add New User';
        document.getElementById('user-password').placeholder = "Required";
    }
    
    modal.classList.remove('hidden');
}

function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
}

async function handleUserFormSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('user-id').value;
    const userData = {
        name: document.getElementById('user-name').value,
        email: document.getElementById('user-email').value,
        role: document.getElementById('user-role').value,
        department: document.getElementById('user-department').value,
        roll: document.getElementById('user-roll').value,
        password: document.getElementById('user-password').value,
    };

    const url = userId ? `/api/admin/users/${userId}` : '/api/admin/users';
    const method = userId ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });
        const result = await response.json();
        if (result.success) {
            alert(`User ${userId ? 'updated' : 'created'} successfully!`);
            closeUserModal();
            loadDashboardContent('admin'); // Refresh user list
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
        const response = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            alert('User deleted successfully!');
            loadDashboardContent('admin'); // Refresh user list
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
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

// Logout function
function logout() {
    window.location.reload();
}

// Load attendance content
function loadAttendanceContent() {
    const content = document.getElementById('attendanceContent');
    if (!content) return;
    
    if (currentRole === 'student') {
        content.innerHTML = `<div id="student-attendance-summary" class="mb-8"><div class="bg-white rounded-xl shadow-md p-6 mb-6 text-center"><h3 class="text-lg font-medium text-gray-500">Overall Attendance</h3><p id="overall-percentage" class="text-5xl font-bold text-indigo-600 my-2">--%</p><p id="overall-details" class="text-gray-600">Attended -- out of -- classes</p></div><h3 class="text-xl font-bold mb-4">Subject-wise Attendance</h3><div id="subject-wise-list" class="grid grid-cols-1 md:grid-cols-2 gap-4"><p class="text-gray-500">Loading...</p></div></div><hr class="my-8"><div class="text-center"><h3 class="text-xl font-bold mb-4">Mark Your Attendance</h3><button onclick="markAttendance()" class="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"><i class="fas fa-bluetooth mr-2"></i>Mark Attendance</button><div id="attendance-status" class="mt-4 p-3 rounded-lg"></div></div>`;
        loadStudentAttendanceSummary(currentUser.roll);
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
        content.innerHTML = `<h3 class="text-xl font-bold mb-4">View Attendance Records</h3><div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg"><div><label for="branchFilter">Branch:</label><select id="branchFilter" class="mt-1 block w-full py-2 px-3 border rounded-md"><option value="">All</option><option value="CSE">CSE</option><option value="IT">IT</option></select></div><div><label for="yearFilter">Year:</label><select id="yearFilter" class="mt-1 block w-full py-2 px-3 border rounded-md"><option value="">All</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></div><div><label for="sectionFilter">Section:</label><select id="sectionFilter" class="mt-1 block w-full py-2 px-3 border rounded-md"><option value="">All</option><option value="A">A</option><option value="B">B</option></select></div><div><label for="dateFilter">Date:</label><input type="date" id="dateFilter" class="mt-1 block w-full py-2 px-3 border rounded-md"></div></div><div class="flex justify-between items-center mb-4"><button id="applyFilterBtn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg">View Attendance</button><button id="downloadBtn" class="px-4 py-2 bg-green-600 text-white rounded-lg">Download as Excel</button></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-50"><tr><th>Roll Number</th><th>Status</th><th>Date</th><th>Timestamp</th></tr></thead><tbody id="admin-attendance-table"></tbody></table></div>`;
        document.getElementById('applyFilterBtn').addEventListener('click', fetchAdminAttendance);
        document.getElementById('downloadBtn').addEventListener('click', downloadAttendance);
    }
}

// Load timetable content
function loadTimetableContent() {
    const content = document.getElementById('timetableContent');
    if (!content) return;
    
    content.innerHTML = '';
    if (currentRole === 'admin') {
        const template = document.getElementById('admin-timetable-editor');
        const editor = template.content.cloneNode(true);
        content.appendChild(editor);
        initAdminTimetableEditor();
    } else if (currentRole === 'faculty') {
        // Show the new card-based timetable
        const timetableDiv = document.createElement('div');
        timetableDiv.id = 'faculty-weekly-timetable';
        content.appendChild(timetableDiv);
        renderFacultyWeeklyTimetable();
    } else {
        content.innerHTML = `<div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-gray-50"><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tuesday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wednesday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thursday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Friday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saturday</th></tr></thead><tbody id="timetable-body" class="bg-white divide-y divide-gray-200"><tr><td colspan="7" class="text-center p-4">Loading...</td></tr></tbody></table></div>`;
        fetchUserTimetable();
    }
}

// Fetch and display user timetable
async function fetchUserTimetable() {
    if (!currentUser) return;
    let url = '';
    if (currentRole === 'student') {
        const { branch, year, section } = currentUser;
        url = `/api/timetable/student?branch=${branch}&year=${year}&section=${section}`;
    } else if (currentRole === 'faculty') {
        url = `/api/timetable/faculty/${currentUser.roll}`;
    }
    try {
        const response = await fetch(url);
        const data = await response.json();
        const tableBody = document.getElementById('timetable-body');
        tableBody.innerHTML = '';
        if (data.success && data.timetable.length > 0) {
            // Get unique faculty IDs to fetch names
            const facultyIds = [...new Set(data.timetable.map(entry => entry.facultyId).filter(id => id))];
            let facultyNames = {};
            
            // Fetch faculty names if we're showing student timetable
            if (currentRole === 'student' && facultyIds.length > 0) {
                try {
                    const facultyResponse = await fetch('/api/faculty/names', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ facultyIds })
                    });
                    const facultyData = await facultyResponse.json();
                    if (facultyData.success) {
                        facultyNames = facultyData.facultyNames;
                    }
                } catch (error) {
                    console.error("Failed to fetch faculty names:", error);
                }
            }
            
            const groupedByTime = data.timetable.reduce((acc, entry) => {
                if (!acc[entry.startTime]) acc[entry.startTime] = {};
                acc[entry.startTime][entry.day] = entry;
                return acc;
            }, {});
            for (const time in groupedByTime) {
                const row = tableBody.insertRow();
                row.innerHTML = `<td class="px-6 py-4 font-medium">${time}</td>`;
                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                days.forEach(day => {
                    const cell = row.insertCell();
                    cell.className = 'px-6 py-4';
                    const entry = groupedByTime[time][day];
                    if (entry) {
                        const facultyDisplay = currentRole === 'student' && entry.facultyId ? 
                            (facultyNames[entry.facultyId] || entry.facultyId) : entry.facultyId || '';
                        cell.innerHTML = `<div class="timetable-cell bg-indigo-50 border-l-4 border-indigo-500 p-2 rounded"><p class="font-semibold text-indigo-800">${entry.subject}</p><p class="text-xs text-gray-600">${entry.room}</p>${currentRole === 'student' && facultyDisplay ? `<p class="text-xs text-gray-500">${facultyDisplay}</p>` : ''}</div>`;
                    }
                });
            }
        } else {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-4">No timetable found.</td></tr>`;
        }
    } catch (error) { 
        console.error("Failed to fetch timetable:", error); 
    }
}

// Render the new faculty weekly timetable (card-based)
async function renderFacultyWeeklyTimetable() {
    const timetableDiv = document.getElementById('faculty-weekly-timetable');
    if (!timetableDiv) return;
    timetableDiv.innerHTML = '';
    timetableDiv.className = 'grid grid-cols-1 md:grid-cols-6 gap-4';

    // Days of week (Monday to Saturday)
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    // Fetch timetable
    let timetable = [];
    try {
        const response = await fetch(`/api/timetable/faculty/${currentUser.roll}`);
        const data = await response.json();
        if (data.success && data.timetable.length > 0) {
            timetable = data.timetable;
        }
    } catch (e) {
        timetableDiv.innerHTML = '<p class="text-red-500">Failed to load timetable.</p>';
        return;
    }
    // Group by day
    const grouped = {};
    days.forEach(day => grouped[day] = []);
    timetable.forEach(entry => {
        if (grouped[entry.day]) grouped[entry.day].push(entry);
    });
    // Sort each day's classes by start time
    const timeOrder = TIME_SLOTS.map(slot => timeStringToMinutes(slot.start));
    days.forEach(day => {
        grouped[day].sort((a, b) => timeOrder.indexOf(timeStringToMinutes(a.startTime)) - timeOrder.indexOf(timeStringToMinutes(b.startTime)));
    });
    // Render columns
    days.forEach(day => {
        const col = document.createElement('div');
        col.className = 'bg-gray-50 rounded-lg shadow p-2 flex flex-col';
        col.innerHTML = `<div class="text-center font-bold text-lg py-2 border-b mb-2">${day}</div>`;
        if (grouped[day].length === 0) {
            col.innerHTML += '<div class="text-gray-400 text-center py-4">No Classes</div>';
        } else {
            grouped[day].forEach(cls => {
                col.innerHTML += `
                <div class="mb-3 p-3 rounded-lg shadow-sm border-l-4" style="border-color: #6366f1; background: #f8fafc;">
                    <div class="font-semibold text-indigo-800">${cls.subject}</div>
                    <div class="text-xs text-gray-600">${cls.startTime} - ${getClassEndTime(cls.startTime)}</div>
                    <div class="text-xs text-gray-500">Room ${cls.room}</div>
                </div>`;
            });
        }
        timetableDiv.appendChild(col);
    });
}

// Admin Timetable Editor Functions
function initAdminTimetableEditor() {
    const gridBody = document.getElementById('admin-timetable-grid-body');
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    gridBody.innerHTML = '';
    days.forEach(day => {
        const row = document.createElement('tr');
        row.className = "bg-white border-b";
        row.innerHTML = `<th class="px-2 py-2 font-medium text-gray-900">${day}</th>`;
        let cellContent = '';
        for (let i = 1; i <= 7; i++) {
            cellContent += `<td class="p-1"><input class="interactive-timetable-input" placeholder="Subject" data-day="${day}" data-period="${i}"><input class="interactive-timetable-input" placeholder="Faculty ID" data-day="${day}" data-period="${i}"><input class="interactive-timetable-input" placeholder="Room" data-day="${day}" data-period="${i}"></td>`;
            if (i === 4) cellContent += `<td class="bg-gray-100 text-center text-xs font-semibold">LUNCH</td>`;
        }
        row.innerHTML += cellContent;
        gridBody.appendChild(row);
    });
    document.getElementById('admin-view-timetable-btn').addEventListener('click', handleAdminViewTimetable);
    document.getElementById('admin-save-timetable-btn').addEventListener('click', handleAdminSaveTimetable);
}

async function handleAdminViewTimetable() {
    const branch = document.getElementById('admin-branch-select').value;
    const year = document.getElementById('admin-year-select').value;
    const section = document.getElementById('admin-section-select').value;
    document.querySelectorAll('.interactive-timetable-input').forEach(input => input.value = '');
    try {
        const response = await fetch(`/api/timetable/student?branch=${branch}&year=${year}&section=${section}`);
        const data = await response.json();
        if (data.success && data.timetable) {
            const periodMap = { '9:30': 1, '10:20': 2, '11:10': 3, '12:00': 4, '12:30': 5, '1:20': 6, '2:10': 7 };
            data.timetable.forEach(slot => {
                const period = periodMap[slot.startTime];
                if (period) {
                    const sel = (p, placeholder) => `input[data-day="${slot.day.toUpperCase()}"][data-period="${p}"][placeholder="${placeholder}"]`;
                    document.querySelector(sel(period, "Subject")).value = slot.subject;
                    document.querySelector(sel(period, "Faculty ID")).value = slot.facultyId;
                    document.querySelector(sel(period, "Room")).value = slot.room;
                }
            });
            alert('Timetable loaded!');
        } else { 
            alert('No timetable found.'); 
        }
    } catch (error) {
        console.error('Failed to fetch timetable:', error);
        alert('Error loading timetable.');
    }
}

async function handleAdminSaveTimetable() {
    if (!confirm('Are you sure you want to overwrite this timetable?')) return;
    const branch = document.getElementById('admin-branch-select').value;
    const year = document.getElementById('admin-year-select').value;
    const section = document.getElementById('admin-section-select').value;
    const timetableData = [];
    const timeMap = { 1: '9:30', 2: '10:20', 3: '11:10', 4: '12:00', 5: '12:30', 6: '1:20', 7: '2:10' };
    document.querySelectorAll('#admin-timetable-grid-body tr').forEach(row => {
        const day = row.querySelector('th').textContent;
        for (let period = 1; period <= 7; period++) {
            const sel = (p, placeholder) => `input[data-day="${day}"][data-period="${p}"][placeholder="${placeholder}"]`;
            const subject = row.querySelector(sel(period, "Subject"))?.value.trim();
            if (subject) {
                timetableData.push({
                    day: day.charAt(0).toUpperCase() + day.slice(1).toLowerCase(),
                    startTime: timeMap[period],
                    subject,
                    facultyId: row.querySelector(sel(period, "Faculty ID")).value.trim(),
                    room: row.querySelector(sel(period, "Room")).value.trim()
                });
            }
        }
    });
    try {
        const response = await fetch('/api/admin/timetable/bulk-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branch, year, section, timetableEntries: timetableData })
        });
        const result = await response.json();
        if (result.success) {
            alert('Timetable saved successfully!');
        } else { 
            throw new Error(result.message || 'Failed to save.'); 
        }
    } catch (error) {
        console.error('Failed to save timetable:', error);
        alert(`Error saving timetable: ${error.message}`);
    }
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

// Load student attendance summary
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
                subjectListDiv.innerHTML = `<p class="text-gray-500">No timetable data for percentage calculation.</p>`;
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

// Admin attendance functions
async function fetchAdminAttendance() {
    const query = new URLSearchParams({
        branch: document.getElementById('branchFilter').value,
        year: document.getElementById('yearFilter').value,
        section: document.getElementById('sectionFilter').value,
        date: document.getElementById('dateFilter').value
    }).toString();
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
            tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">No records found.</td></tr>`;
        }
    } catch (error) { 
        console.error("Failed to fetch admin attendance:", error); 
    }
}

function downloadAttendance() {
    const query = new URLSearchParams({
        branch: document.getElementById('branchFilter').value,
        year: document.getElementById('yearFilter').value,
        section: document.getElementById('sectionFilter').value,
        date: document.getElementById('dateFilter').value
    }).toString();
    window.open(`/api/admin/attendance/export?${query}`, '_blank');
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
            recordsDiv.innerHTML = '';
            
            data.session.attendanceRecords.forEach(record => {
                const recordDiv = document.createElement('div');
                recordDiv.className = 'p-3 border border-gray-200 rounded-lg';
                recordDiv.innerHTML = `
                    <strong>Student:</strong> ${record.studentRoll} | 
                    <strong>Period:</strong> ${record.period} | 
                    <strong>Status:</strong> ${record.status} | 
                    <strong>Method:</strong> ${record.method}
                `;
                recordsDiv.appendChild(recordDiv);
            });
        }
    } catch (error) {
        console.error('Error updating attendance records:', error);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('ClassSync App Initialized');
    // Event listeners for modal and user management that are always present
    const cancelUserBtn = document.getElementById('cancel-user-btn');
    const userForm = document.getElementById('user-form');
    
    if (cancelUserBtn) {
        cancelUserBtn.addEventListener('click', closeUserModal);
    }
    
    if (userForm) {
        userForm.addEventListener('submit', handleUserFormSubmit);
    }
}); 