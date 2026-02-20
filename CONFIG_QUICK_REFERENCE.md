# Quick Configuration Reference

## 📁 Configuration Files Location

| Component | File Path | Purpose |
|-----------|-----------|---------|
| **Backend Config** | `cbc-portal-backend/config.js` | Server, database, JWT, email, file upload settings |
| **Frontend Config** | `docs/js/config.js` | API endpoint, auth, features, UI settings |
| **Backend Secrets** | `.env` (root) | Environment variables (API keys, passwords) |

---

## 🔧 Change API Endpoint (Most Common Task)

**File:** `docs/js/config.js`

```javascript
const config = {
  api: {
    baseURL: 'https://YOUR-NEW-API-URL.com/api',  // ← Change this line
    timeout: 30000,
    version: 'v1'
  },
  // ... rest stays the same
};
```

**Then:** Test by opening Developer Tools (F12) → Console and check if API calls work.

---

## 🚀 Deploy to Production

### Backend Changes (.env file)
```env
NODE_ENV=production
MONGO_ATLAS=mongodb+srv://user:pass@cluster.mongo.com/cbc-portal
FRONTEND_URL=https://yourdomain.com
JWT_SECRET=your-super-secure-key-here
```

### Frontend Changes (docs/js/config.js)
```javascript
api: {
  baseURL: 'https://api.yourdomain.com/api',  // Your production API
  timeout: 30000
}
```

---

## 📋 Common Configuration Changes

### Add New API Feature
**In:** `docs/js/config.js`
```javascript
features: {
  enableMPesa: true,           // ← Modify here
  enableMaterialUpload: true,
  enableAnalytics: true,
  enableNewFeature: true       // ← Add new feature flag
}
```

### Change File Upload Size
**In:** `.env` (backend)
```env
MAX_FILE_SIZE=100  # Changed from 50 MB to 100 MB
```

### Modify Authentication Timeout
**In:** `docs/js/config.js`
```javascript
auth: {
  tokenKey: 'authToken',
  userKey: 'user',
  expiresIn: 48  # Changed from 24 hours to 48 hours
}
```

### Update Email Service
**In:** `.env` (backend)
```env
EMAIL_SERVICE=sendgrid
EMAIL_USER=your-sendgrid-username
EMAIL_PASSWORD=your-sendgrid-api-key
```

---

## ✅ Files Already Updated

All HTML files now include config.js:
```html
<script src="js/config.js"></script>
```

All JavaScript files now use config:
```javascript
const API_BASE = config.api.baseURL;
```

---

## 🔐 Security Checklist

- [ ] Change `JWT_SECRET` in `.env` for production
- [ ] Use `MONGO_ATLAS` URL (not `MONGO_LOCAL`) in production
- [ ] Set `NODE_ENV=production` in deployment
- [ ] Never commit `.env` file with sensitive data
- [ ] Update `FRONTEND_URL` to match your domain
- [ ] Change email credentials to production email service
- [ ] Update API URLs to production endpoints

---

## 🐛 Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| "config is undefined" | Ensure `<script src="js/config.js"></script>` is BEFORE other scripts |
| API returns 404 | Check `baseURL` doesn't have trailing slash |
| CORS errors | Update `FRONTEND_URL` in backend `.env` |
| Wrong API called | Search for hardcoded URLs and update config.js instead |
| Database connection error | Check `MONGO_LOCAL` or `MONGO_ATLAS` URL in `.env` |

---

## 📞 Quick Links

- **Full Guide:** See `CONFIGURATION_GUIDE.md`
- **Backend Config:** `cbc-portal-backend/config.js`
- **Frontend Config:** `docs/js/config.js`
- **Environment Template:** Create `.env` file in root using variables from guide

