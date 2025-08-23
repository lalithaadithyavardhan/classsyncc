# ClassSync - Academic Management System

A modern, responsive web application for managing academic schedules, attendance, and student-faculty interactions.

## Features

- **Multi-role Support**: Student, Faculty, and Admin dashboards
- **Modern UI/UX**: Clean, responsive design with Tailwind CSS
- **Interactive Timetables**: View and manage class schedules
- **Attendance Management**: Track student attendance
- **Notifications System**: Stay updated with important announcements
- **User Management**: Admin tools for managing users and departments

## Demo Login

For demonstration purposes, you can login with any credentials:

- **Role**: Student, Faculty, or Admin
- **ID**: Any text (e.g., "demo123")
- **Password**: Any text (e.g., "password")

## Deployment on Render

### Option 1: Static Site (Recommended)

1. **Create a new Static Site** on Render
2. **Connect your GitHub repository**
3. **Build Command**: Leave empty (not needed for static sites)
4. **Publish Directory**: Leave as default (usually `/`)
5. **Environment Variables**: None required

### Option 2: Web Service

1. **Create a new Web Service** on Render
2. **Connect your GitHub repository**
3. **Build Command**: `npm install`
4. **Start Command**: `node backend-server.js`
5. **Environment Variables**: 
   - `MONGODB_URI`: Your MongoDB connection string
   - `PORT`: 10000 (or your preferred port)

## Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd ClassSync-Web
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   node backend-server.js
   ```

4. **Open in browser**
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:10000`

## File Structure

- `classsyncc.html` - Main HTML file
- `styles.css` - Custom CSS styles
- `dashboard.js` - Main JavaScript functionality
- `backend-server.js` - Node.js backend server
- `models/` - Database models
- `config.js` - Configuration files

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Tailwind CSS, Custom CSS
- **Icons**: Font Awesome
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (optional for demo version)

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## License

This project is designed by **BORRA ADHITYA**.

## Support

For issues or questions, please check the code comments or create an issue in the repository.
