// ClassSync Integrated Application JavaScript (Complete & Final Version)

// ========================================================
//          GLOBAL VARIABLES & INITIAL SETUP
// ========================================================
let currentUser = null;
let currentRole = null;
let ws = null;
let isBluetoothSupported = 'bluetooth' in navigator;

console.log(`Web Bluetooth API Supported: ${isBluetoothSupported}`);

// Centralized Time Slot Mapping (Period Number to Start/End Time, 12-hour format with AM/PM)
const TIME_SLOTS = [
  { period: 1, start: '9:30 AM', end: '10:20 AM' },
  { period: 2, start: '10:20 AM', end: '11:10 AM' },
  { period: 3, start: '11:10 AM', end: '12:00 PM' },
  { period: 4, start: '12:00 PM', end: '12:50 PM' },
  { period: 5, start: '1:50 PM', end: '2:40 PM' },
  { period: 6, start: '2:40 PM', end: '3:30 PM' },
  { period: 7, start: '3:30 PM', end: '4:20 PM' }
];

// ========================================================
//          WEBSOCKET SETUP & HANDLERS
// ========================================================

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);
    ws.onopen = () => console.log('WebSocket connected');
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };
    ws.onclose = () => setTimeout(initWebSocket, 3000);
    ws.onerror = (error) => console.error('WebSocket error:', error);
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'ATTENDANCE_RESPONSE': handleAttendanceResponse(data); break;
        case 'DEVICE_FOUND': handleDeviceFound(data); break;
        case 'ATTENDANCE_MARKED': handleAttendanceMarked(data); break;
        case 'SCAN_STARTED': handleScanStarted(data); break;
        case 'SCAN_STOPPED': handleScanStopped(data); break;
    }
}

function handleAttendanceResponse(data) {
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        statusElement.textContent = data.message;
        statusElement.className = data.success ? 'text-green-600 font-medium' : 'text-red-600 font-medium';
        if (data.success && currentRole === 'student') {
            loadStudentAttendanceSummary(currentUser.roll);
        }
    }
}

function handleDeviceFound(data) { addDiscoveredDevice(data.device); }
function handleAttendanceMarked(data) {
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.textContent = `Attendance marked for ${data.roll} (${data.deviceId})`;
        statusElement.className = 'text-green-600 font-medium';
    }
    loadFacultyAttendance();
}
function handleScanStarted(data) {
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.textContent = data.message;
        statusElement.className = 'text-green-600 font-medium';
    }
}
function handleScanStopped(data) {
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.textContent = data.message;
        statusElement.className = 'text-gray-600 font-medium';
    }
}

// ========================================================
//          INITIALIZATION & CORE APP LOGIC
// ========================================================

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
            loginError.textContent = data.message || 'Login failed.';
            loginError.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = 'Network error. Please try again.';
        loginError.classList.remove('hidden');
    }
});

function showDashboard() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    showRoleView(currentRole);
    initMobileMenu();
    initUserMenu();
}

function showRoleView(role) {
    ['studentView', 'facultyView', 'adminView'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(`${role}View`).classList.remove('hidden');
    loadDashboardContent(role);
    showSection('dashboard');
    setupDashboardRefresh(); // Set up periodic refresh
}

function updateUserInfo() {
    if (currentUser) {
        const displayName = currentUser.name || (currentRole === 'student' ? `Student ${currentUser.roll}` : `Prof. ${currentUser.roll}`);
        const roleDisplay = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
        document.getElementById('userName').textContent = displayName;
        document.getElementById('userRole').textContent = roleDisplay;
        document.getElementById('headerUserName').textContent = displayName.split(' ')[0];
    }
}

function showSection(section) {
    ['dashboardSection', 'attendanceSection', 'timetableSection', 'notificationsSection'].forEach(s => {
        document.getElementById(s).classList.add('hidden');
    });
    document.getElementById(`${section}Section`).classList.remove('hidden');
    document.getElementById('pageTitle').textContent = section.charAt(0).toUpperCase() + section.slice(1);
    loadSectionContent(section);
}

// ========================================================
//          CONTENT LOADING & FEATURE LOGIC
// ========================================================

function loadSectionContent(section) {
    if (section === 'dashboard') loadDashboardContent(currentRole);
    if (section === 'attendance') loadAttendanceContent();
    if (section === 'timetable') loadTimetableContent();
}

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

// --- ATTENDANCE SECTION ---
function loadAttendanceContent() {
    const content = document.getElementById('attendanceContent');
    if (currentRole === 'student') {
        // ... (student content remains the same)
        content.innerHTML = `<div id="student-attendance-summary" class="mb-8"><div class="bg-white rounded-xl shadow-md p-6 mb-6 text-center"><h3 class="text-lg font-medium text-gray-500">Overall Attendance</h3><p id="overall-percentage" class="text-5xl font-bold text-indigo-600 my-2">--%</p><p id="overall-details" class="text-gray-600">Attended -- out of -- classes</p></div><h3 class="text-xl font-bold mb-4">Subject-wise Attendance</h3><div id="subject-wise-list" class="grid grid-cols-1 md:grid-cols-2 gap-4"><p class="text-gray-500">Loading...</p></div></div><hr class="my-8"><div class="text-center"><h3 class="text-xl font-bold mb-4">Mark Your Attendance</h3><button onclick="markAttendance()" class="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"><i class="fas fa-bluetooth mr-2"></i>Mark Attendance</button><div id="attendance-status" class="mt-4 p-3 rounded-lg"></div></div>`;
        loadStudentAttendanceSummary(currentUser.roll);
    } else if (currentRole === 'faculty') {
        // Show the new faculty form placed in HTML
        const form = document.getElementById('faculty-attendance-form');
        if (form) form.classList.remove('hidden');
        setupFacultyAttendanceUI();
    } else if (currentRole === 'admin') {
        // For admin, we don't need to load HTML from JS anymore since it's in classsyncc.html
        // We just need to initialize the dynamic parts.
        initializeAdminAttendanceDashboard();
    }
}

// --- TIMETABLE SECTION ---
function loadTimetableContent() {
    const content = document.getElementById('timetableContent');
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
        const response = await fetch(`/api/timetable/faculty/${currentUser.roll}${currentUser.semester ? `?semester=${encodeURIComponent(currentUser.semester)}` : ''}`);
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
    const timeOrder = ['9:30','10:20','11:10','12:00','1:50','2:40','3:30'].map(t => timeStringToMinutes(`${t} AM`).toString());
    // Override comparator using explicit order above
    days.forEach(day => {
        grouped[day].sort((a, b) => {
            const aKey = String(a.startTime).split(' ')[0];
            const bKey = String(b.startTime).split(' ')[0];
            return ['9:30','10:20','11:10','12:00','1:50','2:40','3:30'].indexOf(aKey) - ['9:30','10:20','11:10','12:00','1:50','2:40','3:30'].indexOf(bKey);
        });
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

// ========================================================
//          ADMIN: INTERACTIVE TIMETABLE EDITOR
// ========================================================

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
    const semester = document.getElementById('admin-semester-select').value;
    document.querySelectorAll('.interactive-timetable-input').forEach(input => input.value = '');
    try {
        const response = await fetch(`/api/timetable/student?branch=${branch}&year=${year}&section=${section}&semester=${encodeURIComponent(semester)}`);
        const data = await response.json();
        if (data.success && data.timetable) {
            const periodMap = { '9:30': 1, '10:20': 2, '11:10': 3, '12:00': 4, '1:50': 5, '2:40': 6, '3:30': 7 };
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
        } else { alert('No timetable found.'); }
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
    const semester = document.getElementById('admin-semester-select').value;
    const timetableData = [];
    const timeMap = { 1: '9:30', 2: '10:20', 3: '11:10', 4: '12:00', 5: '1:50', 6: '2:40', 7: '3:30' };
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
            body: JSON.stringify({ branch, year, section, semester, timetableEntries: timetableData })
        });
        const result = await response.json();
        if (result.success) {
            alert('Timetable saved successfully!');
        } else { throw new Error(result.message || 'Failed to save.'); }
    } catch (error) {
        console.error('Failed to save timetable:', error);
        alert(`Error saving timetable: ${error.message}`);
    }
}

// ========================================================
//          ADMIN: USER MANAGEMENT
// ========================================================

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

// ========================================================
//          EXISTING HELPER & UTILITY FUNCTIONS
// ========================================================

async function fetchUserTimetable() {
    if (!currentUser) return;
    let url = '';
    if (currentRole === 'student') {
        const { branch, year, section, semester } = currentUser;
        const query = new URLSearchParams({ branch, year, section });
        if (semester) query.set('semester', semester);
        url = `/api/timetable/student?${query.toString()}`;
    } else if (currentRole === 'faculty') {
        url = `/api/timetable/faculty/${currentUser.roll}${currentUser.semester ? `?semester=${encodeURIComponent(currentUser.semester)}` : ''}`;
    }
    try {
        const response = await fetch(url);
        const data = await response.json();
        const tableBody = document.getElementById('timetable-body');
        tableBody.innerHTML = '';
        if (data.success && data.timetable.length > 0) {
            // Get unique faculty IDs to fetch names
            const facultyIds = [...new Set(data.timetable.map(entry => entry.facultyId).filter(id => id))];
            const facultyNames = {};
            
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
    } catch (error) { console.error("Failed to fetch timetable:", error); }
}

// Helper: Convert 12-hour time string (e.g., '1:50 PM') to minutes since midnight
function timeStringToMinutes(timeStr) {
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

// Function to load current and next classes for student dashboard
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
            
            // If no current class found, check if we're between classes
            if (!currentClass && !nextClass && todayClasses.length > 0) {
                const lastClass = todayClasses[todayClasses.length - 1];
                const lastClassEndTime = getClassEndTime(lastClass.startTime);
                
                if (timeStringToMinutes(currentTimeStr) > timeStringToMinutes(lastClassEndTime)) {
                    // School day is over
                    updateClassDisplay('No more classes today', '', '', 'No more classes today', '', '');
                } else {
                    // Before first class
                    nextClass = todayClasses[0];
                    updateClassDisplay('No current class', '', '', nextClass.subject, `${nextClass.startTime} - ${getClassEndTime(nextClass.startTime)}`, `Room ${nextClass.room}`);
                }
            } else {
                // Update display with current and next class
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
            }
        } else {
            updateClassDisplay('No timetable found', '', '', 'No timetable found', '', '');
        }
    } catch (error) {
        console.error("Failed to load dashboard classes:", error);
        updateClassDisplay('Error loading classes', '', '', 'Error loading classes', '', '');
    }
}

// Helper function to get class end time
function getClassEndTime(startTime) {
    const timeMap = {
        '9:30': '10:20',
        '10:20': '11:10',
        '11:10': '12:00',
        '12:00': '12:50',
        '1:50': '2:40',
        '2:40': '3:30',
        '3:30': '4:20'
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

// Set up periodic refresh of dashboard classes
function setupDashboardRefresh() {
    if (currentRole === 'student' || currentRole === 'faculty') {
        // Refresh every 5 minutes
        setInterval(async () => {
            if (currentRole === 'student') {
                await loadStudentDashboardClasses();
            } else if (currentRole === 'faculty') {
                await loadFacultyDashboardClasses();
            }
        }, 5 * 60 * 1000); // 5 minutes
    }
}

// Function to load faculty dashboard classes
async function loadFacultyDashboardClasses() {
    if (!currentUser || currentRole !== 'faculty') return;
    
    try {
        const response = await fetch(`/api/timetable/faculty/${currentUser.roll}${currentUser.semester ? `?semester=${encodeURIComponent(currentUser.semester)}` : ''}`);
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

function markAttendance() {
    if (!isBluetoothSupported) { alert('Bluetooth not supported.'); return; }
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'BLUETOOTH_DEVICE_DISCOVERED', deviceId: currentUser.deviceId || `dev-${currentUser.roll}`, deviceName: 'Student Device', rssi: -65 + Math.random() * 20, roll: currentUser.roll }));
            setTimeout(() => {
                ws.send(JSON.stringify({ type: 'ATTENDANCE_REQUEST', roll: currentUser.roll, deviceId: currentUser.deviceId || `dev-${currentUser.roll}` }));
            }, 1000);
        }
    }, 1500);
}

function startAttendanceSession() {
    fetch('/api/attendance/session', { method: 'POST' });
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'FACULTY_SCAN_START' }));
    }
    document.getElementById('discovered-devices-list').innerHTML = '';
}

function addManualAttendance() {
    const roll = document.getElementById('manual-roll').value.trim();
    if (!roll) return;
    fetch('/api/attendance/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roll })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            document.getElementById('manual-roll').value = '';
            loadFacultyAttendance();
        } else { alert(data.message); }
    });
}

function loadFacultyAttendance() {
    fetch('/api/attendance/today').then(res => res.json()).then(data => {
        const list = document.getElementById('faculty-attendance-list');
        if (list) {
            list.innerHTML = data.attendance && data.attendance.length ? '' : '<div class="text-gray-500">No attendance yet.</div>';
            if (data.attendance) {
                data.attendance.forEach(rec => {
                    const div = document.createElement('div');
                    div.className = 'p-3 border rounded-lg';
                    div.innerHTML = `<strong>Roll:</strong> ${rec.roll} | <strong>Method:</strong> ${rec.status}`;
                    list.appendChild(div);
                });
            }
        }
    });
}

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
    } catch (error) { console.error("Failed to fetch admin attendance:", error); }
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
    } catch (error) { console.error("Failed to load summary:", error); }
}

function addDiscoveredDevice(device) {
    const list = document.getElementById('discovered-devices-list');
    if (!list) return;
    const li = document.createElement('li');
    li.innerHTML = `<strong>${device.deviceName || 'Unknown'}</strong><br>ID: ${device.deviceId}<br>Signal: ${device.rssi.toFixed(2)} dBm<br>Roll: ${device.roll || 'Unknown'}`;
    li.className = 'p-3 border rounded-lg mb-2 bg-blue-50';
    if (!document.querySelector(`[data-device-id="${device.deviceId}"]`)) {
        li.setAttribute('data-device-id', device.deviceId);
        list.appendChild(li);
    }
}

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

function initUserMenu() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenu = document.getElementById('userMenu');
    if (userMenuBtn && userMenu) {
        userMenuBtn.addEventListener('click', () => userMenu.classList.toggle('hidden'));
        document.addEventListener('click', (e) => {
            if (!userMenuBtn.contains(e.target) && !userMenu.contains(e.target)) {
                userMenu.classList.add('hidden');
            }
        });
    }
}

function logout() { window.location.reload(); }

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('ClassSync App Initialized');
    // Event listeners for modal and user management that are always present
    document.getElementById('cancel-user-btn').addEventListener('click', closeUserModal);
    document.getElementById('user-form').addEventListener('submit', handleUserFormSubmit);
    // If faculty is already logged in via persisted session, ensure UI setup runs
});

// =====================
// Faculty Attendance UI
// =====================
function setupFacultyAttendanceUI() {
  const dateEl = document.getElementById('fa-date');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  const loadSubjectsBtn = document.getElementById('fa-load-subjects');
  const subjectSel = document.getElementById('fa-subject');
  const periodsDiv = document.getElementById('fa-periods');
  const showBtn = document.getElementById('fa-show');
  const startScanBtn = document.getElementById('fa-start-scan');
  const stopScanBtn = document.getElementById('fa-stop-scan');
  const saveBtn = document.getElementById('fa-save');
  const statusEl = document.getElementById('fa-status');

  // helpers
  const getSelectedPeriods = () => Array.from(periodsDiv.querySelectorAll('input[type="checkbox"]:checked')).map(cb => Number(cb.value));

  // Populate periods checkboxes after subjects load
  function renderPeriods(periodList) {
    periodsDiv.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'text-sm font-medium text-gray-700';
    label.textContent = 'Periods:';
    periodsDiv.appendChild(label);
    const container = document.createElement('div');
    container.className = 'flex flex-wrap gap-3 mt-2';
    const all = periodList && periodList.length ? periodList : [1,2,3,4,5,6,7];
    all.forEach(p => {
      const wrap = document.createElement('label');
      wrap.className = 'flex items-center gap-1 text-sm';
      wrap.innerHTML = `<input type="checkbox" value="${p}"><span>Period ${p}</span>`;
      container.appendChild(wrap);
    });
    periodsDiv.appendChild(container);
  }

  async function loadSubjects() {
    if (!subjectSel) return;
    subjectSel.innerHTML = '<option value="">Loading...</option>';
    try {
      const facultyId = currentUser?.roll;
      const res = await fetch(`/api/faculty/subjects?facultyId=${encodeURIComponent(facultyId)}`);
      const data = await res.json();
      subjectSel.innerHTML = '<option value="">Select Subject</option>';
      if (data.success && data.subjects.length) {
        data.subjects.forEach(s => {
          const opt = document.createElement('option');
          opt.value = JSON.stringify(s);
          opt.textContent = `${s.subject} => ${s.branch}, ${s.year} - ${s.semester} ${s.section}`;
          subjectSel.appendChild(opt);
        });
        // Default periods from first subject
        renderPeriods(data.subjects[0].periods);
      } else {
        const opt = document.createElement('option'); opt.disabled = true; opt.textContent = 'No classes mapped'; subjectSel.appendChild(opt);
        renderPeriods([]);
      }
    } catch (e) {
      subjectSel.innerHTML = '<option value="">Failed to load</option>';
      renderPeriods([]);
    }
  }

  async function showStudents() {
    if (!subjectSel?.value) { alert('Select a subject'); return; }
    const selected = JSON.parse(subjectSel.value);
    const periods = getSelectedPeriods();
    if (!periods.length) { alert('Select at least one period'); return; }
    // build header
    const thead = document.getElementById('fa-students-thead');
    const tbody = document.getElementById('fa-students-tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';
    const headRow = document.createElement('tr');
    headRow.innerHTML = `<th class="px-3 py-2">SL.NO</th><th class="px-3 py-2">STUDENT NAME</th><th class="px-3 py-2">ROLL.NO</th>` + periods.map(p => `<th class=\"px-3 py-2\">PERIOD ${p}</th>`).join('');
    thead.appendChild(headRow);
    // fetch students
    const res = await fetch(`/api/class/students?branch=${encodeURIComponent(selected.branch)}&year=${encodeURIComponent(selected.year)}&section=${encodeURIComponent(selected.section)}`);
    const data = await res.json();
    if (!(data.success && data.students.length)) { statusEl.textContent = 'No students found for this class.'; return; }
    // render rows
    data.students.forEach((st, idx) => {
      const tr = document.createElement('tr');
      const base = `<td class=\"px-3 py-2\">${idx+1}</td><td class=\"px-3 py-2\">${st.name || ''}</td><td class=\"px-3 py-2\">${st.roll}</td>`;
      const perCells = periods.map(p => `<td class=\"px-3 py-2 text-center\"><input type=\"checkbox\" data-roll=\"${st.roll}\" data-period=\"${p}\" class=\"fa-present\"></td>`).join('');
      tr.innerHTML = base + perCells;
      tbody.appendChild(tr);
    });
    // after list is shown, enable scan buttons
    startScanBtn.disabled = false;
    stopScanBtn.disabled = false;
    statusEl.textContent = 'Students loaded. You can start Bluetooth scanning.';
  }

  function handleDeviceFoundForForm(device) {
    // device.roll expected
    const periods = getSelectedPeriods();
    if (!periods.length) return;
    const checkboxes = document.querySelectorAll(`input.fa-present[data-roll="${device.roll}"]`);
    checkboxes.forEach(cb => {
      if (periods.includes(Number(cb.getAttribute('data-period')))) {
        cb.checked = true;
      }
    });
  }

  // Hook into existing WS handler
  const originalHandleDeviceFound = typeof handleDeviceFound === 'function' ? handleDeviceFound : null;
  window.handleDeviceFound = (data) => {
    if (data && data.device) handleDeviceFoundForForm(data.device);
    if (originalHandleDeviceFound) originalHandleDeviceFound(data);
  };

  async function saveAttendance() {
    if (!subjectSel?.value) { alert('Select a subject'); return; }
    const selected = JSON.parse(subjectSel.value);
    const periods = getSelectedPeriods();
    if (!periods.length) { alert('Select at least one period'); return; }
    const dateVal = document.getElementById('fa-date').value;
    const unit = document.getElementById('fa-unit').value.trim();
    const topics = document.getElementById('fa-topics').value.trim();
    // collect students
    const rows = Array.from(document.querySelectorAll('#fa-students-tbody tr'));
    const students = rows.map(r => {
      const tds = r.querySelectorAll('td');
      const roll = tds[2]?.textContent?.trim();
      const present = {};
      periods.forEach(p => {
        const cb = r.querySelector(`input.fa-present[data-period="${p}"]`);
        present[p] = !!cb?.checked;
      });
      return { roll, present };
    });
    // confirm absentees
    const absentees = students.filter(s => periods.some(p => !s.present[p])).map(s => s.roll);
    if (!confirm(`Confirm save? Absent: ${absentees.join(', ') || 'None'}`)) return;
    const payload = {
      date: dateVal,
      subject: selected.subject,
      klass: { branch: selected.branch, year: selected.year, section: selected.section },
      periods,
      facultyId: currentUser?.roll,
      topics: { unit, topics },
      students
    };
    const res = await fetch('/api/faculty/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await res.json();
    if (result.success) alert('Attendance posted successfully'); else alert(result.message || 'Failed to save');
  }

  // Events
  if (loadSubjectsBtn) loadSubjectsBtn.onclick = loadSubjects;
  if (subjectSel) subjectSel.onchange = () => {
    try { const selected = JSON.parse(subjectSel.value); renderPeriods(selected.periods); } catch { renderPeriods([]); }
  };
  if (showBtn) showBtn.onclick = showStudents;
  if (saveBtn) saveBtn.onclick = saveAttendance;
  if (startScanBtn) startScanBtn.onclick = () => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'FACULTY_SCAN_START' })); };
  if (stopScanBtn) stopScanBtn.onclick = () => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'FACULTY_SCAN_STOP' })); };

  // Initial
  renderPeriods([]);
}

// ========================================================
//                  NEW ADMIN ATTENDANCE DASHBOARD FUNCTIONS
// ========================================================

function initializeAdminAttendanceDashboard() {
    // Set default date to today
    document.getElementById('admin-date-select').value = new Date().toISOString().split('T')[0];
    
    // Populate period checkboxes (this part is static)
    const periodsContainer = document.getElementById('admin-periods-checkboxes');
    if (periodsContainer) {
        periodsContainer.innerHTML = '';
        for (let i = 1; i <= 7; i++) {
            periodsContainer.innerHTML += `
                <label class="flex items-center gap-2">
                    <input type="checkbox" value="${i}" class="admin-period-cb h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500">
                    <span>Period ${i}</span>
                </label>
            `;
        }
    }

    // Define the filter elements
    const semesterSelect = document.getElementById('admin-semester-select');
    const branchSelect = document.getElementById('admin-branch-select');
    const yearSelect = document.getElementById('admin-year-select');
    const sectionSelect = document.getElementById('admin-section-select');
    const subjectSelect = document.getElementById('admin-subject-select');
    const viewBtn = document.getElementById('admin-view-btn');

    // Setup the cascading event listeners
    semesterSelect.addEventListener('change', () => {
        populateFilterDropdown('admin-branch-select', { semester: semesterSelect.value });
    });
    branchSelect.addEventListener('change', () => {
        populateFilterDropdown('admin-year-select', { semester: semesterSelect.value, branch: branchSelect.value });
    });
    yearSelect.addEventListener('change', () => {
        populateFilterDropdown('admin-section-select', { semester: semesterSelect.value, branch: branchSelect.value, year: yearSelect.value });
    });
    sectionSelect.addEventListener('change', () => {
        populateFilterDropdown('admin-subject-select', { semester: semesterSelect.value, branch: branchSelect.value, year: yearSelect.value, section: sectionSelect.value });
    });

    // Add listener for the view button
    if(viewBtn) {
       viewBtn.addEventListener('click', handleAdminViewClick);
    }

    // Start the cascade by populating the first filter (Semesters)
    populateFilterDropdown('admin-semester-select', {});
}

// Generic function to populate any filter dropdown
async function populateFilterDropdown(elementId, filters) {
    const selectElement = document.getElementById(elementId);
    const field = elementId.replace('admin-', '').replace('-select', ''); // e.g., 'admin-branch-select' -> 'branch'
    
    // Reset subsequent dropdowns in the chain
    resetSubsequentFilters(field);

    selectElement.innerHTML = '<option value="">Loading...</option>';
    selectElement.disabled = true;

    try {
        const query = new URLSearchParams({ field, ...filters }).toString();
        const response = await fetch(`/api/filter-options?${query}`);
        const result = await response.json();

        if (result.success) {
            selectElement.innerHTML = '<option value="">All</option>';
            if (result.options.length > 0) {
                result.options.forEach(option => {
                    selectElement.innerHTML += `<option value="${option}">${option}</option>`;
                });
            } else {
                selectElement.innerHTML = '<option value="">No options found</option>';
            }
        }
    } catch (error) {
        selectElement.innerHTML = '<option value="">Error</option>';
        console.error(`Failed to populate ${field}:`, error);
    } finally {
        selectElement.disabled = false;
    }
}

// Helper function to reset child filters when a parent filter changes
function resetSubsequentFilters(changedField) {
    const filterChain = ['semester', 'branch', 'year', 'section', 'subject'];
    const startIndex = filterChain.indexOf(changedField) + 1;
    
    for (let i = startIndex; i < filterChain.length; i++) {
        const elementId = `admin-${filterChain[i]}-select`;
        const selectElement = document.getElementById(elementId);
        if (selectElement) {
            selectElement.innerHTML = `<option value="">-- Select ${filterChain[i-1]} first --</option>`;
        }
    }
}

// This function is now much simpler as it just reads the final values
function getAdminFilters() {
    const periods = Array.from(document.querySelectorAll('.admin-period-cb:checked')).map(cb => Number(cb.value));
    const date = document.getElementById('admin-date-select').value;

    if (!date || periods.length === 0) {
        alert('Please select a date and at least one period.');
        return null;
    }

    return {
        date,
        periods,
        semester: document.getElementById('admin-semester-select').value,
        branch: document.getElementById('admin-branch-select').value,
        year: document.getElementById('admin-year-select').value,
        section: document.getElementById('admin-section-select').value,
        subject: document.getElementById('admin-subject-select').value,
    };
}

async function handleAdminViewClick() {
    const filters = getAdminFilters();
    if (!filters) return;

    const outputSection = document.getElementById('summary-output-section');
    const tbody = document.getElementById('admin-summary-tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center p-8"><i class="fas fa-spinner fa-spin mr-2"></i>Fetching summary...</td></tr>`;
    outputSection.classList.remove('hidden');

    try {
        const response = await fetch('/api/admin/attendance/summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters)
        });
        const result = await response.json();
        if (result.success) {
            renderAdminSummary(result.summary, result.absentees);
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-8 text-red-500">Error: ${error.message}</td></tr>`;
    }
}

function renderAdminSummary(summaryData, absenteesData) {
    const tbody = document.getElementById('admin-summary-tbody');
    const absenteesContainer = document.getElementById('admin-absentees-output');
    tbody.innerHTML = '';
    absenteesContainer.innerHTML = ''; 

    if (summaryData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center p-8 text-gray-500">No data found for the selected filters.</td></tr>`;
        return;
    }

    // Build summary rows
    summaryData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = 'border-b';
        tr.innerHTML = `
            <td class="px-4 py-2">${row.sno}</td>
            <td class="px-4 py-2 font-semibold">${row.className}</td>
            <td class="px-4 py-2">${row.totalStrength}</td>
            <td class="px-4 py-2">${row.totalPresent}</td>
            <td class="px-4 py-2">${row.totalAbsentees}</td>
            <td class="px-4 py-2 font-bold">${row.attendancePercent}%</td>
        `;
        tbody.appendChild(tr);
    });

    // Build absentees list at the bottom
    absenteesContainer.innerHTML += '<h3 class="text-base font-bold text-gray-800 mt-4 border-t pt-4">Absentees Roll Numbers:</h3>';
    for (const className in absenteesData) {
        const absentees = absenteesData[className];
        if (absentees.length > 0) {
            const div = document.createElement('div');
            div.className = 'mt-2';
            div.innerHTML = `
                <p class="font-semibold">${className}:</p>
                <p class="text-sm text-gray-600 font-mono">${absentees.join(', ')}</p>
            `;
            absenteesContainer.appendChild(div);
        }
    }
}

// Function for the download button (to be implemented)
function handleAdminDownloadClick() {
    alert("Download functionality for this summary will be implemented next!");
    // This will require another endpoint that receives filters and returns an Excel file.
}
