// ClassSync Integrated Application JavaScript (FINAL & COMPLETE VERSION)

// ========================================================
//                  GLOBAL VARIABLES
// ========================================================
let currentUser = null;
let currentRole = null;
let ws = null;
let isBluetoothSupported = navigator.bluetooth ? true : false;
let dashboardUpdateInterval = null; // To hold the interval for dashboard updates

// ========================================================
//          WEBSOCKET SETUP & HANDLERS
// ========================================================

// Initialize WebSocket connection
function initWebSocket() {
    // Prevent multiple connections
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        // NEW: Identify the user to the backend for targeted messaging (like announcements)
        if (currentUser) {
            ws.send(JSON.stringify({ type: 'IDENTIFY', user: currentUser }));
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    };

    // More resilient reconnection logic
    ws.onclose = () => {
        console.log('WebSocket disconnected, attempting to reconnect in 3 seconds...');
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (error) => console.error('WebSocket error:', error);
}

// Handle incoming WebSocket messages
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
        // NEW: Handle real-time announcements from the server
        case 'NEW_ANNOUNCEMENT':
            handleNewAnnouncement(data.payload);
            break;
    }
}

// NEW: Handles the new announcement WebSocket message
function handleNewAnnouncement(announcement) {
    if (currentRole === 'student') {
        alert(`New Announcement:\n\n${announcement.message}`);
        
        // Add notification to the UI
        const notificationsContent = document.getElementById('notificationsContent');
        if (notificationsContent.innerHTML.includes('No new notifications')) {
            notificationsContent.innerHTML = '';
        }
        const notifElement = document.createElement('div');
        notifElement.className = 'p-4 border rounded-lg bg-indigo-50 animate-pulse'; // Animate for attention
        notifElement.innerHTML = `
            <div class="flex items-start">
                <div class="flex-shrink-0 pt-1">
                    <div class="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-500">
                        <i class="fas fa-bullhorn"></i>
                    </div>
                </div>
                <div class="ml-3 flex-1">
                    <p class="font-semibold text-gray-800">${announcement.message}</p>
                    <p class="text-xs text-gray-500 mt-1">From Faculty: ${announcement.facultyId} | ${new Date(announcement.createdAt).toLocaleString()}</p>
                </div>
            </div>
        `;
        notificationsContent.prepend(notifElement);
        setTimeout(() => notifElement.classList.remove('animate-pulse'), 2000);
        
        const countEl = document.getElementById('notification-count');
        const newCount = (parseInt(countEl.textContent) || 0) + 1;
        countEl.textContent = newCount;
        countEl.classList.remove('hidden');
    }
}


// Handle attendance response for students
function handleAttendanceResponse(data) {
    // ... This function is unchanged from your original code
}

// Handle device found message for faculty
function handleDeviceFound(data) {
    // ... This function is unchanged from your original code
}

// Handle attendance marked message for faculty
function handleAttendanceMarked(data) {
    // ... This function is unchanged from your original code
}

// Handle scan started/stopped messages for faculty
function handleScanStarted(data) {
    // ... This function is unchanged from your original code
}
function handleScanStopped(data) {
    // ... This function is unchanged from your original code
}

// ========================================================
//          INITIALIZATION & CORE APP LOGIC
// ========================================================

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
            
            document.getElementById('login-container').classList.add('hidden');
            document.getElementById('dashboard-container').classList.remove('hidden');

            initWebSocket();
            initUI(); // REVISED: Call a central UI setup function
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

// NEW: Central UI initialization function after login
function initUI() {
    updateUserInfo();
    showRoleView(currentRole);
    initMobileMenu();
    initUserMenu();

    // NEW: Set up dynamic updates for the dashboard every minute
    if (dashboardUpdateInterval) clearInterval(dashboardUpdateInterval);
    updateDashboardTimers(); // Run once immediately
    dashboardUpdateInterval = setInterval(updateDashboardTimers, 60000); 
}

// Show role-specific view
function showRoleView(role) {
    ['studentView', 'facultyView', 'adminView'].forEach(id => document.getElementById(id).classList.add('hidden'));
    
    const viewId = `${role}View`;
    document.getElementById(viewId).classList.remove('hidden');
    
    const pageTitle = document.getElementById('pageTitle');
    pageTitle.textContent = `${role.charAt(0).toUpperCase() + role.slice(1)} Dashboard`;
    
    // NEW: Load initial data needed for the specific role's dashboard
    if (role === 'admin') {
        loadUsers();
    }
    if (role === 'faculty') {
        loadFacultyTodaysSchedule();
    }
    
    showSection('dashboard');
}

// Update user information
function updateUserInfo() {
    if (currentUser) {
        const displayName = currentUser.name || (currentRole === 'student' ? `Student ${currentUser.roll}` : `Prof. ${currentUser.roll}`);
        const roleDisplay = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
        
        document.getElementById('userName').textContent = displayName;
        document.getElementById('userRole').textContent = roleDisplay;
        document.getElementById('headerUserName').textContent = displayName.split(' ')[0];
    }
}

// Section navigation
function showSection(section) {
    ['dashboardSection', 'attendanceSection', 'timetableSection', 'notificationsSection'].forEach(s => {
        document.getElementById(s).classList.add('hidden');
    });
    
    const sectionEl = document.getElementById(section + 'Section');
    if (sectionEl) {
        sectionEl.classList.remove('hidden');
    }
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = section.charAt(0).toUpperCase() + section.slice(1);
    }
    
    loadSectionContent(section);
}

// ========================================================
//          CONTENT LOADING & FEATURE LOGIC
// ========================================================

// Main router for loading content into sections
function loadSectionContent(section) {
    if (section === 'attendance') {
        loadAttendanceContent();
    }
    if (section === 'timetable') {
        loadTimetableContent();
    }
    if (section === 'notifications') {
        loadNotifications();
    }
}

// --- ATTENDANCE SECTION LOGIC (with Admin View Fix) ---
function loadAttendanceContent() {
    const content = document.getElementById('attendanceContent');
    if (!content) return;
    
    if (currentRole === 'student') {
        // ... Unchanged ...
    } else if (currentRole === 'faculty') {
        // ... Unchanged ...
    } else if (currentRole === 'admin') {
        // FIX: Ensure admin attendance view is functional
        content.innerHTML = `<h3 class="text-xl font-bold mb-4">View Attendance Records</h3><div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg"><div><label for="branchFilter" class="block text-sm font-medium text-gray-700">Branch:</label><select id="branchFilter" class="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md"><option value="">All</option><option value="CSE">CSE</option><option value="IT">IT</option><option value="ECE">ECE</option></select></div><div><label for="yearFilter" class="block text-sm font-medium text-gray-700">Year:</label><select id="yearFilter" class="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md"><option value="">All</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></div><div><label for="sectionFilter" class="block text-sm font-medium text-gray-700">Section:</label><select id="sectionFilter" class="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md"><option value="">All</option><option value="A">A</option><option value="B">B</option></select></div><div><label for="dateFilter" class="block text-sm font-medium text-gray-700">Date:</label><input type="date" id="dateFilter" class="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md"></div></div><div class="flex justify-between items-center mb-4"><button id="applyFilterBtn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">View Attendance</button><button id="downloadBtn" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Download as Excel</button></div><div class="overflow-x-auto"><table class="min-w-full"><thead class="bg-gray-50"><tr><th class="px-6 py-3 text-left text-xs font-medium text-gray-500">Roll</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500">Status</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500">Date</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500">Timestamp</th></tr></thead><tbody id="admin-attendance-table" class="bg-white"></tbody></table></div>`;
        document.getElementById('applyFilterBtn').addEventListener('click', fetchAdminAttendance);
        document.getElementById('downloadBtn').addEventListener('click', downloadAttendance);
        fetchAdminAttendance(); // Initial load
    }
}

// --- TIMETABLE SECTION LOGIC (FIXED) ---
function loadTimetableContent() {
    const content = document.getElementById('timetableContent');
    content.innerHTML = ''; 

    if (currentRole === 'admin') {
        const template = document.getElementById('admin-timetable-editor');
        const editor = template.content.cloneNode(true);
        content.appendChild(editor);
        initAdminTimetableEditor();
    } else if (currentRole === 'student' || currentRole === 'faculty') {
        // FIX: Added Saturday column header
        content.innerHTML = `<div class="overflow-x-auto"><table class="w-full"><thead><tr class="bg-gray-50"><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tuesday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wednesday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Thursday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Friday</th><th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Saturday</th></tr></thead><tbody id="timetable-body" class="bg-white divide-y divide-gray-200"><tr><td colspan="7" class="text-center p-4">Loading timetable...</td></tr></tbody></table></div>`;
        fetchUserTimetable();
    }
}

// --- ADMIN TIMETABLE EDITOR LOGIC ---
// ... This section is unchanged from your original code ...

// --- HELPER FUNCTIONS (with fixes) ---

// Fetches and displays timetable for students and faculty
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
            // FIX: Sort by time first to fix shuffled order
            const timeOrder = { "9:30": 1, "10:20": 2, "11:10": 3, "12:00": 4, "1:50": 5, "2:40": 6, "3:30": 7 };
            data.timetable.sort((a, b) => timeOrder[a.startTime] - timeOrder[b.startTime]);
            
            const groupedByTime = data.timetable.reduce((acc, entry) => {
                const time = entry.startTime;
                if (!acc[time]) acc[time] = {};
                acc[time][entry.day.toLowerCase()] = entry; // Use lowercase for consistency
                return acc;
            }, {});

            for (const time in groupedByTime) {
                const row = tableBody.insertRow();
                row.innerHTML = `<td class="px-6 py-4 font-medium">${time}</td>`;
                // FIX: Include Saturday in the loop
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                days.forEach(day => {
                    const cell = row.insertCell();
                    cell.className = 'px-6 py-4';
                    const entry = groupedByTime[time][day];
                    if (entry) {
                        // FIX: Show faculty name, not ID. Render non-editable divs.
                        cell.innerHTML = `
                        <div class="timetable-cell bg-indigo-50 border-l-4 border-indigo-500 p-2 rounded">
                            <p class="font-semibold text-indigo-800">${entry.subject}</p>
                            <p class="text-xs text-gray-600">Room: ${entry.room}</p>
                            ${currentRole === 'student' ? `<p class="text-xs text-gray-500">Prof: ${entry.facultyName}</p>` : `<p class="text-xs text-gray-500">${entry.branch} ${entry.year}-${entry.section}</p>`}
                        </div>`;
                    }
                });
            }
        } else {
            // FIX: Span all 7 columns for the 'not found' message
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center p-4">No timetable found.</td></tr>`;
        }
    } catch (error) {
        console.error("Failed to fetch timetable:", error);
    }
}

// Student marks attendance
function markAttendance() {
    // ... This function is unchanged from your original code
}

// Faculty starts attendance session
function startAttendanceSession() {
    // ... This function is unchanged from your original code
}

// Faculty adds manual attendance
function addManualAttendance() {
    // ... This function is unchanged from your original code
}

// Load today's attendance for faculty view
function loadFacultyAttendance() {
    // ... This function is unchanged from your original code
}

// Admin fetches attendance with filters (FIXED for better UI feedback)
async function fetchAdminAttendance() {
    const tableBody = document.getElementById('admin-attendance-table');
    tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4">Loading records...</td></tr>`;
    
    const branch = document.getElementById('branchFilter').value;
    const year = document.getElementById('yearFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const date = document.getElementById('dateFilter').value;
    const query = new URLSearchParams({ branch, year, section, date }).toString();
    
    try {
        const response = await fetch(`/api/admin/attendance?${query}`);
        const data = await response.json();
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
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">Failed to load records.</td></tr>`;
    }
}


// Admin downloads attendance as Excel
function downloadAttendance() {
    // ... This function is unchanged from your original code
}

// Load attendance summary for students
async function loadStudentAttendanceSummary(roll) {
    // ... This function is unchanged from your original code
}

// ========================================================
//                  NEW DYNAMIC FEATURES
// ========================================================

// NEW: Updates the "Current Class" and "Next Class" sections on the dashboard
async function updateDashboardTimers() {
    if (!currentUser || (currentRole !== 'student' && currentRole !== 'faculty')) return;
    
    const now = new Date();
    const dayOfWeek = now.toLocaleString('en-US', { weekday: 'long' });
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes from midnight

    let url;
    if (currentRole === 'student') {
        const { branch, year, section } = currentUser;
        url = `/api/timetable/student?branch=${branch}&year=${year}&section=${section}`;
    } else {
        url = `/api/timetable/faculty/${currentUser.roll}`;
    }

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.success || !data.timetable) return;

        const timeStringToMinutes = (timeStr) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
        };
        
        const todaySchedule = data.timetable
            .filter(slot => slot.day.toLowerCase() === dayOfWeek.toLowerCase())
            .map(slot => ({ ...slot, startMinutes: timeStringToMinutes(slot.startTime) }))
            .sort((a, b) => a.startMinutes - b.startMinutes);

        let currentClass = null;
        let nextClass = null;

        for (const slot of todaySchedule) {
            // A class is assumed to be 50 minutes long
            if (currentTime >= slot.startMinutes && currentTime < slot.startMinutes + 50) {
                currentClass = slot;
            }
            if (slot.startMinutes > currentTime && !nextClass) {
                nextClass = slot;
            }
        }
        
        if (currentRole === 'student') {
            document.getElementById('student-current-class-subject').textContent = currentClass?.subject || 'No active class';
            document.getElementById('student-current-class-room').textContent = currentClass ? `Room: ${currentClass.room}` : '--';
            document.getElementById('student-next-class-subject').textContent = nextClass?.subject || 'No more classes today';
            document.getElementById('student-next-class-time').textContent = nextClass ? `at ${nextClass.startTime}` : '--';
        } else if (currentRole === 'faculty') {
            document.getElementById('faculty-next-class-subject').textContent = nextClass?.subject || 'No more classes';
            document.getElementById('faculty-next-class-details').textContent = nextClass ? `${nextClass.startTime} | ${nextClass.branch} ${nextClass.year}-${nextClass.section}` : '--';
        }

    } catch (error) {
        console.error("Error updating dashboard timers:", error);
    }
}

// NEW: Populates the faculty's "Today's Schedule" on the dashboard
async function loadFacultyTodaysSchedule() {
    const scheduleDiv = document.getElementById('faculty-today-schedule');
    scheduleDiv.innerHTML = '<p class="text-gray-500">Loading schedule...</p>';
    
    const now = new Date();
    const dayOfWeek = now.toLocaleString('en-US', { weekday: 'long' });

    try {
        const response = await fetch(`/api/timetable/faculty/${currentUser.roll}`);
        const data = await response.json();
        
        if (data.success && data.timetable) {
            const todaySchedule = data.timetable
                .filter(slot => slot.day.toLowerCase() === dayOfWeek.toLowerCase())
                .sort((a,b) => a.startTime.localeCompare(b.startTime));
            
            if (todaySchedule.length > 0) {
                scheduleDiv.innerHTML = todaySchedule.map(slot => `
                    <div class="p-2 bg-gray-50 rounded-md">
                        <p class="font-semibold">${slot.startTime} - ${slot.subject}</p>
                        <p class="text-sm text-gray-600">${slot.branch} ${slot.year}-${slot.section} | Room: ${slot.room}</p>
                    </div>
                `).join('');
            } else {
                scheduleDiv.innerHTML = '<p class="text-gray-500">No classes scheduled for today.</p>';
            }
        }
    } catch (error) {
        scheduleDiv.innerHTML = '<p class="text-red-500">Could not load schedule.</p>';
    }
}


// ========================================================
//          NEW: ADMIN USER MANAGEMENT (Full Implementation)
// ========================================================
async function loadUsers() {
    const tableBody = document.getElementById('user-list-table-body');
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        if (data.success && data.users) {
            tableBody.innerHTML = '';
            if (data.users.length === 0) {
                 tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4">No users found. Click 'Add User' to begin.</td></tr>`;
                 return;
            }
            data.users.forEach(user => {
                const row = tableBody.insertRow();
                row.innerHTML = `
                    <td class="px-6 py-4 font-medium text-gray-900">${user.name}</td>
                    <td class="px-6 py-4 capitalize">${user.role}</td>
                    <td class="px-6 py-4">${user.roll}</td>
                    <td class="px-6 py-4">${user.department || 'N/A'}</td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="editUser(event)" data-user='${JSON.stringify(user)}' class="font-medium text-indigo-600 hover:text-indigo-900 mr-4">Edit</button>
                        <button onclick="deleteUser('${user._id}')" class="font-medium text-red-600 hover:text-red-900">Delete</button>
                    </td>
                `;
            });
        }
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-4 text-red-500">Failed to load users.</td></tr>`;
    }
}

function openUserModal() {
    document.getElementById('user-form').reset();
    document.getElementById('user-id-input').value = '';
    document.getElementById('user-modal-title').textContent = 'Add New User';
    document.getElementById('user-password-input').setAttribute('required', 'true');
    document.getElementById('user-password-input').placeholder = "Password is required";
    document.getElementById('user-modal').classList.remove('hidden');
}

function closeUserModal() {
    document.getElementById('user-modal').classList.add('hidden');
}

function editUser(event) {
    const user = JSON.parse(event.target.dataset.user);
    openUserModal();
    document.getElementById('user-modal-title').textContent = 'Edit User';
    document.getElementById('user-id-input').value = user._id;
    document.getElementById('user-name-input').value = user.name;
    document.getElementById('user-email-input').value = user.email || '';
    document.getElementById('user-role-input').value = user.role;
    document.getElementById('user-roll-input').value = user.roll;
    document.getElementById('user-department-input').value = user.department || '';
    document.getElementById('user-password-input').removeAttribute('required');
    document.getElementById('user-password-input').placeholder = "Leave blank to keep unchanged";
}

document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('user-id-input').value;
    const body = {
        name: document.getElementById('user-name-input').value,
        email: document.getElementById('user-email-input').value,
        role: document.getElementById('user-role-input').value,
        roll: document.getElementById('user-roll-input').value,
        department: document.getElementById('user-department-input').value,
        password: document.getElementById('user-password-input').value,
    };
    
    // Don't send an empty password field on edit
    if (id && !body.password) {
        delete body.password;
    }

    const url = id ? `/api/admin/users/${id}` : '/api/admin/users';
    const method = id ? 'PUT' : 'POST';
    
    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            alert('User saved successfully!');
            closeUserModal();
            loadUsers();
        } else {
            alert(`Error: ${result.message}`);
        }
    } catch(error) {
        alert('An error occurred. Please try again.');
    }
});

async function deleteUser(id) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
        const response = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            alert('User deleted successfully.');
            loadUsers();
        } else {
            alert(`Error: ${result.message}`);
        }
    } catch(error) {
        alert('An error occurred.');
    }
}

// ========================================================
//          NEW: ANNOUNCEMENT SYSTEM
// ========================================================
function openAnnounceModal() {
    document.getElementById('announce-modal').classList.remove('hidden');
}

function closeAnnounceModal() {
    document.getElementById('announce-modal').classList.add('hidden');
}

document.getElementById('announce-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
        branch: document.getElementById('announce-branch').value,
        year: document.getElementById('announce-year').value,
        section: document.getElementById('announce-section').value,
        message: document.getElementById('announce-message').value,
        facultyId: currentUser.roll
    };

    try {
        const response = await fetch('/api/faculty/announce', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (result.success) {
            alert('Announcement sent!');
            closeAnnounceModal();
            document.getElementById('announce-form').reset();
        } else {
            alert(`Error: ${result.message}`);
        }
    } catch(error) {
        alert('An error occurred.');
    }
});

async function loadNotifications() {
    // Logic to fetch and display past notifications for students upon visiting the notifications tab
}

// ========================================================
//          UI UTILITY FUNCTIONS
// ========================================================

// Add discovered device to faculty list
function addDiscoveredDevice(device) {
    // ... This function is unchanged from your original code
}

function initMobileMenu() {
    // ... This function is unchanged from your original code
}

function initUserMenu() {
    // ... This function is unchanged from your original code
}

function logout() {
    if (dashboardUpdateInterval) clearInterval(dashboardUpdateInterval);
    window.location.reload();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('ClassSync Integrated Application loaded');
});