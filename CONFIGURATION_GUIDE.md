# Configuration Management Guide

## Overview

This document explains how to use the centralized configuration system for the CBC Portal. The configuration has been separated into two main parts: **Backend Configuration** and **Frontend Configuration**.

## Benefits of Centralized Configuration

✅ **Single Point of Control** - Change API endpoints from one file instead of modifying multiple files  
✅ **Easy Deployment** - Different configurations for development, staging, and production  
✅ **Environment Variables** - Secure handling of sensitive data (API keys, database credentials)  
✅ **Consistency** - Ensure all parts of the system use the same configuration  
✅ **Maintainability** - Track all configuration options in one place  

---

## Backend Configuration

### Location
`cbc-portal-backend/config.js`

### Purpose
Centralizes all backend configuration including database, JWT, email, external services, and file uploads.

### Key Configuration Options

```javascript
// Environment & Server
nodeEnv: 'development'                 // environment type
port: 5000                             // server port
appName: 'CBC Portal Backend'          // app name

// Database
database: {
  uri: 'mongodb://localhost:27017/cbc-portal'  // MongoDB connection
  options: { ... }
}

// JWT & Security
jwt: {
  secret: 'your-secret-key',          // JWT signing key
  expiresIn: '24h'                    // token expiration
}

// Email Service
email: {
  service: 'gmail',
  user: 'your-email@gmail.com',
  password: 'your-app-password',
  from: 'noreply@cbcportal.com'
}

// M-Pesa Configuration
externalServices: {
  mpesa: {
    consumerKey: '...',
    consumerSecret: '...',
    shortCode: '...',
    passkey: '...'
  }
}

// File Upload Configuration
upload: {
  maxFileSize: 50,                    // MB
  uploadDir: './uploads',
  allowedMimeTypes: [...]
}

// Rate Limiting
rateLimit: {
  windowMs: 900000,                   // 15 minutes
  max: 100                            // max requests per window
}
```

### How to Use

1. **Update from Environment Variables:**
   The config imports from `.env` file automatically:
   ```bash
   # .env file
   NODE_ENV=production
   PORT=5000
   MONGO_ATLAS=mongodb+srv://user:pass@cluster.mongodb.net/cbc-portal
   JWT_SECRET=your-secure-secret-key
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-app-password
   ```

2. **Import in Your Backend Code:**
   ```javascript
   import config from './config.js';
   
   // Use configuration
   const dbUri = config.database.uri;
   const port = config.port;
   console.log(`Server running on port ${port}`);
   ```

3. **Environment-Specific Configuration:**
   ```javascript
   // Database automatically switches based on NODE_ENV
   if (config.nodeEnv === 'production') {
     // Use production database (MongoDB Atlas)
   } else {
     // Use local database
   }
   ```

### Required Environment Variables

```env
# Database
NODE_ENV=development
MONGO_LOCAL=mongodb://localhost:27017/cbc-portal
MONGO_ATLAS=mongodb+srv://user:pass@cluster.mongodb.net/cbc-portal

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=24h

# Email
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5000

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=50

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Frontend Configuration

### Location
`docs/js/config.js`

### Purpose
Centralized configuration for the frontend including API endpoints, authentication settings, feature flags, and UI options.

### Key Configuration Options

```javascript
// API Configuration
api: {
  baseURL: 'https://competence-hub.onrender.com/api',
  timeout: 30000,                     // milliseconds
  version: 'v1'
}

// Authentication
auth: {
  tokenKey: 'authToken',              // localStorage key for token
  userKey: 'user',                    // localStorage key for user data
  expiresIn: 24                       // hours
}

// Application Settings
app: {
  name: 'CBC Student Portal',
  version: '1.0.0',
  environment: 'production'
}

// Page Redirects After Login
redirects: {
  student: 'student-dashboard.html',
  teacher: 'teacher-dashboard.html',
  admin: 'admin.html',
  // ... more roles
}

// Feature Flags
features: {
  enableMPesa: true,
  enableMaterialUpload: true,
  enableAnalytics: true
}

// Pagination
pagination: {
  itemsPerPage: 10,
  pageSizeOptions: [5, 10, 20, 50]
}
```

### How to Use

1. **Include Config in HTML:**
   ```html
   <!-- Add config.js BEFORE your page script -->
   <script src="js/config.js"></script>
   <script src="js/login.js"></script>
   ```
   
   ✅ All HTML files have been updated automatically with this script tag.

2. **Use in JavaScript:**
   ```javascript
   // Get API base URL
   const apiBase = config.api.baseURL;
   
   // Make API calls
   const response = await fetch(config.getApiUrl('/users/login'), {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(credentials)
   });
   
   // Use helper function for full URL
   const fullUrl = config.getApiUrl('/accounts');
   ```

3. **Change API Endpoint:**
   ```javascript
   // Option 1: Edit config.js directly
   const config = {
     api: {
       baseURL: 'https://new-backend-url.com/api',  // Change this
       // ...
     }
   };
   
   // Option 2: Update at runtime (if needed)
   config.setBaseURL('https://new-backend-url.com/api');
   ```

4. **Access Authentication Settings:**
   ```javascript
   // Get token from storage
   const token = localStorage.getItem(config.auth.tokenKey);
   
   // Get user data
   const user = JSON.parse(localStorage.getItem(config.auth.userKey));
   
   // Check token expiration
   const expiresHours = config.auth.expiresIn;
   ```

5. **Use Feature Flags:**
   ```javascript
   if (config.features.enableMPesa) {
     // Show M-Pesa payment option
   }
   
   if (config.features.enableMaterialUpload) {
     // Show material upload feature
   }
   ```

---

## Deployment Guide

### Development Environment

1. **Local Development:**
   ```bash
   # Backend (.env file)
   NODE_ENV=development
   PORT=5000
   MONGO_LOCAL=mongodb://localhost:27017/cbc-portal
   FRONTEND_URL=http://localhost:5000
   ```

2. **Frontend (docs/js/config.js):**
   ```javascript
   api: {
     baseURL: 'http://localhost:5000/api',  // Local backend
     timeout: 30000
   }
   ```

### Production Environment

1. **Backend (.env file):**
   ```bash
   NODE_ENV=production
   MONGO_ATLAS=mongodb+srv://user:pass@cluster.mongodb.net/cbc-portal
   FRONTEND_URL=https://yourdomain.com
   JWT_SECRET=your-production-secret-key
   ```

2. **Frontend (docs/js/config.js):**
   ```javascript
   api: {
     baseURL: 'https://api.yourdomain.com/api',  // Production API
     timeout: 30000
   }
   ```

---

## Common Configuration Tasks

### Change API Endpoint

**Step 1:** Update `docs/js/config.js`
```javascript
const config = {
  api: {
    baseURL: 'https://your-new-api.com/api',  // <-- Change this
    timeout: 30000
  },
  // ... rest of config
};
```

**Step 2:** No other changes needed! All frontend code automatically uses the new URL.

### Enable/Disable Features

**In `docs/js/config.js`:**
```javascript
features: {
  enableMPesa: false,              // Disable M-Pesa
  enableMaterialUpload: true,      // Keep uploads enabled
  enableAnalytics: true
}
```

### Update Rate Limiting

**In Backend `.env` file:**
```env
# Allow 200 requests per 10 minutes
RATE_LIMIT_WINDOW_MS=600000
RATE_LIMIT_MAX_REQUESTS=200
```

### Change Database

**In Backend `.env` file:**
```env
# Switch to MongoDB Atlas (production)
NODE_ENV=production
MONGO_ATLAS=mongodb+srv://user:password@cluster.mongodb.net/cbc-portal
```

---

## Updated Files Summary

### Frontend Files Updated to Use Config:
- ✅ `docs/login.html` - Added config.js script
- ✅ `docs/teacher-dashboard.html` - Added config.js script
- ✅ `docs/student-dashboard.html` - Added config.js script
- ✅ `docs/admin.html` - Added config.js script
- ✅ `docs/accounts.html` - Added config.js script
- ✅ `docs/super-admin.html` - Added config.js script
- ✅ `docs/reset.html` - Added config.js script
- ✅ `docs/report.html` - Added config.js script
- ✅ `docs/analysis.html` - Added config.js script
- ✅ `docs/studentstudymaterial.html` - Added config.js script

### JavaScript Files Updated:
- ✅ `docs/js/login.js` - Now uses config
- ✅ `docs/js/teachers.js` - Now uses config
- ✅ `docs/js/student.js` - Now uses config
- ✅ `docs/js/admin.js` - Now uses config
- ✅ `docs/js/accounts.js` - Now uses config
- ✅ `docs/js/super-admin.js` - Now uses config
- ✅ `docs/js/reset.js` - Now uses config
- ✅ `docs/js/report.js` - Now uses config
- ✅ `docs/js/analysis.js` - Now uses config
- ✅ `docs/js/studentstudymaterial.js` - Now uses config

### New Configuration Files:
- ✅ `cbc-portal-backend/config.js` - Backend configuration
- ✅ `docs/js/config.js` - Frontend configuration

---

## Troubleshooting

### Config is undefined error
**Problem:** "Cannot read property 'api' of undefined"

**Solution:** Make sure `config.js` is loaded BEFORE other scripts in your HTML:
```html
<!-- ✅ Correct order -->
<script src="js/config.js"></script>
<script src="js/login.js"></script>

<!-- ❌ Wrong order -->
<script src="js/login.js"></script>
<script src="js/config.js"></script>
```

### API calls failing after changing base URL
**Solution:** Verify the URL format:
- ✅ Correct: `https://api.example.com/api`
- ❌ Incorrect: `https://api.example.com` (missing `/api`)
- ❌ Incorrect: `https://api.example.com/api/` (trailing slash)

### Different environments showing different config
**Solution:** Check which `.env` file is being loaded in backend:
```bash
# Check current NODE_ENV
echo $NODE_ENV

# Set for current session
export NODE_ENV=production

# Or in .env file
NODE_ENV=production
```

---

## Best Practices

1. **Never hardcode API URLs** - Always use `config.api.baseURL`
2. **Keep .env secrets** - Never commit `.env` files with sensitive data
3. **Version your config** - Document configuration changes in commits
4. **Use environment variables** - Especially for sensitive data (passwords, API keys)
5. **Test configuration changes** - Verify API connectivity after updating endpoints
6. **Document custom settings** - Add comments for non-standard configurations

---

## Support

For questions or issues with the configuration system, refer to:
- Backend config: `cbc-portal-backend/config.js`
- Frontend config: `docs/js/config.js`
- Environment setup: `.env` file

