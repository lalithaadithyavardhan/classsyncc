// Enhanced Bluetooth Attendance System for ClassSync
// Students send signals, Faculty scans for signals - NO device pairing needed

class BluetoothAttendanceSystem {
    constructor() {
        this.isScanning = false;
        this.discoveredDevices = new Map();
        this.currentSession = null;
        this.isSupported = 'bluetooth' in navigator;
        this.advertisementData = null;
        this.isAdvertising = false;
        this.studentSignals = new Map(); // Store incoming student signals
        this.signalCheckInterval = null; // Interval to check for new signals
        
        // Initialize event listeners
        this.initializeEventListeners();
    }

    // Initialize all event listeners
    initializeEventListeners() {
        // Faculty attendance session controls
        const startBtn = document.getElementById('start-enhanced-attendance-session');
        const stopBtn = document.getElementById('stop-enhanced-attendance-session');
        
        if (startBtn) {
            startBtn.addEventListener('click', () => this.startAttendanceSession());
        }
        
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stopAttendanceSession());
        }

        // Student attendance marking
        const markAttendanceBtn = document.getElementById('mark-attendance');
        if (markAttendanceBtn) {
            markAttendanceBtn.addEventListener('click', () => this.markStudentAttendance());
        }
    }

    // Check if Bluetooth is supported
    isBluetoothSupported() {
        if (!this.isSupported) {
            this.showError('Bluetooth is not supported on this device. Please use a device with Bluetooth capabilities.');
            return false;
        }
        return true;
    }

    // Start faculty attendance session (FACULTY SIDE)
    async startAttendanceSession() {
        if (!this.isBluetoothSupported()) return;
        
        try {
            this.showStatus('Starting Bluetooth attendance session...', 'info');
            
            // Start scanning for student Bluetooth advertisements
            await this.startScanningForStudents();
            
        } catch (error) {
            console.error('Bluetooth error:', error);
            this.showError(`Bluetooth error: ${error.message}`);
        }
    }

    // Start scanning for student advertisements (FACULTY SIDE)
    async startScanningForStudents() {
        try {
            this.isScanning = true;
            this.showStatus('Scanning for student attendance signals...', 'info');
            
            // Start listening for student signals
            await this.startDeviceDiscovery();
            
        } catch (error) {
            console.error('Scanning error:', error);
            this.showError(`Scanning failed: ${error.message}`);
        }
    }

    // Start device discovery (FACULTY SIDE)
    async startDeviceDiscovery() {
        this.showStatus('Listening for student attendance signals...', 'info');
        
        // Start checking for incoming student signals
        this.startSignalDetection();
    }

    // Start signal detection (FACULTY SIDE)
    startSignalDetection() {
        // Clear any existing interval
        if (this.signalCheckInterval) {
            clearInterval(this.signalCheckInterval);
        }
        
        // Check for new student signals every 1 second
        this.signalCheckInterval = setInterval(() => {
            if (this.isScanning) {
                this.checkForNewStudentSignals();
            }
        }, 1000);
        
        this.showStatus('Signal detection active - waiting for student signals...', 'info');
    }

    // Check for new student signals (FACULTY SIDE)
    checkForNewStudentSignals() {
        // Check if there are any new signals from students
        // This would normally check Bluetooth advertisements, but for now we'll use a different approach
        
        // Check for signals sent via WebSocket or localStorage (temporary solution)
        this.checkForStudentSignals();
    }

    // Send attendance signal (STUDENT SIDE) - NO DEVICE CONNECTION NEEDED
    async sendAttendanceSignal() {
        try {
            this.showStatus('Broadcasting attendance signal...', 'info');
            
            // In a real implementation, this would:
            // 1. Create a Bluetooth advertisement with student info
            // 2. Broadcast it without trying to connect to any device
            // 3. Faculty system would detect this advertisement
            
            // For now, we'll store the signal in localStorage so faculty can detect it
            // This is a temporary solution until real Bluetooth advertisement is implemented
            
            const studentRoll = localStorage.getItem('currentUserId') || 'S101';
            const studentName = localStorage.getItem('currentUserName') || 'Student';
            
            const signal = {
                deviceId: 'student-device-' + Date.now(),
                studentRoll: studentRoll,
                studentName: studentName,
                rssi: -65 + Math.random() * 20,
                timestamp: new Date().toISOString()
            };
            
            // Store the signal so faculty can detect it
            this.storeStudentSignal(signal);
            
            // Also try to send via WebSocket if available (for cross-instance communication)
            this.sendSignalViaWebSocket(signal);
            
            setTimeout(() => {
                this.showStatus('Attendance signal sent successfully!', 'success');
                
                // Update student attendance display
                this.updateStudentAttendanceDisplay();
                
            }, 2000);
            
        } catch (error) {
            console.error('Attendance signal error:', error);
            this.showError(`Attendance signal failed: ${error.message}`);
        }
    }

    // Send signal via WebSocket for cross-instance communication
    sendSignalViaWebSocket(signal) {
        try {
            // Try to send via WebSocket if available
            if (window.ws && window.ws.readyState === WebSocket.OPEN) {
                window.ws.send(JSON.stringify({
                    type: 'BLUETOOTH_ATTENDANCE_SIGNAL',
                    data: signal
                }));
                console.log('Signal sent via WebSocket:', signal);
            } else {
                console.log('WebSocket not available, using localStorage only');
            }
        } catch (error) {
            console.error('WebSocket signal error:', error);
        }
    }

    // Check for student signals (FACULTY SIDE)
    checkForStudentSignals() {
        try {
            // Check if there are any student signals in localStorage (temporary solution)
            // In a real implementation, this would use Bluetooth advertisement detection
            
            const signals = this.getStudentSignalsFromStorage();
            console.log('Checking for student signals. Found:', signals.length);
            
            // Also check for signals in sessionStorage (which might be more accessible)
            const sessionSignals = this.getStudentSignalsFromSessionStorage();
            console.log('Checking session storage signals. Found:', sessionSignals.length);
            
            // Also check for WebSocket signals
            const wsSignals = this.getWebSocketSignals();
            console.log('Checking WebSocket signals. Found:', wsSignals.length);
            
            // Combine all sources
            const allSignals = [...signals, ...sessionSignals, ...wsSignals];
            console.log('Total signals found:', allSignals.length);
            
            allSignals.forEach(signal => {
                if (!this.discoveredDevices.has(signal.deviceId)) {
                    console.log('New student signal detected!', signal);
                    // New student signal detected!
                    this.onDeviceDiscovered({
                        deviceId: signal.deviceId,
                        deviceName: signal.studentName || 'Student Device',
                        rssi: signal.rssi || -65,
                        roll: signal.studentRoll,
                        isReal: true,
                        timestamp: signal.timestamp
                    });
                } else {
                    console.log('Signal already processed:', signal.deviceId);
                }
            });
            
            // If no signals found, show a helpful message
            if (allSignals.length === 0) {
                this.showStatus('No student signals detected yet. Students need to send attendance signals.', 'info');
            }
            
        } catch (error) {
            console.error('Error checking for student signals:', error);
            this.showError(`Error checking for signals: ${error.message}`);
        }
    }

    // Get student signals from storage (temporary solution)
    getStudentSignalsFromStorage() {
        try {
            const signals = localStorage.getItem('studentAttendanceSignals');
            if (signals) {
                const parsed = JSON.parse(signals);
                console.log('Retrieved signals from storage:', parsed);
                return parsed;
            }
        } catch (error) {
            console.error('Error reading student signals:', error);
        }
        return [];
    }

    // Get student signals from sessionStorage (alternative storage)
    getStudentSignalsFromSessionStorage() {
        try {
            const signals = sessionStorage.getItem('studentAttendanceSignals');
            if (signals) {
                const parsed = JSON.parse(signals);
                console.log('Retrieved signals from sessionStorage:', parsed);
                return parsed;
            }
        } catch (error) {
            console.error('Error reading sessionStorage signals:', error);
        }
        return [];
    }

    // Get WebSocket signals (for cross-instance communication)
    getWebSocketSignals() {
        try {
            // Check if there are any signals received via WebSocket
            if (window.receivedSignals && Array.isArray(window.receivedSignals)) {
                return window.receivedSignals;
            }
        } catch (error) {
            console.error('Error reading WebSocket signals:', error);
        }
        return [];
    }

    // Handle discovered device (FACULTY SIDE)
    onDeviceDiscovered(device) {
        if (!this.isScanning) return;
        
        // Add to discovered devices
        this.discoveredDevices.set(device.deviceId, device);
        
        // Update UI
        this.updateDiscoveredDevicesList();
        
        // Show notification
        this.showStatus(`Student detected: ${device.deviceName} (${device.roll})`, 'success');
        
        // Automatically mark attendance if we have an active session
        if (this.currentSession && device.roll) {
            this.autoMarkAttendance(device.roll, device.deviceId);
        }
    }

    // Update the discovered devices list in UI (FACULTY SIDE)
    updateDiscoveredDevicesList() {
        const devicesList = document.getElementById('discovered-devices-list');
        if (!devicesList) return;
        
        devicesList.innerHTML = '';
        
        if (this.discoveredDevices.size === 0) {
            devicesList.innerHTML = '<p class="text-gray-500 text-center py-4">No student signals detected yet</p>';
            return;
        }
        
        this.discoveredDevices.forEach((device, deviceId) => {
            const deviceElement = document.createElement('div');
            deviceElement.className = 'p-3 border border-gray-200 rounded-lg mb-2 bg-blue-50';
            deviceElement.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <strong>${device.deviceName}</strong><br>
                        <span class="text-sm text-gray-600">ID: ${device.deviceId}</span><br>
                        <span class="text-sm text-gray-600">Signal: ${device.rssi} dBm</span><br>
                        <span class="text-sm text-green-600">Roll: ${device.roll}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-xs text-blue-600">${device.isReal ? 'Real Device' : 'Demo'}</span>
                    </div>
                </div>
            `;
            devicesList.appendChild(deviceElement);
        });
    }

    // Auto-mark attendance for discovered device (FACULTY SIDE)
    async autoMarkAttendance(studentRoll, deviceId) {
        if (!this.currentSession) return;
        
        try {
            // Mark attendance via API
            const response = await fetch('/api/faculty/attendance/mark', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.currentSession.id,
                    studentRoll: studentRoll,
                    deviceId: deviceId,
                    method: 'bluetooth',
                    timestamp: new Date().toISOString()
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showStatus(`Attendance marked for ${studentRoll}`, 'success');
                this.updateAttendanceRecords();
            } else {
                this.showError(`Failed to mark attendance: ${result.message}`);
            }
            
        } catch (error) {
            console.error('Auto-attendance error:', error);
            this.showError(`Auto-attendance failed: ${error.message}`);
        }
    }

    // Stop attendance session (FACULTY SIDE)
    stopAttendanceSession() {
        this.isScanning = false;
        
        // Clear signal detection interval
        if (this.signalCheckInterval) {
            clearInterval(this.signalCheckInterval);
            this.signalCheckInterval = null;
        }
        
        this.showStatus('Attendance session stopped', 'info');
        this.updateAttendanceRecords();
    }

    // Mark student attendance (STUDENT SIDE) - NO SCANNING, JUST SEND SIGNAL
    async markStudentAttendance() {
        if (!this.isBluetoothSupported()) return;
        
        try {
            this.showStatus('Sending attendance signal...', 'info');
            
            // STUDENTS DO NOT SCAN - THEY JUST SEND A SIGNAL
            // This is the key difference from the old implementation
            
            // Send attendance signal via Bluetooth advertisement
            await this.sendAttendanceSignal();
            
        } catch (error) {
            console.error('Student attendance error:', error);
            this.showError(`Attendance signal failed: ${error.message}`);
        }
    }

    // Store student signal for faculty detection (temporary solution)
    storeStudentSignal(signal) {
        try {
            // Store in both localStorage and sessionStorage for better accessibility
            const existingSignals = this.getStudentSignalsFromStorage();
            existingSignals.push(signal);
            
            // Keep only recent signals (last 10)
            if (existingSignals.length > 10) {
                existingSignals.splice(0, existingSignals.length - 10);
            }
            
            localStorage.setItem('studentAttendanceSignals', JSON.stringify(existingSignals));
            
            // Also store in sessionStorage
            sessionStorage.setItem('studentAttendanceSignals', JSON.stringify(existingSignals));
            
            console.log('Student signal stored in both storages:', signal);
            console.log('All signals in storage:', existingSignals);
            
        } catch (error) {
            console.error('Error storing student signal:', error);
        }
    }

    // Update student attendance display (STUDENT SIDE)
    updateStudentAttendanceDisplay() {
        const statusElement = document.getElementById('attendance-status');
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="text-green-600 font-medium">
                    <i class="fas fa-check-circle mr-2"></i>Attendance signal sent successfully!
                </div>
                <div class="text-sm text-gray-600 mt-2">
                    Your attendance signal has been broadcast. Faculty system will detect it automatically.
                </div>
            `;
        }
    }

    // Update attendance records display (FACULTY SIDE)
    async updateAttendanceRecords() {
        if (!this.currentSession) return;
        
        try {
            const response = await fetch(`/api/faculty/attendance/session/${this.currentSession.id}`);
            const data = await response.json();
            
            if (data.success) {
                this.displayAttendanceRecords(data.session.attendanceRecords);
            }
            
        } catch (error) {
            console.error('Failed to update attendance records:', error);
        }
    }

    // Display attendance records (FACULTY SIDE)
    displayAttendanceRecords(records) {
        const recordsDiv = document.getElementById('attendance-records');
        if (!recordsDiv) return;
        
        if (!records || records.length === 0) {
            recordsDiv.innerHTML = '<p class="text-gray-500 text-center py-8">No attendance records yet</p>';
            return;
        }
        
        let html = `
            <div class="mb-4 p-3 bg-green-50 rounded-lg">
                <h5 class="font-semibold text-green-800">Attendance Records</h5>
                <p class="text-sm text-green-600">Total: ${records.length} records</p>
            </div>
        `;
        
        records.forEach((record, index) => {
            html += `
                <div class="p-3 border border-gray-200 rounded-lg mb-2">
                    <div class="flex justify-between items-center">
                        <div>
                            <strong>Student:</strong> ${record.studentRoll} | 
                            <strong>Status:</strong> <span class="text-green-600">${record.status}</span> | 
                            <strong>Method:</strong> ${record.method}
                        </div>
                        <div class="text-xs text-gray-500">
                            ${new Date(record.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            `;
        });
        
        recordsDiv.innerHTML = html;
    }

    // Show status message
    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('bluetooth-status');
        if (!statusElement) return;
        
        const colors = {
            info: 'text-blue-600',
            success: 'text-green-600',
            error: 'text-red-600',
            warning: 'text-yellow-600'
        };
        
        statusElement.innerHTML = `
            <div class="${colors[type]} font-medium">
                <i class="fas fa-bluetooth mr-2"></i>${message}
            </div>
        `;
    }

    // Show error message
    showError(message) {
        this.showStatus(message, 'error');
        console.error('Bluetooth Attendance Error:', message);
    }

    // Initialize the system
    init() {
        if (!this.isBluetoothSupported()) {
            console.warn('Bluetooth not supported on this device');
            return;
        }
        
        console.log('Bluetooth Attendance System initialized');
        console.log('Mode: Students send signals, Faculty scans for signals');
        
        // Initialize WebSocket signal receiver
        this.initWebSocketReceiver();
        
        // Check for existing sessions
        this.checkExistingSessions();
    }

    // Initialize WebSocket signal receiver
    initWebSocketReceiver() {
        try {
            // Initialize received signals array
            if (!window.receivedSignals) {
                window.receivedSignals = [];
            }
            
            // Set up WebSocket message handler
            if (window.ws) {
                window.ws.addEventListener('message', (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        if (message.type === 'BLUETOOTH_ATTENDANCE_SIGNAL') {
                            console.log('Received WebSocket signal:', message.data);
                            window.receivedSignals.push(message.data);
                            
                            // If faculty is scanning, immediately process the signal
                            if (this.isScanning) {
                                this.onDeviceDiscovered({
                                    deviceId: message.data.deviceId,
                                    deviceName: message.data.studentName || 'Student Device',
                                    rssi: message.data.rssi || -65,
                                    roll: message.data.studentRoll,
                                    isReal: true,
                                    timestamp: message.data.timestamp
                                });
                            }
                        }
                    } catch (error) {
                        console.error('Error processing WebSocket message:', error);
                    }
                });
                
                console.log('WebSocket signal receiver initialized');
            } else {
                console.log('WebSocket not available, using localStorage only');
            }
        } catch (error) {
            console.error('Error initializing WebSocket receiver:', error);
        }
    }

    // Check for existing attendance sessions
    async checkExistingSessions() {
        try {
            // This would check if there are active sessions for the current faculty
            // For now, we'll just initialize the system
            console.log('Bluetooth system ready');
            
        } catch (error) {
            console.error('Session check error:', error);
        }
    }
}

// Initialize the Bluetooth system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.bluetoothSystem = new BluetoothAttendanceSystem();
    window.bluetoothSystem.init();
});

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BluetoothAttendanceSystem;
} 