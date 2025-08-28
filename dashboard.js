// ========================================================
//          ClassSync Unified Dashboard Script
// ========================================================

// Global variables
let currentUser = null;
let currentRole = null;
let ws = null;
let isBluetoothSupported = 'bluetooth' in navigator;

// ========================================================
//          INITIALIZATION & CORE APP LOGIC
// ========================================================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    // Add other permanent event listeners here if needed
});

async function handleLogin(e) {
            e.preventDefault();
            const role = document.getElementById('role').value;
            const roll = document.getElementById('roll').value.trim();
            const password = document.getElementById('password').value;
            const loginError = document.getElementById('login-error');
            loginError.classList.add('hidden');
            
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
                    showDashboard();
                } else {
                    loginError.textContent = data.message || 'Login failed.';
                    loginError.classList.remove('hidden');
                }
            } catch (error) {
                loginError.textContent = 'Network error. Please try again.';
                loginError.classList.remove('hidden');
            }
}

function showDashboard() {
    console.log('[FRONTEND] showDashboard called with role:', currentRole, 'and user:', currentUser);
    
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    
    // Update user info in sidebar/header
    const displayName = currentUser.name || `User: ${currentUser.roll}`;
    const roleDisplay = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
    document.getElementById('userName').textContent = displayName;
    document.getElementById('userRole').textContent = roleDisplay;
    document.getElementById('headerUserName').textContent = displayName.split(' ')[0];

    // Show the correct view based on role
    ['studentView', 'facultyView', 'adminView'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.classList.add('hidden');
            console.log('[FRONTEND] Hidden view:', id);
        }
    });
    
    const targetView = document.getElementById(`${currentRole}View`);
    if (targetView) {
        targetView.classList.remove('hidden');
        console.log('[FRONTEND] Showed view:', `${currentRole}View`);
    } else {
        console.error('[FRONTEND] Target view not found:', `${currentRole}View`);
    }
    
    // Navigate to the main dashboard view
    showSection('dashboard');
    initMobileMenu();
    
    // Start session checking for students
    if (currentRole === 'student') {
        startSessionChecking();
    }
}

function showSection(section) {
    console.log('[FRONTEND] showSection called with:', section, 'for role:', currentRole);
    
    // Hide all main sections
    ['dashboardSection', 'attendanceSection', 'timetableSection', 'notificationsSection'].forEach(s => {
        const element = document.getElementById(s);
        if (element) {
            element.classList.add('hidden');
            console.log('[FRONTEND] Hidden section:', s);
        } else {
            console.warn('[FRONTEND] Section not found:', s);
        }
    });
    
    // Show the requested section
    const targetSection = document.getElementById(`${section}Section`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        console.log('[FRONTEND] Showed section:', `${section}Section`);
    } else {
        console.error('[FRONTEND] Target section not found:', `${section}Section`);
    }
    
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = section.charAt(0).toUpperCase() + section.slice(1);
    }

    // Load the content for the visible section
    if (section === 'attendance') {
        console.log('[FRONTEND] Loading attendance content...');
        loadAttendanceContent();
    }
    
    // Start session checking for students when viewing attendance
    if (section === 'attendance' && currentRole === 'student') {
        startSessionChecking();
    } else if (currentRole === 'student') {
        stopSessionChecking();
    }
    
    // Add other content loaders here if needed (e.g., for timetable)
}

// ========================================================
//          DYNAMIC CONTENT LOADER FOR ATTENDANCE
// ========================================================

function loadAttendanceContent() {
    // Support both containers: legacy #attendanceContent and new #attendanceSection
    const content = document.getElementById('attendanceContent') || document.getElementById('attendanceSection');
    
    if (!content) {
        console.error('No attendance content container found!');
        return;
    }
    
    console.log('[FRONTEND] Loading attendance content for role:', currentRole);
    
    if (currentRole === 'student') {
        // Clear before rendering for students
        content.innerHTML = '';
        content.innerHTML = `
            <div id="student-attendance-summary" class="mb-8">
                <div class="bg-white rounded-xl shadow-md p-6 mb-6 text-center">
                    <h3 class="text-lg font-medium text-gray-500">Overall Attendance</h3>
                    <p id="overall-percentage" class="text-5xl font-bold text-indigo-600 my-2">--%</p>
                    <p id="overall-details" class="text-gray-600">Attended -- out of -- classes</p>
                </div>
                <h3 class="text-xl font-bold mb-4">Subject-wise Attendance</h3>
                <div id="subject-wise-list" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <p class="text-gray-500">Loading...</p>
                </div>
            </div>
            <hr class="my-8">
            <div class="text-center">
                <h3 class="text-xl font-bold mb-4">Mark Your Attendance</h3>
                <div class="mb-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                    <p class="text-sm text-blue-800">
                        <i class="fas fa-info-circle mr-2"></i>
                        <strong>How it works:</strong> Click the button below to mark your attendance. 
                        The system will send a Bluetooth signal to the faculty system for automatic attendance recording.
                    </p>
                </div>
                <button onclick="markAttendance()" class="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                    <i class="fas fa-bluetooth mr-2"></i>Mark Attendance
                </button>
                <div id="attendance-status" class="mt-4 p-3 rounded-lg"></div>
            </div>`;
        
        loadStudentAttendanceSummary(currentUser.roll);
    } else if (currentRole === 'faculty') {
        // Clear before rendering for faculty
        content.innerHTML = '';
        content.innerHTML = `
            <div>
                <div class="mb-6">
                    <h3 class="text-xl font-bold mb-4">Faculty Attendance Management</h3>
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
                                <p id="class-select-helper" class="text-xs text-gray-500 mt-1">Filtered by faculty mapping (branch/year/section/semester)</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Periods:</label>
                                <div class="flex flex-wrap gap-2">
                                    ${[1,2,3,4,5,6,7].map(p => `
                                        <label class="flex items-center">
                                            <input type="checkbox" value="${p}" class="mr-1">
                                            <span class="text-sm">${p}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="loadFacultyClasses()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <i class="fas fa-sync mr-2"></i>Load Classes
                            </button>
                            <button onclick="showStudentsForAttendance()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                                <i class="fas fa-users mr-2"></i>Show Students
                            </button>
                        </div>
                    </div>
                    
                    <div class="bg-white p-6 rounded-lg shadow-md mb-6">
                        <h4 class="font-semibold mb-4 text-gray-800">Attendance Session Control</h4>
                        <div class="flex gap-2 mb-4">
                            <button onclick="startAttendanceSession()" class="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                                <i class="fas fa-play mr-2"></i>Start Listening for Student Signals
                            </button>
                            <button onclick="stopAttendanceSession()" class="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                                <i class="fas fa-stop mr-2"></i>Stop Listening
                            </button>
                            <button id="submit-attendance-btn" onclick="submitAttendance()" class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium hidden">
                                <i class="fas fa-save mr-2"></i>Submit Attendance
                            </button>
                        </div>
                        <div id="bluetooth-status" class="p-3 rounded-lg bg-gray-50">
                            <p class="text-gray-600">Ready to start attendance session</p>
                        </div>
                    </div>
                    
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h4 class="font-semibold mb-4 text-gray-800">Class Students</h4>
                            <div id="class-students" class="space-y-2">
                                <p class="text-gray-500">Select a class to see students</p>
                            </div>
                        </div>
                        
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h4 class="font-semibold mb-4 text-gray-800">Detected Student Signals</h4>
                            <div id="detected-signals" class="space-y-2">
                                <p class="text-gray-500">No student signals detected yet</p>
                            </div>
                        </div>
                        
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h4 class="font-semibold mb-4 text-gray-800">Attendance Records</h4>
                            <div id="attendance-records" class="space-y-2">
                                <p class="text-gray-500">No attendance records yet</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        
        loadFacultyClasses();
    } else if (currentRole === 'admin') {
        // For admin users, the HTML is already in the static file, just initialize the dropdowns
        console.log('[FRONTEND] Admin user detected, initializing existing HTML structure');
        
        // Now initialize the admin attendance dashboard
        initializeAdminAttendanceDashboard();
    }
}

// ========================================================
//          ADMIN ATTENDANCE LOGIC
// ========================================================

// Upgrade admin filters: support multi-select and date range
function initializeAdminAttendanceDashboard() {
    console.log('[FRONTEND] Initializing admin attendance dashboard...');
    
    const dateSelect = document.getElementById('admin-date-select');
    if (dateSelect) {
        dateSelect.value = new Date().toISOString().split('T')[0];
        console.log('[FRONTEND] Set date to:', dateSelect.value);
    } else {
        console.error('[FRONTEND] admin-date-select not found');
    }
    
    // Initialize From/To date fields
    const fromDateSelect = document.getElementById('admin-from-date');
    if (fromDateSelect) {
        fromDateSelect.value = new Date().toISOString().split('T')[0];
        console.log('[FRONTEND] Set from date to:', fromDateSelect.value);
    } else {
        console.error('[FRONTEND] admin-from-date not found');
    }
    
    const toDateSelect = document.getElementById('admin-to-date');
    if (toDateSelect) {
        toDateSelect.value = new Date().toISOString().split('T')[0];
        console.log('[FRONTEND] Set to date to:', toDateSelect.value);
    } else {
        console.error('[FRONTEND] admin-to-date not found');
    }
    
    const periodsContainer = document.getElementById('admin-periods-checkboxes');
    if (periodsContainer) {
        periodsContainer.innerHTML = '';
        for (let i = 1; i <= 7; i++) {
            periodsContainer.innerHTML += `<label class="flex items-center gap-2"><input type="checkbox" value="${i}" class="admin-period-cb h-4 w-4" checked><span>P${i}</span></label>`;
        }
        console.log('[FRONTEND] Created period checkboxes');
    } else {
        console.error('[FRONTEND] admin-periods-checkboxes not found');
    }

    // Set up static checkbox functionality (no API calls)
    console.log('[FRONTEND] Setting up static checkboxes...');

    // Function to get selected values from static checkboxes
    const getStaticCheckboxValues = (field) => {
        const checkboxes = document.querySelectorAll(`[data-field="${field}"]:checked`);
        return Array.from(checkboxes).map(cb => cb.value).filter(Boolean);
    };

    // Add event listeners for "Select All" checkboxes
    const setupSelectAll = (selectAllId, field) => {
        const selectAllCheckbox = document.getElementById(selectAllId);
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const checkboxes = document.querySelectorAll(`[data-field="${field}"]`);
                checkboxes.forEach(cb => cb.checked = e.target.checked);
                console.log(`[FRONTEND] ${field} Select All changed to:`, e.target.checked);
            });
        }
    };

    // Setup Select All functionality for each field
    setupSelectAll('branch-select-all', 'branch');
    setupSelectAll('year-select-all', 'year');
    setupSelectAll('section-select-all', 'section');
    setupSelectAll('semester-select-all', 'semester');

    // Add event listeners for individual checkbox changes
    document.querySelectorAll('.admin-filter-cb').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const field = e.target.dataset.field;
            const value = e.target.value;
            const isChecked = e.target.checked;
            console.log(`[FRONTEND] ${field} checkbox changed: ${value} = ${isChecked}`);
        });
    });

    const viewBtn = document.getElementById('admin-view-btn');
    if (viewBtn) {
        viewBtn.addEventListener('click', handleAdminViewClick);
        console.log('[FRONTEND] Added click handler to view button');
    } else {
        console.error('[FRONTEND] admin-view-btn not found');
    }

    // Static checkboxes are already loaded in HTML - no API calls needed
    console.log('[FRONTEND] Static checkboxes loaded successfully');
    
    // Add some debugging to see what elements exist
    console.log('[FRONTEND] Checking admin elements:');
    console.log('- Branch checkboxes:', document.querySelectorAll('[data-field="branch"]').length);
    console.log('- Year checkboxes:', document.querySelectorAll('[data-field="year"]').length);
    console.log('- Section checkboxes:', document.querySelectorAll('[data-field="section"]').length);
    console.log('- Semester checkboxes:', document.querySelectorAll('[data-field="semester"]').length);
    console.log('- From date:', document.getElementById('admin-from-date'));
    console.log('- To date:', document.getElementById('admin-to-date'));
    console.log('- View button:', document.getElementById('admin-view-btn'));
}

function getValues(id) {
    const el = document.getElementById(id);
    if (!el) return [];
    
    // If element is a checkbox container (div)
    if (el.tagName === 'DIV') {
        const checkboxes = el.querySelectorAll('input[type="checkbox"]:not([id$="-select-all"])');
        return Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value).filter(Boolean);
    }
    
    // If element is <select multiple>
    if (el.tagName === 'SELECT' && el.multiple) {
        return Array.from(el.selectedOptions).map(o => o.value).filter(Boolean);
    }
    
    // Support a comma-separated input (optional)
    if (el.tagName === 'INPUT' && el.dataset.multiple === 'true') {
        return el.value.split(',').map(v => v.trim()).filter(Boolean);
    }
    
    // For single-select dropdowns (like in static HTML)
    if (el.tagName === 'SELECT' && !el.multiple) {
        return el.value ? [el.value] : [];
    }
    
    // Fallback single value
    return el.value ? [el.value] : [];
}

function getAdminFilters() {
    const periods = Array.from(document.querySelectorAll('.admin-period-cb:checked')).map(cb => Number(cb.value));
    const date = document.getElementById('admin-date-select')?.value || '';
    const fromDate = document.getElementById('admin-from-date')?.value || '';
    const toDate = document.getElementById('admin-to-date')?.value || '';

    // Get values from static checkboxes (no API calls)
    const branches = Array.from(document.querySelectorAll('[data-field="branch"]:checked')).map(cb => cb.value);
    const years = Array.from(document.querySelectorAll('[data-field="year"]:checked')).map(cb => cb.value);
    const sections = Array.from(document.querySelectorAll('[data-field="section"]:checked')).map(cb => cb.value);
    const semesters = Array.from(document.querySelectorAll('[data-field="semester"]:checked')).map(cb => cb.value);

    if (!date && !fromDate && !toDate) {
        alert('Select a Date or From/To range.');
        return null;
    }
    if (periods.length === 0) {
        alert('Select at least one period.');
        return null;
    }

    // Include single-value fallbacks for backwards compatibility
    return {
        date,
        fromDate,
        toDate,
        periods,
        branch: branches[0] || '',
        year: years[0] || '',
        section: sections[0] || '',
        semester: semesters[0] || '',
        branches,
        years,
        sections,
        semesters
    };
}

// Static checkboxes are used instead of dynamic API population

// No need for filter resetting with static checkboxes

// Render admin summary UI and actions
function handleAdminViewClick() {
    console.log('[FRONTEND] Admin View button clicked');
    const filters = getAdminFilters();
    console.log('[FRONTEND] Admin filters:', filters);
    
    if (!filters) return;
    
    const output = document.getElementById('summary-output-section');
    if (!output) {
        console.error('[FRONTEND] summary-output-section not found');
        return;
    }
    
    output.classList.remove('hidden');
    output.innerHTML = `<div class="bg-white rounded-xl shadow p-4">Loading summary...</div>`;
    
    console.log('[FRONTEND] Sending request to /api/admin/attendance/summary with filters:', filters);
    
    fetch('/api/admin/attendance/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filters)
    }).then(r => {
        console.log('[FRONTEND] Response status:', r.status);
        return r.json();
    }).then(result => {
        console.log('[FRONTEND] Response data:', result);
        if (!result.success) throw new Error(result.message || 'Failed to load summary');
        renderAdminSummary(result.summary, result.absentees);
    }).catch(err => {
        console.error('[FRONTEND] Error in handleAdminViewClick:', err);
        output.innerHTML = `<div class='bg-white rounded-xl shadow p-4 text-red-600'>Error: ${err.message}</div>`;
    });
}

function renderAdminSummary(summaryData, absenteesData) {
    const output = document.getElementById('summary-output-section');
    if (!output) return;
    const rows = (summaryData || []).map(r => `<tr>
        <td class='px-3 py-2'>${r.sno}</td>
        <td class='px-3 py-2 font-medium'>${r.className}</td>
        <td class='px-3 py-2'>${r.totalStrength}</td>
        <td class='px-3 py-2 text-green-700'>${r.totalPresent}</td>
        <td class='px-3 py-2 text-red-700'>${r.totalAbsentees}</td>
        <td class='px-3 py-2'>${r.attendancePercent}%</td>
    </tr>`).join('');

    output.innerHTML = `
      <div class="bg-white rounded-xl shadow p-4">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-lg font-semibold">Summary</h3>
          <button id="admin-download-excel" class="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">
            <i class="fas fa-file-excel mr-2"></i>Download Excel
          </button>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full border"> 
            <thead class="bg-gray-50">
              <tr>
                <th class='px-3 py-2 text-left'>S.No</th>
                <th class='px-3 py-2 text-left'>Class</th>
                <th class='px-3 py-2 text-left'>Strength</th>
                <th class='px-3 py-2 text-left'>Present</th>
                <th class='px-3 py-2 text-left'>Absentees</th>
                <th class='px-3 py-2 text-left'>%</th>
              </tr>
            </thead>
            <tbody>${rows || ''}</tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('admin-download-excel')?.addEventListener('click', downloadAdminSummaryExcel);
}

async function downloadAdminSummaryExcel() {
    const filters = getAdminFilters();
    if (!filters) return;
    try {
        const response = await fetch('/api/admin/attendance/summary/excel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filters)
        });
        if (!response.ok) throw new Error(`Server error ${response.status}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_summary_${filters.date}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (e) {
        alert(`Failed to download: ${e.message}`);
    }
}

// ========================================================
//          FACULTY ATTENDANCE LOGIC
// ========================================================

function initializeFacultyAttendanceDashboard() {
    document.getElementById('faculty-show-students-btn')?.addEventListener('click', handleFacultyShowStudents);
    populateFacultyClassDropdown();
}

async function populateFacultyClassDropdown() {
    const classSelect = document.getElementById('faculty-class-select');
    if (!classSelect || !currentUser) return;

    try {
        const response = await fetch(`/api/faculty/classes/${currentUser.roll}`);
        if (!response.ok) throw new Error(`Server error: ${response.status}`);
        const result = await response.json();
        if (result.success) {
            if (result.classes.length > 0) {
                classSelect.innerHTML = '<option value="">-- Select a Class --</option>';
                result.classes.forEach(cls => {
                    const label = `${cls.subject} | ${cls.branch} - ${cls.year} ${cls.section} (${cls.semester})`;
                    const value = JSON.stringify(cls);
                    classSelect.innerHTML += `<option value='${value}'>${label}</option>`;
                });
            } else {
                classSelect.innerHTML = '<option value="">-- No classes assigned --</option>';
            }
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        classSelect.innerHTML = '<option value="">⚠️ Error loading</option>';
    }
}

function handleFacultyShowStudents() { /* This function can be added later */ console.log("Show Students clicked!"); }

// ========================================================
//          UTILITY FUNCTIONS
// ========================================================

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

function logout() { window.location.reload(); }

// ========================================================
//          ATTENDANCE LOGIC
// ========================================================

// Initialize WebSocket connection
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
    };
    
    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);
            
            switch (data.type) {
                case 'DEVICE_FOUND':
                    handleDeviceFound(data.device);
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
                case 'ATTENDANCE_RESPONSE':
                    handleAttendanceResponse(data);
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
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
        case 'STUDENT_SIGNAL_RESPONSE':
            handleStudentSignalResponse(data);
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
        default:
            console.log('Unknown WebSocket message type:', data.type);
    }
}

// Handle attendance response
function handleAttendanceResponse(data) {
    console.log('Attendance response:', data);
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        if (data.success) {
            statusElement.innerHTML = `
                <div class="text-green-600 font-medium">
                    <i class="fas fa-check-circle mr-2"></i>${data.message}
                </div>
                <div class="text-sm text-gray-600 mt-2">
                    Your attendance has been recorded successfully!
                </div>
            `;
        } else {
            statusElement.innerHTML = `
                <div class="text-red-600 font-medium">
                    <i class="fas fa-exclamation-triangle mr-2"></i>${data.message}
                </div>
                <div class="text-sm text-gray-600 mt-2">
                    Please try again or contact your faculty.
                </div>
            `;
        }
    }
}

// Handle device found (faculty)
function handleDeviceFound(device) {
    console.log('Device found:', device);
    // This will be handled by the faculty UI updates
}

// Handle attendance marked (faculty)
function handleAttendanceMarked(data) {
    console.log('Attendance marked:', data);
    // This will be handled by the faculty UI updates
}

// Handle scan started (faculty)
function handleScanStarted(data) {
    console.log('Scan started:', data);
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div class="text-green-600 font-medium">
                <i class="fas fa-bluetooth mr-2"></i>${data.message || 'Bluetooth scanning started...'}
            </div>
            <div class="text-sm text-gray-600 mt-2">
                <i class="fas fa-spinner fa-spin mr-1"></i>Listening for student devices...
            </div>
        `;
    }
}

// Handle scan stopped (faculty)
function handleScanStopped(data) {
    console.log('Scan stopped:', data);
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div class="text-red-600 font-medium">
                <i class="fas fa-stop mr-2"></i>${data.message || 'Bluetooth scanning stopped.'}
            </div>
            <div class="text-sm text-gray-600 mt-2">
                Scanning has been stopped.
            </div>
        `;
    }
}

// Handle student signal response
function handleStudentSignalResponse(data) {
    console.log('Student signal response:', data);
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        if (data.success) {
            statusElement.innerHTML = `
                <div class="text-green-600 font-medium">
                    <i class="fas fa-check-circle mr-2"></i>${data.message}
                </div>
                <div class="text-sm text-gray-600 mt-2">
                    Subject: ${data.subject || 'Unknown'} | Period: ${data.period || 'Unknown'}
                </div>
                <div class="text-sm text-blue-600 mt-2">
                    <i class="fas fa-clock mr-1"></i>Waiting for faculty confirmation...
                </div>
            `;
            
            // Start checking for faculty confirmation
            checkForFacultyConfirmation();
        } else {
            statusElement.innerHTML = `
                <div class="text-red-600 font-medium">
                    <i class="fas fa-exclamation-triangle mr-2"></i>${data.message}
                </div>
                <div class="text-sm text-gray-600 mt-2">
                    Please wait for the correct subject session or contact your faculty.
                </div>
            `;
        }
    }
}

// Show dashboard after login
function showDashboard() {
    document.getElementById('login-container').classList.add('hidden');
    document.getElementById('dashboard-container').classList.remove('hidden');
    // Ensure user info is rendered
    updateUserInfo();
    // Show the correct role view
    showRoleView(currentRole);
    initMobileMenu();
    initUserMenu();
    // Open a WebSocket connection for attendance flows
    try { if (!ws || ws.readyState !== WebSocket.OPEN) initWebSocket(); } catch (_) {}
}

// Show role-specific view
function showRoleView(role) {
    ['studentView', 'facultyView', 'adminView'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    });
    const roleView = document.getElementById(`${role}View`);
    if (roleView) roleView.classList.remove('hidden');
    // Always land on dashboard content for the role
    showSection('dashboard');
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
    ['dashboardSection', 'attendanceSection', 'timetableSection', 'notificationsSection', 'settingsSection', 'aboutSection'].forEach(s => {
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
    } else if (section === 'settings') {
        renderSettings();
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
            const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
            
            // Get today's classes
            const todayClasses = data.timetable.filter(entry => entry.day === currentDay);
            
            // Sort classes by time
            const timeSlots = TIME_SLOTS.map(slot => timeStringToMinutes(slot.start));
            todayClasses.sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
            
            let currentClass = null;
            let nextClass = null;
            
            // Find current class
            for (let i = 0; i < todayClasses.length; i++) {
                const classTime = todayClasses[i].startTime;
                const classEndTime = getClassEndTime(classTime);
                
                if (currentMinutes >= timeStringToMinutes(classTime) && currentMinutes < timeStringToMinutes(classEndTime)) {
                    currentClass = todayClasses[i];
                    nextClass = todayClasses[i + 1] || null;
                    break;
                } else if (currentMinutes < timeStringToMinutes(classTime)) {
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

// Helper function removed - no longer needed for simplified attendance system

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
            todayClasses.sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
            
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

// Helper: Convert 12-hour time string to minutes since midnight
function timeStringToMinutes(timeStr) {
    if (!timeStr) return 0;
    const str = String(timeStr).trim();
    const parts = str.split(' ');
    let [hStr, mStr] = parts[0].split(':');
    let hours = parseInt(hStr, 10);
    let minutes = parseInt(mStr, 10);
    const modifier = parts[1]; // 'AM' | 'PM' | undefined
    if (modifier === 'PM' && hours !== 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    if (!modifier) {
        // No AM/PM given. Our schedule uses 9:30..12:00 then 1:50, 2:40, 3:30 (afternoon)
        // Treat 1,2,3 as PM hours; otherwise assume morning.
        if (hours >= 1 && hours <= 3) hours += 12;
    }
    return (hours * 60) + minutes;
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
    console.log('Scan started:', data);
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div class="text-green-600 font-medium">
                <i class="fas fa-bluetooth mr-2"></i>${data.message || 'Bluetooth scanning started...'}
            </div>
            <div class="text-sm text-gray-600 mt-2">
                <i class="fas fa-spinner fa-spin mr-1"></i>Listening for student devices...
            </div>
        `;
    }
    
    // Start periodic attendance records update
    if (attendanceUpdateInterval) {
        clearInterval(attendanceUpdateInterval);
    }
    attendanceUpdateInterval = setInterval(updateAttendanceRecords, 5000); // Update every 5 seconds
}

// Handle scan stopped (faculty)
function handleScanStopped(data) {
    console.log('Scan stopped:', data);
    const statusElement = document.getElementById('bluetooth-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div class="text-red-600 font-medium">
                <i class="fas fa-stop mr-2"></i>${data.message || 'Bluetooth scanning stopped.'}
            </div>
            <div class="text-sm text-gray-600 mt-2">
                Scanning has been stopped.
            </div>
        `;
    }
    
    // Stop periodic attendance records update
    if (attendanceUpdateInterval) {
        clearInterval(attendanceUpdateInterval);
        attendanceUpdateInterval = null;
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

        // Hook menu items by IDs for reliability
        const profileLink = document.getElementById('menu-profile-link');
        const settingsLink = document.getElementById('menu-settings-link');
        profileLink?.addEventListener('click', (e) => { e.preventDefault(); openProfileModal(); userMenu.classList.add('hidden'); });
        settingsLink?.addEventListener('click', (e) => { e.preventDefault(); showSection('settings'); userMenu.classList.add('hidden'); });
    }
}

// Logout function
function logout() {
    window.location.reload();
}

// ===============================
// Settings & Profile
// ===============================

function openProfileModal() {
    const modal = document.getElementById('profile-modal');
    const content = document.getElementById('profile-content');
    if (!modal || !content || !currentUser) return;
    const rows = [
        { label: 'Full Name', value: currentUser.name || '-' },
        { label: 'Role', value: currentRole },
        { label: 'Department', value: currentUser.department || '-' },
        { label: 'Roll / ID', value: currentUser.roll || '-' },
        { label: 'Branch', value: currentUser.branch || '-' },
        { label: 'Year', value: currentUser.year ?? '-' },
        { label: 'Section', value: currentUser.section || '-' },
        { label: 'Semester', value: currentUser.semester || '-' },
        { label: 'Email', value: currentUser.email || '-' }
    ];
    content.innerHTML = rows.map(r => `<div class="flex justify-between"><span class="text-gray-500">${r.label}</span><span class="font-medium">${r.value}</span></div>`).join('');
    modal.classList.remove('hidden');
}

function closeProfileModal() {
    const modal = document.getElementById('profile-modal');
    modal && modal.classList.add('hidden');
}

function renderSettings() {
    const section = document.getElementById('settingsSection');
    if (!section) return;
    section.innerHTML = `
    <div class="bg-white rounded-xl shadow-md overflow-hidden">
      <div class="gradient-bg p-4 text-white flex justify-between items-center">
        <h2 class="text-xl font-bold">Settings</h2>
        <button onclick="showSection('dashboard')" class="text-sm font-medium hover:text-indigo-200"><i class="fas fa-arrow-left mr-2"></i>Back</button>
      </div>
      <div class="p-6 space-y-8">
        <div>
          <h3 class="font-semibold mb-2">Theme</h3>
          <div class="flex gap-3">
            <button class="px-3 py-2 border rounded" onclick="setTheme('light')">Light</button>
            <button class="px-3 py-2 border rounded" onclick="setTheme('dark')">Dark</button>
            <button class="px-3 py-2 border rounded" onclick="setTheme('system')">System</button>
          </div>
          <p class="text-xs text-gray-500 mt-2">Current: <span id="theme-current"></span></p>
        </div>
        <div class="border-t pt-6">
          <h3 class="font-semibold mb-2">Change Password</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input id="pw-old" type="password" class="px-3 py-2 border rounded" placeholder="Current password">
            <input id="pw-new" type="password" class="px-3 py-2 border rounded" placeholder="New password">
            <input id="pw-confirm" type="password" class="px-3 py-2 border rounded" placeholder="Confirm new password">
          </div>
          <div class="mt-3">
            <button class="px-4 py-2 bg-indigo-600 text-white rounded" onclick="changePassword()">Update Password</button>
            <span id="pw-msg" class="ml-3 text-sm"></span>
          </div>
        </div>
      </div>
    </div>`;
    // initialize theme label
    document.getElementById('theme-current').textContent = (localStorage.getItem('theme') || 'system');
}

function setTheme(mode) {
    localStorage.setItem('theme', mode);
    document.getElementById('theme-current').textContent = mode;
    // toggle class on html for dark mode; simple approach without changing core styles
    const root = document.documentElement;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldDark = mode === 'dark' || (mode === 'system' && prefersDark);
    root.classList.toggle('dark', !!shouldDark);
}

async function changePassword() {
    const oldPw = document.getElementById('pw-old').value;
    const newPw = document.getElementById('pw-new').value;
    const confirmPw = document.getElementById('pw-confirm').value;
    const msg = document.getElementById('pw-msg');
    msg.textContent = '';
    msg.className = 'ml-3 text-sm';
    if (!oldPw || !newPw || !confirmPw) { msg.textContent = 'Fill all fields'; msg.classList.add('text-red-600'); return; }
    if (newPw !== confirmPw) { msg.textContent = 'Passwords do not match'; msg.classList.add('text-red-600'); return; }
    try {
        const res = await fetch('/api/user/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roll: currentUser.roll, oldPassword: oldPw, newPassword: newPw }) });
        const data = await res.json();
        if (data.success) { msg.textContent = 'Password updated'; msg.classList.add('text-green-600'); document.getElementById('pw-old').value=''; document.getElementById('pw-new').value=''; document.getElementById('pw-confirm').value=''; }
        else { msg.textContent = data.message || 'Failed'; msg.classList.add('text-red-600'); }
    } catch (e) { msg.textContent = 'Network error'; msg.classList.add('text-red-600'); }
}


// Duplicate function removed - using the improved version above

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
            
            // Group by normalized start time (no AM/PM)
            const groupedByTime = data.timetable.reduce((acc, entry) => {
                const key = String(entry.startTime).split(' ')[0];
                if (!acc[key]) acc[key] = {};
                acc[key][entry.day] = { ...entry, startTime: key };
                return acc;
            }, {});
            // Sort keys by minutes to avoid jumbled ordering and include ALL times present
            const timeline = Object.keys(groupedByTime).sort((a,b) => timeStringToMinutes(a) - timeStringToMinutes(b));
            for (const time of timeline) {
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
            days.forEach(day => {
        grouped[day].sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
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
    const semester = document.getElementById('admin-semester-select')?.value || '';
    document.querySelectorAll('.interactive-timetable-input').forEach(input => input.value = '');
    try {
        const query = new URLSearchParams({ branch, year, section, ...(semester ? { semester } : {}) }).toString();
        const response = await fetch(`/api/admin/timetable?${query}`);
        const data = await response.json();
        if (data.success && data.timetable) {
            const periodMap = { '9:30': 1, '10:20': 2, '11:10': 3, '12:00': 4, '1:50': 5, '2:40': 6, '3:30': 7 };
            data.timetable.forEach(slot => {
                const start = String(slot.startTime).split(' ')[0];
                const period = periodMap[start];
                if (period) {
                    const sel = (p, placeholder) => `input[data-day="${slot.day.toUpperCase()}"][data-period="${p}"][placeholder="${placeholder}"]`;
                    document.querySelector(sel(period, "Subject")).value = slot.subject || '';
                    document.querySelector(sel(period, "Faculty ID")).value = slot.facultyId || '';
                    document.querySelector(sel(period, "Room")).value = slot.room || '';
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
    const semester = document.getElementById('admin-semester-select')?.value || '';
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
            body: JSON.stringify({ branch, year, section, semester, updates: timetableData })
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

// Simplified attendance system - no session restrictions

// Student attendance function - enhanced to work with sessions
function markAttendance() {
    if (!isBluetoothSupported) {
        const statusElement = document.getElementById('attendance-status');
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="text-red-600 font-medium">
                    <i class="fas fa-exclamation-triangle mr-2"></i>Bluetooth not supported on this device
                </div>
                <div class="text-sm text-gray-600 mt-2">
                    Please use a device with Bluetooth capabilities and Chrome browser.
                </div>
            `;
        }
        return;
    }
    
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div class="text-yellow-600 font-medium">
                <i class="fas fa-bluetooth mr-2"></i>Sending attendance signal...
            </div>
            <div class="text-sm text-gray-600 mt-2">
                Broadcasting your attendance signal to faculty system...
            </div>
        `;
    }
    
    // Use the new Bluetooth system - STUDENTS JUST SEND SIGNALS, NO SCANNING
    if (window.bluetoothSystem) {
        // First check for active faculty session
        window.bluetoothSystem.checkActiveSession().then(sessionInfo => {
            if (!sessionInfo) {
                // No active session
                if (statusElement) {
                    statusElement.innerHTML = `
                        <div class="text-yellow-600 font-medium">
                            <i class="fas fa-exclamation-triangle mr-2"></i>No Active Faculty Session
                        </div>
                        <div class="text-sm text-gray-600 mt-2">
                            Please wait for your faculty to start an attendance session.
                        </div>
                    `;
                }
                return;
            }
            
            // Show session info
            if (statusElement) {
                statusElement.innerHTML = `
                    <div class="text-blue-600 font-medium">
                        <i class="fas fa-info-circle mr-2"></i>Active Session Found
                    </div>
                    <div class="text-sm text-gray-600 mt-2">
                        Subject: ${sessionInfo.subject} | Class: ${sessionInfo.branch}${sessionInfo.year}${sessionInfo.section}
                    </div>
                    <div class="text-sm text-blue-600 mt-2">
                        <i class="fas fa-spinner fa-spin mr-1"></i>Sending attendance signal...
                    </div>
                `;
            }
            
            // Now send attendance signal
            return window.bluetoothSystem.markStudentAttendance();
        }).then(() => {
            // Show waiting message
            if (statusElement) {
                statusElement.innerHTML = `
                    <div class="text-blue-600 font-medium">
                        <i class="fas fa-clock mr-2"></i>Signal sent! Waiting for faculty confirmation...
                    </div>
                    <div class="text-sm text-gray-600 mt-2">
                        Your attendance signal has been broadcast. Faculty will detect it automatically.
                    </div>
                `;
            }
            
            // Start checking for faculty confirmation
            checkForFacultyConfirmation();
        }).catch(error => {
            // Show error message
            if (statusElement) {
                statusElement.innerHTML = `
                    <div class="text-red-600 font-medium">
                        <i class="fas fa-exclamation-triangle mr-2"></i>Signal failed to send
                    </div>
                    <div class="text-sm text-gray-600 mt-2">
                        Error: ${error.message}. Please try again.
                    </div>
                `;
            }
        });
    } else {
        // Fallback to simple attendance marking
        console.warn('Bluetooth system not available, using simple attendance marking');
        markSimpleAttendance();
    }
}

// Check for faculty confirmation of attendance
function checkForFacultyConfirmation() {
    const checkInterval = setInterval(() => {
        // Check if attendance was marked by faculty
        const studentRoll = localStorage.getItem('currentUserId') || currentUser?.roll || 'S101';
        const today = new Date().toISOString().split('T')[0];
        
        fetch(`/api/student/attendance/status?roll=${studentRoll}&date=${today}`)
            .then(response => response.json())
            .then(data => {
                if (data.success && data.attendance) {
                    // Attendance confirmed! Show success message
                    const statusElement = document.getElementById('attendance-status');
                    if (statusElement) {
                        statusElement.innerHTML = `
                            <div class="text-green-600 font-medium">
                                <i class="fas fa-check-circle mr-2"></i>Attendance Confirmed!
                            </div>
                            <div class="text-sm text-gray-600 mt-2">
                                Subject: ${data.attendance.subject || 'Unknown'} | 
                                Faculty: ${data.attendance.facultyName || 'Unknown Faculty'} | 
                                Time: ${new Date(data.attendance.timestamp).toLocaleTimeString()}
                            </div>
                        `;
                    }
                    clearInterval(checkInterval);
                }
            })
            .catch(error => {
                console.error('Error checking attendance status:', error);
            });
    }, 3000); // Check every 3 seconds
    
    // Stop checking after 2 minutes
    setTimeout(() => {
        clearInterval(checkInterval);
        const statusElement = document.getElementById('attendance-status');
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="text-yellow-600 font-medium">
                    <i class="fas fa-exclamation-triangle mr-2"></i>No confirmation received
                </div>
                <div class="text-sm text-gray-600 mt-2">
                    Please contact your faculty if attendance was not marked.
                </div>
            `;
        }
    }, 120000);
}

// Start periodic session checking for students
let sessionCheckInterval = null;

function startSessionChecking() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
    }
    
    sessionCheckInterval = setInterval(async () => {
        if (currentRole === 'student' && window.bluetoothSystem) {
            try {
                const sessionInfo = await window.bluetoothSystem.checkActiveSession();
                if (sessionInfo) {
                    // Update UI to show active session is available
                    const statusElement = document.getElementById('attendance-status');
                    if (statusElement && !statusElement.innerHTML.includes('Active Session Found')) {
                        statusElement.innerHTML = `
                            <div class="text-green-600 font-medium">
                                <i class="fas fa-info-circle mr-2"></i>Faculty Session Available
                            </div>
                            <div class="text-sm text-gray-600 mt-2">
                                Subject: ${sessionInfo.subject} | Class: ${sessionInfo.branch}${sessionInfo.year}${sessionInfo.section}
                            </div>
                            <div class="text-sm text-blue-600 mt-2">
                                You can now mark your attendance for this session.
                            </div>
                        `;
                    }
                }
            } catch (error) {
                console.error('Error checking session:', error);
            }
        }
    }, 5000); // Check every 5 seconds
}

function stopSessionChecking() {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }
}

// Simplified attendance system - no timetable restrictions for marking attendance

// Session-based attendance function removed - using simplified system

// Legacy attendance function removed - now using improved session-based system

function startAttendanceSession() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'FACULTY_SCAN_START'
        }));
    }
    
    // Start real Bluetooth scanning
    setTimeout(() => {
        startRealBluetoothScanning();
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

// Real Bluetooth device discovery (replaces demo simulation)
function startRealBluetoothScanning() {
    if (window.bluetoothSystem) {
        window.bluetoothSystem.startAttendanceSession();
    } else {
        console.error('Bluetooth system not initialized');
        alert('Bluetooth system not available. Please refresh the page.');
    }
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
            // Update overall attendance
            const overallPercentageEl = document.getElementById('overall-percentage');
            const overallDetailsEl = document.getElementById('overall-details');
            
            if (overallPercentageEl && overallDetailsEl) {
                overallPercentageEl.textContent = `${data.overall.percentage}%`;
                overallDetailsEl.textContent = `Attended ${data.overall.attended} of ${data.overall.total} classes`;
            }
            
            // Update subject-wise attendance
            const subjectListDiv = document.getElementById('subject-wise-list');
            if (subjectListDiv) {
                subjectListDiv.innerHTML = '';
                
                // Check if we have subject-wise data
                if (data.subjectWise && Object.keys(data.subjectWise).length > 0) {
                    // Show all subjects from the attendance data
                    for (const subject of Object.keys(data.subjectWise)) {
                        const stats = data.subjectWise[subject];
                        const card = document.createElement('div');
                        card.className = 'bg-white rounded-lg shadow p-4';
                        card.innerHTML = `
                            <div class="flex justify-between items-center">
                                <span class="font-bold">${subject}</span>
                                <span>${stats.attended}/${stats.total}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                <div class="bg-indigo-600 h-2.5 rounded-full" style="width: ${stats.percentage}%"></div>
                            </div>
                            <p class="text-right text-lg font-semibold mt-1">${stats.percentage}%</p>
                        `;
                        subjectListDiv.appendChild(card);
                    }
                } else {
                    // No subject-wise data, show general attendance
                    subjectListDiv.innerHTML = `
                        <div class="text-center py-8 text-gray-500">
                            <p>No attendance data available yet.</p>
                            <p class="text-sm">Mark your first attendance to see statistics.</p>
                        </div>
                    `;
                }
            }
        } else {
            console.error('Failed to load attendance summary:', data.message);
            // Show error message
            const subjectListDiv = document.getElementById('subject-wise-list');
            if (subjectListDiv) {
                subjectListDiv.innerHTML = `
                    <div class="text-center py-8 text-red-500">
                        <p>Failed to load attendance data.</p>
                        <p class="text-sm">${data.message || 'Please try again later.'}</p>
                    </div>
                `;
            }
        }
    } catch (error) { 
        console.error("Failed to load summary:", error);
        // Show error message
        const subjectListDiv = document.getElementById('subject-wise-list');
        if (subjectListDiv) {
            subjectListDiv.innerHTML = `
                <div class="text-center py-8 text-red-500">
                    <p>Error loading attendance data.</p>
                    <p class="text-sm">Please check your connection and try again.</p>
                </div>
            `;
        }
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

// Enhanced Faculty Attendance Functions

// Load faculty classes
async function loadFacultyClasses() {
    try {
        const facultyId = (currentUser && currentUser.roll) || localStorage.getItem('currentUserId') || 'F101';
        console.log('Loading classes for faculty:', facultyId);
        
        const response = await fetch(`/api/faculty/classes/${facultyId}`);
        const data = await response.json();
        
        console.log('Faculty classes response:', data);
        
        if (data.success) {
            const classSelect = document.getElementById('class-select');
            if (!classSelect) {
                console.error('Class select element not found');
                return;
            }
            
            classSelect.innerHTML = '<option value="">Select Subject</option>';
            
            if (!data.classes || data.classes.length === 0) {
                const opt = document.createElement('option');
                opt.disabled = true; 
                opt.textContent = 'No classes mapped - Check timetable configuration';
                classSelect.appendChild(opt);
                
                // Show helper text
                const helper = document.getElementById('class-select-helper');
                if (helper) {
                    helper.textContent = 'No classes found. Please ensure your timetable is properly configured.';
                    helper.className = 'text-xs text-red-500 mt-1';
                }
                return;
            }
            
            data.classes.forEach(cls => {
                const option = document.createElement('option');
                option.value = cls._id;
                option.textContent = `${cls.subject} => ${cls.branch}, ${cls.year} - ${cls.semester} ${cls.section}`;
                classSelect.appendChild(option);
            });
            
            // Update helper text
            const helper = document.getElementById('class-select-helper');
            if (helper) {
                helper.textContent = `${data.classes.length} class(es) found for your timetable`;
                helper.className = 'text-xs text-green-500 mt-1';
            }
        } else {
            console.error('Failed to load faculty classes:', data);
            const classSelect = document.getElementById('class-select');
            if (classSelect) {
                classSelect.innerHTML = '<option value="">Error loading classes</option>';
            }
        }
    } catch (error) {
        console.error('Error loading faculty classes:', error);
        const classSelect = document.getElementById('class-select');
        if (classSelect) {
            classSelect.innerHTML = '<option value="">Network error</option>';
        }
    }
}

// Load students for selected class
// Function removed - using new simplified system

// Mark attendance function removed - using new simplified system

// Start enhanced attendance session
// Enhanced attendance session function removed - using new simplified system

// Enhanced attendance session stop function removed - using new simplified system

// Update attendance records function removed - using new simplified system

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
    
    // Cleanup function for intervals
    window.addEventListener('beforeunload', () => {
        if (attendanceUpdateInterval) {
            clearInterval(attendanceUpdateInterval);
        }
    });
}); 

// Simple attendance marking function - no timetable restrictions
function markSimpleAttendance() {
    const statusElement = document.getElementById('attendance-status');
    if (statusElement) {
        statusElement.innerHTML = `
            <div class="text-blue-600 font-medium">
                <i class="fas fa-check-circle mr-2"></i>Marking attendance...
            </div>
            <div class="text-sm text-gray-600 mt-2">
                Sending attendance signal to faculty system...
            </div>
        `;
    }
    
    // Simulate Bluetooth attendance marking
    setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const studentRoll = currentUser?.roll || localStorage.getItem('currentUserId') || 'S101';
            
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
                    period: 1 // Default period
                }));
            }, 1000);
        }
    }, 2000);
}

// Show students for attendance marking
async function showStudentsForAttendance() {
    const classSelect = document.getElementById('class-select');
    if (!classSelect || !classSelect.value) {
        console.error('No class selected');
        alert('Please select a class first');
        return;
    }
    
    try {
        const response = await fetch(`/api/faculty/class/${classSelect.value}/students`);
        const data = await response.json();
        
        if (data.success) {
            const studentsDiv = document.getElementById('class-students');
            if (studentsDiv) {
                studentsDiv.innerHTML = `
                    <div class="bg-blue-50 p-3 rounded-lg mb-3">
                        <h5 class="font-medium text-blue-800">${data.classData.subject} - ${data.classData.branch}${data.classData.year}${data.classData.section}</h5>
                        <p class="text-sm text-blue-600">Students: ${data.students.length}</p>
                    </div>
                    <div class="max-h-64 overflow-y-auto space-y-2">
                        ${data.students.map((student, index) => `
                            <div class="flex items-center justify-between p-2 border rounded-lg">
                                <span class="text-sm">${index + 1}. ${student.name} (${student.roll})</span>
                                <span class="text-xs text-gray-500">Period ${getSelectedPeriods().join(', ')}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        } else {
            alert('Failed to load students: ' + data.message);
        }
    } catch (error) {
        console.error('Error loading students:', error);
        alert('Error loading students');
    }
}

// Get selected periods
function getSelectedPeriods() {
    const periodCheckboxes = document.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(periodCheckboxes).map(cb => parseInt(cb.value));
}

// Start attendance session
async function startAttendanceSession() {
    const classSelect = document.getElementById('class-select');
    const dateInput = document.getElementById('attendance-date');
    const periods = getSelectedPeriods();
    
    if (!classSelect || !classSelect.value) {
        console.error('No class selected');
        alert('Please select a class first');
        return;
    }
    
    if (periods.length === 0) {
        alert('Please select at least one period');
        return;
    }
    
    try {
        // Parse class info from the selected option
        const classText = classSelect.options[classSelect.selectedIndex].text;
        const match = classText.match(/(.+) => (.+), (\d+) - (.+) (.+)/);
        
        if (!match) {
            alert('Invalid class format');
            return;
        }
        
        const [, subject, branch, year, semester, section] = match;
        const facultyId = currentUser?.roll || 'F101';
        
        const response = await fetch('/api/faculty/attendance/start-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subject,
                branch,
                year: parseInt(year),
                section,
                periods,
                date: dateInput.value,
                facultyId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Store session information for students to access
            const sessionInfo = {
                subject,
                branch,
                year,
                section,
                periods,
                date: dateInput.value,
                facultyId,
                sessionId: data.sessionId || Date.now().toString()
            };
            
            // Store in both localStorage and sessionStorage for students
            localStorage.setItem('currentAttendanceSession', JSON.stringify(sessionInfo));
            sessionStorage.setItem('currentAttendanceSession', JSON.stringify(sessionInfo));
            
            // Update UI
            const statusElement = document.getElementById('bluetooth-status');
            if (statusElement) {
                statusElement.innerHTML = `
                    <div class="text-green-600 font-medium">
                        <i class="fas fa-bluetooth mr-2"></i>Session Active - Listening for student signals
                    </div>
                    <div class="text-sm text-gray-600 mt-2">
                        Subject: ${subject} | Periods: ${periods.join(', ')} | Date: ${dateInput.value}
                    </div>
                `;
            }
            
            // Start WebSocket scanning
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'FACULTY_SCAN_START' }));
            }
            
            // Start periodic updates
            startAttendanceUpdates();
            
            // Hide submit button (new session started)
            const submitBtn = document.getElementById('submit-attendance-btn');
            if (submitBtn) {
                submitBtn.classList.add('hidden');
            }
            
        } else {
            alert('Failed to start session: ' + data.message);
        }
    } catch (error) {
        console.error('Error starting session:', error);
        alert('Error starting attendance session');
    }
}

// Stop attendance session
async function stopAttendanceSession() {
    try {
        const response = await fetch('/api/faculty/attendance/stop-session', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update UI
            const statusElement = document.getElementById('bluetooth-status');
            if (statusElement) {
                statusElement.innerHTML = `
                    <div class="text-orange-600 font-medium">
                        <i class="fas fa-pause mr-2"></i>Session Stopped - Ready to Submit
                    </div>
                    <div class="text-sm text-gray-600 mt-2">
                        Attendance records collected: ${data.totalRecords} | Subject: ${data.session.subject} | Date: ${data.session.date}
                    </div>
                    <div class="text-sm text-blue-600 mt-2">
                        Click "Submit Attendance" to save records to database
                    </div>
                `;
            }
            
            // Stop WebSocket scanning
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'FACULTY_SCAN_STOP' }));
            }
            
            // Stop periodic updates
            stopAttendanceUpdates();
            
            // Show submit button
            const submitBtn = document.getElementById('submit-attendance-btn');
            if (submitBtn) {
                submitBtn.classList.remove('hidden');
            }
            
            // Generate complete attendance roster with all students
            await generateCompleteAttendanceRoster(data.records);
            
        } else {
            alert('Failed to stop session: ' + data.message);
        }
    } catch (error) {
        console.error('Error stopping session:', error);
        alert('Error stopping attendance session');
    }
}

// Generate complete attendance roster with all students
async function generateCompleteAttendanceRoster(detectedRecords) {
    try {
        const classSelect = document.getElementById('class-select');
        if (!classSelect || !classSelect.value) {
            console.error('No class selected');
            return;
        }

        // Get the complete student list for the selected class
        const response = await fetch(`/api/faculty/class/${classSelect.value}/students`);
        const data = await response.json();
        
        if (!data.success) {
            console.error('Failed to load students:', data.message || data.error);
            alert('Failed to load students: ' + (data.message || data.error));
            return;
        }

        if (!data.students || data.students.length === 0) {
            alert('No students found for the selected class. Please check the class configuration.');
            return;
        }

        const allStudents = data.students;
        const detectedStudentIds = new Set(detectedRecords.map(record => record.roll || record.studentRoll));
        
        console.log(`[FRONTEND] Generating roster: ${allStudents.length} total students, ${detectedStudentIds.size} detected via Bluetooth`);
        
        // Create attendance roster with status for each student
        const attendanceRoster = allStudents.map(student => {
            const isDetected = detectedStudentIds.has(student.roll);
            return {
                studentId: student.roll,
                studentName: student.name,
                status: isDetected ? 'Present' : 'Absent',
                timestamp: isDetected ? 
                    detectedRecords.find(r => r.roll === student.roll)?.timestamp || new Date() : 
                    new Date()
            };
        });

        // Store the roster globally for submission
        window.currentAttendanceRoster = attendanceRoster;
        
        // Display the complete roster
        displayCompleteAttendanceRoster(attendanceRoster);
        
    } catch (error) {
        console.error('Error generating attendance roster:', error);
        alert('Error generating attendance roster: ' + error.message);
    }
}

// Display complete attendance roster with manual override options
function displayCompleteAttendanceRoster(roster) {
    const recordsDiv = document.getElementById('attendance-records');
    if (!recordsDiv) {
        console.error('Attendance records div not found');
        return;
    }

    if (!roster || roster.length === 0) {
        recordsDiv.innerHTML = '<p class="text-gray-500">No students in roster</p>';
        return;
    }

    const presentCount = roster.filter(student => student.status === 'Present').length;
    const absentCount = roster.filter(student => student.status === 'Absent').length;

    recordsDiv.innerHTML = `
        <div class="mb-4 p-4 bg-blue-50 rounded-lg">
            <h5 class="font-medium text-blue-800 mb-2">Complete Attendance Roster</h5>
            <div class="grid grid-cols-3 gap-4 text-sm">
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-600">${presentCount}</div>
                    <div class="text-green-600">Present</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-red-600">${absentCount}</div>
                    <div class="text-red-600">Absent</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-blue-600">${roster.length}</div>
                    <div class="text-blue-600">Total</div>
                </div>
            </div>
            <p class="text-xs text-blue-600 mt-2">You can manually override any student's status before submitting</p>
        </div>
        <div class="max-h-96 overflow-y-auto space-y-2">
            ${roster.map((student, index) => `
                <div class="flex items-center justify-between p-3 border rounded-lg ${student.status === 'Present' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
                    <div class="flex items-center space-x-3">
                        <div class="flex-shrink-0">
                            ${student.status === 'Present' ? 
                                '<i class="fas fa-check-circle text-green-600 text-lg"></i>' : 
                                '<i class="fas fa-times-circle text-red-600 text-lg"></i>'
                            }
                        </div>
                        <div>
                            <div class="font-medium ${student.status === 'Present' ? 'text-green-800' : 'text-red-800'}">
                                ${student.studentName} (${student.studentId})
                            </div>
                            <div class="text-xs text-gray-600">Periods: ${getSelectedPeriods().join(', ')}</div>
                            ${student.status === 'Present' ? 
                                `<div class="text-xs text-gray-600">Time: ${new Date(student.timestamp).toLocaleTimeString()}</div>` : 
                                ''
                            }
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button 
                            onclick="toggleStudentStatus(${index})" 
                            class="px-3 py-1 text-xs rounded-lg border transition-colors ${
                                student.status === 'Present' 
                                    ? 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' 
                                    : 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                            }"
                            title="${student.status === 'Present' ? 'Click to mark as absent' : 'Click to mark as present'}"
                        >
                            ${student.status === 'Present' ? 'Mark Absent' : 'Mark Present'}
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p class="text-sm text-yellow-800">
                <i class="fas fa-info-circle mr-2"></i>
                Review the attendance status above. You can manually change any student's status before submitting.
            </p>
        </div>
    `;
}

// Toggle student attendance status
function toggleStudentStatus(studentIndex) {
    if (!window.currentAttendanceRoster) return;
    
    const student = window.currentAttendanceRoster[studentIndex];
    student.status = student.status === 'Present' ? 'Absent' : 'Present';
    
    if (student.status === 'Present') {
        student.timestamp = new Date();
    }
    
    // Refresh the display
    displayCompleteAttendanceRoster(window.currentAttendanceRoster);
}

// Start periodic attendance updates
let attendanceUpdateInterval = null;

function startAttendanceUpdates() {
    if (attendanceUpdateInterval) {
        clearInterval(attendanceUpdateInterval);
    }
    
    attendanceUpdateInterval = setInterval(async () => {
        try {
            const response = await fetch('/api/faculty/attendance/session-status');
            const data = await response.json();
            
            if (data.success && data.active) {
                // Ensure records is always an array, even if the API returns undefined
                const records = data.records || [];
                updateDetectedSignals(records);
                updateAttendanceRecords(records);
            }
        } catch (error) {
            console.error('Error updating attendance:', error);
            // Don't crash the interval, just log the error
        }
    }, 2000); // Update every 2 seconds
}

// Stop periodic attendance updates
function stopAttendanceUpdates() {
    if (attendanceUpdateInterval) {
        clearInterval(attendanceUpdateInterval);
        attendanceUpdateInterval = null;
    }
}

// Update detected signals display
function updateDetectedSignals(records) {
    // Guard clause to prevent crash when records is undefined or null
    if (!records || !Array.isArray(records)) {
        console.warn('[FRONTEND] updateDetectedSignals called with invalid records:', records);
        return;
    }
    
    const signalsDiv = document.getElementById('detected-signals');
    if (signalsDiv) {
        if (records.length === 0) {
            signalsDiv.innerHTML = '<p class="text-gray-500">No student signals detected yet</p>';
        } else {
            signalsDiv.innerHTML = records.map(record => `
                <div class="p-2 border rounded-lg bg-blue-50">
                    <div class="text-sm font-medium text-blue-800">✓ Student Signal Detected</div>
                    <div class="text-xs text-gray-600">Roll Number: ${record.roll || record.studentRoll || 'N/A'}</div>
                    <div class="text-xs text-gray-600">Student Name: ${record.name || record.studentName || 'N/A'}</div>
                    <div class="text-xs text-gray-600">Device ID: ${record.deviceId || 'N/A'}</div>
                    <div class="text-xs text-gray-600">Signal Strength: ${record.rssi || 'N/A'} dBm</div>
                    <div class="text-xs text-gray-600">Time: ${new Date(record.timestamp).toLocaleTimeString()}</div>
                </div>
            `).join('');
        }
    }
}

// Update attendance records display
function updateAttendanceRecords(records) {
    // Guard clause to prevent crash when records is undefined or null
    if (!records || !Array.isArray(records)) {
        console.warn('[FRONTEND] updateAttendanceRecords called with invalid records:', records);
        return;
    }
    
    const recordsDiv = document.getElementById('attendance-records');
    if (recordsDiv) {
        if (records.length === 0) {
            recordsDiv.innerHTML = '<p class="text-gray-500">No attendance records yet</p>';
        } else {
            recordsDiv.innerHTML = records.map(record => `
                <div class="p-2 border rounded-lg bg-green-50">
                    <div class="text-sm font-medium text-green-800">✓ Present</div>
                    <div class="text-xs text-gray-600">Roll: ${record.roll}</div>
                    <div class="text-xs text-gray-600">Period: ${record.period}</div>
                    <div class="text-xs text-gray-600">Time: ${new Date(record.timestamp).toLocaleTimeString()}</div>
                </div>
            `).join('');
        }
    }
}

// Show final attendance records after session ends
function showFinalAttendanceRecords(records) {
    // Guard clause to prevent crash when records is undefined or null
    if (!records || !Array.isArray(records)) {
        console.warn('[FRONTEND] showFinalAttendanceRecords called with invalid records:', records);
        return;
    }
    
    const recordsDiv = document.getElementById('attendance-records');
    if (recordsDiv) {
        if (records.length === 0) {
            recordsDiv.innerHTML = '<p class="text-gray-500">No attendance records for this session</p>';
        } else {
            recordsDiv.innerHTML = `
                <div class="mb-3 p-3 bg-green-100 rounded-lg">
                    <h5 class="font-medium text-green-800">Session Complete!</h5>
                    <p class="text-sm text-green-600">Total attendance: ${records.length} students</p>
                </div>
                ${records.map(record => `
                    <div class="p-2 border rounded-lg bg-green-50">
                        <div class="text-sm font-medium text-green-800">✓ ${record.studentRoll}</div>
                        <div class="text-xs text-gray-600">Period: ${record.period}</div>
                        <div class="text-xs text-gray-600">Subject: ${record.subject}</div>
                        <div class="text-xs text-gray-600">Time: ${new Date(record.timestamp).toLocaleTimeString()}</div>
                </div>
            `).join('')}
            `;
        }
    }
}

// Submit attendance records manually
async function submitAttendance() {
    try {
        console.log('🚀 [FRONTEND] Starting attendance submission...');
        
        // Check if we have a complete roster
        if (!window.currentAttendanceRoster || window.currentAttendanceRoster.length === 0) {
            console.error('❌ [FRONTEND] No attendance roster to submit');
            alert('No attendance roster to submit. Please stop the session first to generate the roster.');
            return;
        }

        console.log('📋 [FRONTEND] Current attendance roster:', window.currentAttendanceRoster);

        const submitBtn = document.getElementById('submit-attendance-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Submitting...';
        }
        
        // Get form values
        const classSelect = document.getElementById('class-select');
        const dateInput = document.getElementById('attendance-date');
        const periods = getSelectedPeriods();
        
        console.log('📝 [FRONTEND] Form values:', {
            classId: classSelect?.value,
            date: dateInput?.value,
            periods: periods,
            facultyId: currentUser?.roll || localStorage.getItem('currentUserId') || 'F101'
        });
        
        // Validate form values
        if (!classSelect?.value) {
            console.error('❌ [FRONTEND] No class selected');
            alert('Please select a class first');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Submit Attendance';
            }
            return;
        }
        
        if (!dateInput?.value) {
            console.error('❌ [FRONTEND] No date selected');
            alert('Please select a date first');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Submit Attendance';
            }
            return;
        }
        
        if (!periods || periods.length === 0) {
            console.error('❌ [FRONTEND] No periods selected');
            alert('Please select at least one period');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Submit Attendance';
            }
            return;
        }
        
        // Prepare the attendance data for submission
        const attendanceData = {
            roster: window.currentAttendanceRoster,
            classId: classSelect.value,
            date: dateInput.value,
            periods: periods,
            facultyId: currentUser?.roll || localStorage.getItem('currentUserId') || 'F101'
        };
        
        console.log('📤 [FRONTEND] Prepared attendance data for submission:', attendanceData);
        console.log('📊 [FRONTEND] Roster summary:', {
            totalStudents: attendanceData.roster.length,
            presentCount: attendanceData.roster.filter(s => s.status === 'Present').length,
            absentCount: attendanceData.roster.filter(s => s.status === 'Absent').length
        });
        
        // Validate roster data structure
        console.log('🔍 [FRONTEND] Validating roster data structure...');
        const rosterValidationErrors = [];
        
        attendanceData.roster.forEach((student, index) => {
            if (!student.studentId) {
                rosterValidationErrors.push(`Student ${index + 1}: Missing studentId`);
            }
            if (!student.studentName) {
                rosterValidationErrors.push(`Student ${index + 1}: Missing studentName`);
            }
            if (!student.status || !['Present', 'Absent'].includes(student.status)) {
                rosterValidationErrors.push(`Student ${index + 1}: Invalid status "${student.status}"`);
            }
        });
        
        if (rosterValidationErrors.length > 0) {
            console.error('❌ [FRONTEND] Roster validation failed:', rosterValidationErrors);
            alert('Invalid roster data: ' + rosterValidationErrors.join(', '));
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Submit Attendance';
            }
            return;
        }
        
        console.log('✅ [FRONTEND] Roster validation passed');
        
        console.log('🌐 [FRONTEND] Sending request to /api/attendance/mark...');
        
        const response = await fetch('/api/attendance/mark', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(attendanceData)
        });
        
        console.log('📥 [FRONTEND] Response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });
        
        const data = await response.json();
        console.log('📋 [FRONTEND] Response data:', data);
        
        if (data.success) {
            console.log('✅ [FRONTEND] Attendance submitted successfully!');
            
            // Show success message
            const statusElement = document.getElementById('bluetooth-status');
            if (statusElement) {
                statusElement.innerHTML = `
                    <div class="text-green-600 font-medium">
                        <i class="fas fa-check-circle mr-2"></i>Attendance Submitted Successfully!
                    </div>
                    <div class="text-sm text-gray-600 mt-2">
                        Total records saved: ${data.totalRecords} | Subject: ${data.subject} | Date: ${data.date}
                    </div>
                    <div class="text-sm text-blue-600 mt-2">
                        Students can now view their updated attendance in their dashboard.
                    </div>
                `;
            }
            
            // Hide submit button
            if (submitBtn) {
                submitBtn.classList.add('hidden');
            }
            
            // Show final attendance records
            if (data.savedRecords) {
                showFinalAttendanceRecords(data.savedRecords);
            }
            
            // Clear the current roster
            window.currentAttendanceRoster = null;
            
            // Refresh student attendance data
            setTimeout(() => {
                if (currentUser && currentRole === 'faculty') {
                    // Trigger a refresh of student attendance data
                    console.log('🔄 [FRONTEND] Attendance submitted successfully, student data will be updated');
                }
            }, 1000);
            
        } else {
            console.error('❌ [FRONTEND] Backend returned error:', data);
            alert('Failed to submit attendance: ' + data.message);
            
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Submit Attendance';
            }
        }
    } catch (error) {
        console.error('💥 [FRONTEND] Network or other error during submission:', error);
        console.error('💥 [FRONTEND] Error details:', {
            message: error.message,
            stack: error.stack
        });
        alert('Network error submitting attendance: ' + error.message);
        
        // Re-enable submit button
        const submitBtn = document.getElementById('submit-attendance-btn');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Submit Attendance';
        }
    }
}

// Show collected attendance records (before submission)
function showCollectedAttendanceRecords(records) {
    // Guard clause to prevent crash when records is undefined or null
    if (!records || !Array.isArray(records)) {
        console.warn('[FRONTEND] showCollectedAttendanceRecords called with invalid records:', records);
        return;
    }
    
    const recordsDiv = document.getElementById('attendance-records');
    if (recordsDiv) {
        if (records.length === 0) {
            recordsDiv.innerHTML = '<p class="text-gray-500">No attendance records collected in this session</p>';
        } else {
            recordsDiv.innerHTML = `
                <div class="mb-3 p-3 bg-orange-100 rounded-lg">
                    <h5 class="font-medium text-orange-800">Session Records (Not Saved Yet)</h5>
                    <p class="text-sm text-orange-600">Total collected: ${records.length} students</p>
                    <p class="text-xs text-orange-500">Click "Submit Attendance" to save these records</p>
                </div>
                ${records.map(record => `
                    <div class="p-2 border rounded-lg bg-orange-50">
                        <div class="text-sm font-medium text-orange-800">✓ ${record.roll}</div>
                        <div class="text-xs text-gray-600">Period: ${record.period}</div>
                        <div class="text-xs text-gray-600">Time: ${new Date(record.timestamp).toLocaleTimeString()}</div>
                    </div>
                `).join('')}
            `;
        }
    }
}

// ========================================================
//          BLUETOOTH SYSTEM CLASS
// ========================================================

class BluetoothSystem {
    constructor() {
        this.isSupported = 'bluetooth' in navigator;
        this.isScanning = false;
        this.discoveredDevices = new Map();
        this.currentSession = null;
    }

    // Mark student attendance - sends signal to faculty
    async markStudentAttendance() {
        if (!this.isSupported) {
            throw new Error('Bluetooth not supported on this device');
        }

        try {
            // Get current user info
            const studentRoll = currentUser?.roll || localStorage.getItem('currentUserId') || 'S101';
            const studentName = currentUser?.name || 'Student';
            
            // Get current subject from faculty session
            const currentSubject = this.getCurrentSubject();
            
            // Create attendance signal data
            const signalData = {
                type: 'STUDENT_ATTENDANCE_SIGNAL',
                roll: studentRoll,
                name: studentName,
                deviceId: this.generateDeviceId(),
                timestamp: new Date().toISOString(),
                subject: currentSubject
            };

            // Send signal via WebSocket if available
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(signalData));
                
                // Also store locally for backup
                this.storeAttendanceSignal(signalData);
                
                return Promise.resolve('Signal sent successfully');
            } else {
                // Fallback: store signal locally and wait for WebSocket connection
                this.storeAttendanceSignal(signalData);
                return Promise.resolve('Signal stored locally, waiting for connection');
            }
        } catch (error) {
            console.error('Error marking attendance:', error);
            throw error;
        }
    }

    // Generate unique device ID
    generateDeviceId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `student_${currentUser?.roll || 'S101'}_${timestamp}_${random}`;
    }

    // Get current subject from faculty session (if available)
    getCurrentSubject() {
        // Try to get subject from localStorage or session storage
        const sessionData = localStorage.getItem('currentAttendanceSession') || 
                           sessionStorage.getItem('currentAttendanceSession');
        
        if (sessionData) {
            try {
                const session = JSON.parse(sessionData);
                if (session.subject && session.subject !== 'Unknown') {
                    return session.subject;
                }
            } catch (e) {
                console.error('Error parsing session data:', e);
            }
        }
        
        // If no valid session data, show warning to student
        console.warn('No active faculty attendance session found. Student should wait for faculty to start session.');
        return 'Unknown';
    }

    // Store attendance signal locally
    storeAttendanceSignal(signalData) {
        const signals = JSON.parse(localStorage.getItem('studentAttendanceSignals') || '[]');
        signals.push(signalData);
        localStorage.setItem('studentAttendanceSignals', JSON.stringify(signals));
        
        // Also store in session storage for current session
        sessionStorage.setItem('studentAttendanceSignals', JSON.stringify(signals));
    }

    // Check for active faculty session and get subject info
    async checkActiveSession() {
        try {
            const response = await fetch('/api/faculty/attendance/session-status');
            const data = await response.json();
            
            if (data.success && data.active && data.session) {
                // Store session info for students
                const sessionInfo = {
                    subject: data.session.subject,
                    branch: data.session.branch,
                    year: data.session.year,
                    section: data.session.section,
                    periods: data.session.periods,
                    date: data.session.date,
                    facultyId: data.session.facultyId
                };
                
                localStorage.setItem('currentAttendanceSession', JSON.stringify(sessionInfo));
                sessionStorage.setItem('currentAttendanceSession', JSON.stringify(sessionInfo));
                
                return sessionInfo;
            } else {
                // Clear session info if no active session
                localStorage.removeItem('currentAttendanceSession');
                sessionStorage.removeItem('currentAttendanceSession');
                return null;
            }
        } catch (error) {
            console.error('Error checking active session:', error);
            return null;
        }
    }

    // Start attendance session (for faculty)
    startAttendanceSession() {
        if (this.isScanning) {
            return { success: false, message: 'Session already active' };
        }
        
        this.isScanning = true;
        
        // Start WebSocket scanning
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'FACULTY_SCAN_START' }));
        }
        
        return { success: true, message: 'Attendance session started' };
    }

    // Stop attendance session (for faculty)
    stopAttendanceSession() {
        if (!this.isScanning) {
            return { success: false, message: 'No active session' };
        }
        
        this.isScanning = false;
        
        // Stop WebSocket scanning
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'FACULTY_SCAN_STOP' }));
        }
        
        return { success: true, message: 'Attendance session stopped' };
    }
}

// Initialize BluetoothSystem globally
window.bluetoothSystem = new BluetoothSystem();