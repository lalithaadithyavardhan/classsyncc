# ClassSync - Academic Management System

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.18+-green.svg)](https://mongodb.com/)

## 📚 Overview

ClassSync is a comprehensive **Academic Management System** designed to streamline attendance tracking, timetable management, and academic operations for educational institutions. The system features advanced Bluetooth-based attendance marking, real-time notifications, and role-based access control for students, faculty, and administrators.

## ✨ Key Features

### 🎯 **Multi-Role System**
- **Student Portal**: View attendance, timetable, and academic progress
- **Faculty Portal**: Manage classes, mark attendance, and view student records
- **Admin Portal**: Complete system administration and user management

### 📱 **Advanced Attendance System**
- **Bluetooth-Enhanced Attendance**: Secure device-to-device attendance marking
- **Real-time Tracking**: Instant attendance confirmation and status updates
- **Multiple Methods**: Support for manual, Bluetooth, and automated attendance
- **Session Management**: Faculty-controlled attendance sessions with unique IDs
- **Encryption**: AES-256 encryption for secure data transmission

### 📅 **Smart Timetable Management**
- **Interactive Timetable**: Editable timetable with drag-and-drop functionality
- **Period Mapping**: 7-period system (9:30 AM - 4:20 PM)
- **Branch & Year Specific**: Customized timetables for different academic streams
- **Room Allocation**: Classroom and facility management
- **Subject Management**: Comprehensive subject and faculty assignment

### 🔔 **Real-time Notifications**
- **WebSocket Integration**: Instant updates across all connected devices
- **Attendance Alerts**: Real-time confirmation of attendance marking
- **Session Notifications**: Faculty session start/stop alerts
- **Status Updates**: Live attendance status and device connection updates

### 📊 **Comprehensive Reporting**
- **Attendance Analytics**: Detailed attendance reports and statistics
- **Student Progress**: Individual and class-wide attendance tracking
- **Export Functionality**: Excel file export for administrative purposes
- **Historical Data**: Complete attendance history and trends

### 🔐 **Security Features**
- **Password Protection**: Secure user authentication system
- **Role-based Access**: Granular permissions for different user types
- **Data Encryption**: End-to-end encryption for sensitive information
- **Session Management**: Secure user sessions with timeout handling

## 🛠️ Technology Stack

### **Frontend**
- **HTML5**: Semantic markup with modern web standards
- **CSS3**: Tailwind CSS framework for responsive design
- **JavaScript (ES6+)**: Modern JavaScript with async/await support
- **Web Bluetooth API**: Advanced Bluetooth device management
- **WebSockets**: Real-time bidirectional communication

### **Backend**
- **Node.js**: Server-side JavaScript runtime
- **Express.js**: Fast, unopinionated web framework
- **MongoDB**: NoSQL database for flexible data storage
- **Mongoose**: MongoDB object modeling for Node.js
- **WebSocket Server**: Real-time communication server

### **Libraries & Dependencies**
- **@abandonware/noble**: Bluetooth Low Energy library
- **bcryptjs**: Password hashing and verification
- **multer**: File upload handling
- **xlsx**: Excel file processing
- **cors**: Cross-origin resource sharing
- **uuid**: Unique identifier generation

## 🚀 Installation & Setup

### **Prerequisites**
- Node.js 18+ 
- MongoDB 6.18+
- Modern web browser with Web Bluetooth support
- Bluetooth-enabled device (for attendance features)

### **1. Clone the Repository**
```bash
git clone https://github.com/yourusername/ClassSync-Web.git
cd ClassSync-Web
```

### **2. Install Dependencies**
```bash
npm install
```

### **3. Environment Configuration**
Create a `.env` file in the root directory:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=your_mongodb_connection_string
SESSION_SECRET=your_session_secret
ENABLE_BLUETOOTH=true
ENABLE_MONGODB=true
```

### **4. Database Setup**
Ensure MongoDB is running and accessible. The application will automatically create required collections:
- `users` - User accounts and profiles
- `attendances` - Attendance records
- `timetables` - Class schedules
- `classes` - Class information
- `attendance_sessions` - Active attendance sessions

### **5. Start the Application**
```bash
# Development mode
npm start

# Production mode
NODE_ENV=production npm start
```

The application will be available at `http://localhost:3000`

## 📱 Usage Guide

### **Student Login**
1. Select "Student" role
2. Enter your Roll Number
3. Enter your password
4. Access attendance view, timetable, and progress reports

### **Faculty Login**
1. Select "Faculty" role
2. Enter your Faculty ID
3. Enter your password
4. Start attendance sessions and manage classes

### **Admin Login**
1. Select "Admin" role
2. Enter your Admin ID
3. Enter your password
4. Access system administration and user management

### **Bluetooth Attendance**
1. Faculty starts an attendance session
2. Students connect via Bluetooth
3. Automatic attendance marking with device verification
4. Real-time confirmation and status updates

## 🏗️ Project Structure

```
ClassSync-Web/
├── models/                 # Database models
│   ├── User.js            # User management
│   ├── Attendance.js      # Attendance records
│   ├── Timetable.js       # Class schedules
│   ├── Class.js           # Class information
│   └── AttendanceSession.js # Session management
├── classsyncc.html        # Main application interface
├── dashboard.js            # Core dashboard functionality
├── backend-server.js       # Express server and API endpoints
├── integrated-app.js       # Integrated application logic
├── bluetooth-enhanced.js   # Bluetooth attendance system
├── styles.css              # Application styling
├── config.js               # Configuration management
├── mongodb-config.js       # Database connection
└── package.json            # Dependencies and scripts
```

## 🔧 API Endpoints

### **Authentication**
- `POST /api/login` - User authentication
- `POST /api/logout` - User logout

### **Attendance Management**
- `POST /api/attendance/mark` - Mark attendance
- `GET /api/attendance/student/:roll` - Get student attendance
- `GET /api/attendance/faculty/:facultyId` - Get faculty attendance records
- `POST /api/attendance/session/start` - Start attendance session
- `POST /api/attendance/session/stop` - Stop attendance session

### **Timetable Management**
- `GET /api/timetable/:branch/:year/:section` - Get timetable
- `POST /api/timetable` - Create/update timetable entry
- `DELETE /api/timetable/:id` - Delete timetable entry

### **User Management**
- `GET /api/users` - Get all users
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### **File Operations**
- `POST /api/upload/attendance` - Upload attendance data
- `GET /api/export/attendance` - Export attendance reports

## 🌟 Advanced Features

### **Bluetooth Attendance System**
- **Device Discovery**: Automatic Bluetooth device scanning
- **Secure Pairing**: Encrypted device-to-device communication
- **Signal Strength**: RSSI-based proximity verification
- **Multi-device Support**: Handle multiple student devices simultaneously
- **Offline Capability**: Local storage with sync when online

### **Real-time Communication**
- **WebSocket Server**: Instant bidirectional communication
- **Event Broadcasting**: Real-time updates across all connected clients
- **Connection Management**: Automatic reconnection and error handling
- **Status Monitoring**: Live connection and device status updates

### **Data Management**
- **Excel Import/Export**: Bulk data operations
- **Data Validation**: Input validation and error handling
- **Backup & Recovery**: Data backup and restoration capabilities
- **Performance Optimization**: Efficient database queries and indexing

## 🔒 Security Considerations

- **Password Hashing**: bcrypt-based password security
- **Input Validation**: Comprehensive input sanitization
- **CORS Protection**: Configurable cross-origin access control
- **Session Security**: Secure session management with timeouts
- **Data Encryption**: AES-256 encryption for sensitive data

## 🚀 Deployment

### **Local Development**
```bash
npm start
```

### **Production Deployment**
```bash
# Set production environment
export NODE_ENV=production

# Start production server
npm start
```

### **Environment Variables**
- `NODE_ENV`: Set to 'production' for production deployment
- `PORT`: Server port (default: 3000)
- `MONGODB_URI`: MongoDB connection string
- `SESSION_SECRET`: Session encryption secret
- `CORS_ORIGIN`: Allowed origins for CORS

## 📊 Performance & Scalability

- **Connection Pooling**: Efficient database connection management
- **Caching**: In-memory caching for frequently accessed data
- **Load Balancing**: Support for multiple server instances
- **Database Optimization**: Indexed queries for fast data retrieval
- **Memory Management**: Efficient memory usage and garbage collection

## 🐛 Troubleshooting

### **Common Issues**

1. **Bluetooth Not Working**
   - Ensure Web Bluetooth API is supported
   - Check device permissions
   - Verify Bluetooth is enabled

2. **Database Connection Issues**
   - Verify MongoDB connection string
   - Check network connectivity
   - Ensure database is running

3. **WebSocket Connection Problems**
   - Check firewall settings
   - Verify WebSocket protocol support
   - Check for proxy interference

### **Debug Mode**
Enable debug logging by setting:
```env
LOG_LEVEL=debug
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **Adithya Sai** - *Initial work* - [GitHub Profile](https://github.com/lalithaadithyavardhan)

## 🙏 Acknowledgments

- Web Bluetooth API for device communication
- Tailwind CSS for responsive design
- MongoDB for flexible data storage
- Express.js community for web framework

## 📞 Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team
- Check the documentation and troubleshooting guide

---

**ClassSync** - Revolutionizing academic management with modern technology and intuitive design.
