// Enhanced Bluetooth Attendance System
// Advanced features for ClassSync

class EnhancedBluetoothAttendance {
    constructor() {
        this.isSupported = false;
        this.isConnected = false;
        this.currentDevice = null;
        this.deviceId = null;
        this.signalMonitor = null;
        this.pairingCode = null;
        this.encryptionKey = null;
        
        this.init();
    }
    
    async init() {
        // Check for Web Bluetooth API support
        if (navigator.bluetooth) {
            this.isSupported = true;
            console.log('Enhanced Bluetooth API is supported');
            
            // Generate unique device ID
            this.deviceId = this.generateDeviceId();
            
            // Generate encryption key for secure communication
            this.encryptionKey = await this.generateEncryptionKey();
            
        } else {
            console.log('Enhanced Bluetooth API is not supported');
        }
    }
    
    // Generate unique device identifier
    generateDeviceId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `device_${timestamp}_${random}`;
    }
    
    // Generate encryption key for secure communication
    async generateEncryptionKey() {
        const key = await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );
        return key;
    }
    
    // Encrypt data for secure transmission
    async encryptData(data) {
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(JSON.stringify(data));
        
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        
        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            this.encryptionKey,
            encodedData
        );
        
        return {
            data: Array.from(new Uint8Array(encryptedData)),
            iv: Array.from(iv)
        };
    }
    
    // Decrypt received data
    async decryptData(encryptedData, iv) {
        try {
            const decryptedData = await window.crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: new Uint8Array(iv)
                },
                this.encryptionKey,
                new Uint8Array(encryptedData)
            );
            
            const decoder = new TextDecoder();
            return JSON.parse(decoder.decode(decryptedData));
        } catch (error) {
            console.error('Decryption failed:', error);
            return null;
        }
    }
    
    // Start device discovery and pairing
    async startDeviceDiscovery() {
        if (!this.isSupported) {
            throw new Error('Bluetooth not supported');
        }
        
        try {
            // Request Bluetooth device with specific filters
            this.currentDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    {
                        services: ['attendance-service'] // Custom service UUID
                    },
                    {
                        namePrefix: 'ClassSync'
                    }
                ],
                optionalServices: ['battery_service', 'device_information']
            });
            
            console.log('Device selected:', this.currentDevice.name);
            
            // Connect to the device
            const server = await this.currentDevice.gatt.connect();
            console.log('Connected to device');
            
            // Get the attendance service
            const service = await server.getPrimaryService('attendance-service');
            
            // Get characteristics for reading and writing
            const attendanceChar = await service.getCharacteristic('attendance-data');
            const signalChar = await service.getCharacteristic('signal-strength');
            
            this.isConnected = true;
            
            // Start monitoring signal strength
            this.startSignalMonitoring(signalChar);
            
            return {
                success: true,
                deviceName: this.currentDevice.name,
                deviceId: this.deviceId
            };
            
        } catch (error) {
            console.error('Bluetooth connection failed:', error);
            throw error;
        }
    }
    
    // Monitor signal strength for proximity detection
    startSignalMonitoring(signalChar) {
        if (this.signalMonitor) {
            clearInterval(this.signalMonitor);
        }
        
        this.signalMonitor = setInterval(async () => {
            try {
                const value = await signalChar.readValue();
                const rssi = new DataView(value.buffer).getInt8(0);
                
                // Emit signal strength event
                this.emitSignalStrength(rssi);
                
                // Check if signal is too weak (student moved away)
                if (rssi < -85) {
                    this.emitProximityAlert('Student may have left the classroom');
                }
                
            } catch (error) {
                console.error('Signal monitoring error:', error);
            }
        }, 1000); // Check every second
    }
    
    // Send attendance data securely
    async sendAttendanceData(roll, timestamp) {
        if (!this.isConnected) {
            throw new Error('Not connected to device');
        }
        
        try {
            const attendanceData = {
                roll: roll,
                timestamp: timestamp,
                deviceId: this.deviceId,
                pairingCode: this.pairingCode
            };
            
            // Encrypt the data
            const encrypted = await this.encryptData(attendanceData);
            
            // Get the attendance characteristic
            const service = await this.currentDevice.gatt.getPrimaryService('attendance-service');
            const char = await service.getCharacteristic('attendance-data');
            
            // Send encrypted data
            await char.writeValue(new Uint8Array(encrypted.data));
            
            return { success: true };
            
        } catch (error) {
            console.error('Failed to send attendance data:', error);
            throw error;
        }
    }
    
    // Generate pairing code for secure connection
    generatePairingCode() {
        this.pairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        return this.pairingCode;
    }
    
    // Verify pairing code
    verifyPairingCode(code) {
        return this.pairingCode === code;
    }
    
    // Emit signal strength event
    emitSignalStrength(rssi) {
        const event = new CustomEvent('signalStrength', {
            detail: { rssi, deviceId: this.deviceId }
        });
        document.dispatchEvent(event);
    }
    
    // Emit proximity alert
    emitProximityAlert(message) {
        const event = new CustomEvent('proximityAlert', {
            detail: { message, deviceId: this.deviceId }
        });
        document.dispatchEvent(event);
    }
    
    // Disconnect from device
    disconnect() {
        if (this.currentDevice && this.currentDevice.gatt.connected) {
            this.currentDevice.gatt.disconnect();
        }
        
        if (this.signalMonitor) {
            clearInterval(this.signalMonitor);
            this.signalMonitor = null;
        }
        
        this.isConnected = false;
        this.currentDevice = null;
        
        console.log('Disconnected from Bluetooth device');
    }
    
    // Get device information
    async getDeviceInfo() {
        if (!this.isConnected) {
            throw new Error('Not connected to device');
        }
        
        try {
            const server = this.currentDevice.gatt;
            const service = await server.getPrimaryService('device_information');
            
            const manufacturerChar = await service.getCharacteristic('manufacturer_name_string');
            const modelChar = await service.getCharacteristic('model_number_string');
            
            const manufacturer = await manufacturerChar.readValue();
            const model = await modelChar.readValue();
            
            return {
                manufacturer: new TextDecoder().decode(manufacturer),
                model: new TextDecoder().decode(model),
                name: this.currentDevice.name,
                deviceId: this.deviceId
            };
            
        } catch (error) {
            console.error('Failed to get device info:', error);
            return null;
        }
    }
    
    // Check battery level
    async getBatteryLevel() {
        if (!this.isConnected) {
            throw new Error('Not connected to device');
        }
        
        try {
            const server = this.currentDevice.gatt;
            const service = await server.getPrimaryService('battery_service');
            const char = await service.getCharacteristic('battery_level');
            
            const value = await char.readValue();
            return value.getUint8(0);
            
        } catch (error) {
            console.error('Failed to get battery level:', error);
            return null;
        }
    }
}

// Enhanced Bluetooth Manager for Faculty
class FacultyBluetoothManager {
    constructor() {
        this.discoveredDevices = new Map();
        this.activeSession = false;
        this.scanInterval = null;
        this.attendanceRecords = new Map();
    }
    
    // Start scanning for student devices
    startScanning() {
        if (this.activeSession) {
            return { success: false, message: 'Scanning already active' };
        }
        
        this.activeSession = true;
        this.discoveredDevices.clear();
        
        // Simulate device discovery (in real implementation, this would use Web Bluetooth API)
        this.scanInterval = setInterval(() => {
            this.simulateDeviceDiscovery();
        }, 2000);
        
        return { success: true, message: 'Bluetooth scanning started' };
    }
    
    // Stop scanning
    stopScanning() {
        this.activeSession = false;
        
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        
        return { success: true, message: 'Bluetooth scanning stopped' };
    }
    
    // Simulate device discovery for demo
    simulateDeviceDiscovery() {
        const demoDevices = [
            { id: 'student-device-001', name: 'Student S101 Device', roll: 'S101', rssi: -65 },
            { id: 'student-device-002', name: 'Student S102 Device', roll: 'S102', rssi: -70 },
            { id: 'student-device-003', name: 'Student S103 Device', roll: 'S103', rssi: -75 }
        ];
        
        demoDevices.forEach(device => {
            // Add some randomness to RSSI
            device.rssi += Math.random() * 10 - 5;
            
            this.discoveredDevices.set(device.id, {
                ...device,
                timestamp: Date.now(),
                lastSeen: Date.now()
            });
        });
        
        // Emit discovery event
        this.emitDeviceDiscovery();
    }
    
    // Get discovered devices
    getDiscoveredDevices() {
        return Array.from(this.discoveredDevices.values());
    }
    
    // Mark attendance for a device
    markAttendance(deviceId, roll) {
        const device = this.discoveredDevices.get(deviceId);
        
        if (!device) {
            return { success: false, message: 'Device not found' };
        }
        
        // Check if already marked
        const attendanceKey = `${roll}_${new Date().toISOString().slice(0, 10)}`;
        if (this.attendanceRecords.has(attendanceKey)) {
            return { success: false, message: 'Attendance already marked' };
        }
        
        // Check signal strength
        if (device.rssi < -80) {
            return { success: false, message: 'Signal too weak - student may not be present' };
        }
        
        // Mark attendance
        this.attendanceRecords.set(attendanceKey, {
            roll: roll,
            deviceId: deviceId,
            rssi: device.rssi,
            timestamp: Date.now(),
            date: new Date().toISOString().slice(0, 10)
        });
        
        return { 
            success: true, 
            message: 'Attendance marked successfully',
            data: this.attendanceRecords.get(attendanceKey)
        };
    }
    
    // Emit device discovery event
    emitDeviceDiscovery() {
        const event = new CustomEvent('deviceDiscovery', {
            detail: { devices: this.getDiscoveredDevices() }
        });
        document.dispatchEvent(event);
    }
    
    // Get attendance statistics
    getAttendanceStats() {
        const today = new Date().toISOString().slice(0, 10);
        const todayRecords = Array.from(this.attendanceRecords.values())
            .filter(record => record.date === today);
        
        return {
            total: todayRecords.length,
            records: todayRecords,
            averageRSSI: todayRecords.length > 0 
                ? todayRecords.reduce((sum, r) => sum + r.rssi, 0) / todayRecords.length 
                : 0
        };
    }
}

// Export classes for use in other modules
window.EnhancedBluetoothAttendance = EnhancedBluetoothAttendance;
window.FacultyBluetoothManager = FacultyBluetoothManager;

console.log('Enhanced Bluetooth Attendance System loaded'); 