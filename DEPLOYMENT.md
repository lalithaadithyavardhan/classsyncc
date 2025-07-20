# ClassSync Deployment Guide for Render

This guide explains how to deploy your ClassSync application to Render.com.

## 🚀 Render Deployment

### 1. Repository Setup

Your application is already configured for Render deployment. The key changes made:

- **Dynamic Port Configuration**: Uses `process.env.PORT` for Render's port assignment
- **Environment Detection**: Automatically detects production vs development
- **WebSocket Support**: Configured for secure WebSocket connections (WSS) in production
- **CORS Configuration**: Properly configured for your Render domain

### 2. Render Configuration

#### Environment Variables

Set these environment variables in your Render dashboard:

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://adithyasai533:YOUR_PASSWORD@classsync.61o3pi2.mongodb.net/classsync?retryWrites=true&w=majority
MONGODB_USERNAME=adithyasai533
MONGODB_PASSWORD=your_actual_password
MONGODB_DATABASE=classsync
MONGODB_CLUSTER=classsync.61o3pi2.mongodb.net
```

#### Build Settings

- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Root Directory**: Leave empty (or specify if needed)

### 3. Application URLs

#### Production URLs
- **Main Application**: https://classsyncc-derq.onrender.com
- **WebSocket**: wss://classsyncc-derq.onrender.com
- **API Endpoints**: https://classsyncc-derq.onrender.com/api/*

#### Local Development URLs
- **Main Application**: http://localhost:3000
- **WebSocket**: ws://localhost:3000
- **API Endpoints**: http://localhost:3000/api/*

### 4. Configuration Details

The application automatically adapts based on the environment:

#### Production Mode
```javascript
// Automatically detected when NODE_ENV=production
BASE_URL: 'https://classsyncc-derq.onrender.com'
WS_PROTOCOL: 'wss:'
CORS_ORIGIN: ['https://classsyncc-derq.onrender.com']
```

#### Development Mode
```javascript
// Default when NODE_ENV is not 'production'
BASE_URL: 'http://localhost:3000'
WS_PROTOCOL: 'ws:'
CORS_ORIGIN: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000']
```

### 5. WebSocket Configuration

The frontend automatically detects the correct WebSocket protocol:

```javascript
// In all frontend files (integrated-app.js, Front-End script.js, dashboard.js)
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);
}
```

This ensures:
- **Local Development**: Uses `ws://localhost:3000`
- **Production**: Uses `wss://classsyncc-derq.onrender.com`

### 6. API Endpoints

All API endpoints use relative paths, so they work automatically:

```javascript
// These work in both environments
fetch('/api/login', { ... })
fetch('/api/attendance/today')
fetch('/api/attendance/manual', { ... })
```

### 7. MongoDB Integration

MongoDB is configured to work in both environments:

- **Local**: Uses local MongoDB or Atlas with local credentials
- **Production**: Uses Atlas with production credentials via environment variables

### 8. Testing Deployment

After deployment, test these features:

1. **Login System**: Try logging in with test credentials
2. **WebSocket Connection**: Check browser console for WebSocket connection status
3. **API Endpoints**: Test attendance marking and retrieval
4. **MongoDB Connection**: Verify data is being saved to Atlas

### 9. Troubleshooting

#### Common Issues

1. **WebSocket Connection Failed**
   - Check if Render supports WebSocket (it does)
   - Verify the WebSocket URL is correct
   - Check browser console for errors

2. **MongoDB Connection Failed**
   - Verify environment variables are set correctly
   - Check if your IP is whitelisted in MongoDB Atlas
   - Ensure the connection string is correct

3. **CORS Errors**
   - Verify CORS_ORIGIN includes your Render domain
   - Check if requests are coming from the correct origin

#### Logs

Check Render logs for:
- Server startup messages
- MongoDB connection status
- WebSocket server initialization
- Any error messages

### 10. Environment Variables Reference

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `NODE_ENV` | Environment mode | Yes | `development` |
| `PORT` | Server port | No | `3000` |
| `MONGODB_URI` | MongoDB connection string | Yes | - |
| `MONGODB_USERNAME` | MongoDB username | Yes | - |
| `MONGODB_PASSWORD` | MongoDB password | Yes | - |
| `MONGODB_DATABASE` | Database name | No | `classsync` |
| `MONGODB_CLUSTER` | Cluster hostname | No | `classsync.61o3pi2.mongodb.net` |

### 11. Security Considerations

1. **Environment Variables**: Never commit passwords to Git
2. **CORS**: Only allow necessary origins
3. **MongoDB**: Use dedicated database user with minimal permissions
4. **HTTPS**: Render automatically provides SSL certificates

### 12. Performance Optimization

1. **Connection Pooling**: MongoDB connection pooling is configured
2. **WebSocket**: Efficient real-time communication
3. **Static Files**: Express serves static files efficiently
4. **Caching**: Consider adding Redis for session storage in production

## 🎉 Deployment Complete!

Your ClassSync application is now ready for production deployment on Render. The application will automatically adapt to the production environment and provide a seamless experience for both local development and production use. 