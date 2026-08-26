// cbc-portal-backend/index.js

import express from 'express';
import mongoose from 'mongoose';
import dns from 'dns';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import userRoutes from './routes/userRoutes.js';
import markRoutes from './routes/markRoutes.js';
import materialRoutes from './routes/materialRoutes.js';
import resetRoutes from './routes/resetRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import schoolRoutes from './routes/schoolRoutes.js';
import promotionRoutes from './routes/promotionRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import accountsRoutes from './routes/accountsRoutes.js';
import reportsRoutes from './routes/reportsRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import timetableRoutes from './routes/timetableRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import electiveRoutes from './routes/electiveRoutes.js';
import subjectRoutes from './routes/subjectRoutes.js';
import studentRoutes from './routes/studentRoutes.js';

import { mpesaCallback } from './controllers/mpesaController.js';
import { startCronJobs } from './services/cronService.js';
import { User } from './models/User.js';
import { loadEnvironmentFiles } from './utils/envConfig.js';


// ============================================================
// ENVIRONMENT
// ============================================================

loadEnvironmentFiles({
  env: process.env.NODE_ENV || 'development'
});


// ============================================================
// PATH SETUP
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ============================================================
// EXPRESS APP
// ============================================================

const app = express();


// Trust Novahost/reverse proxy
app.set('trust proxy', 1);


// ============================================================
// BASIC MIDDLEWARE
// ============================================================

app.use(express.json({
  limit: '10mb'
}));

app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

app.use(cookieParser());


// ============================================================
// SECURITY
// ============================================================

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,

    crossOriginOpenerPolicy: {
      policy: 'same-origin-allow-popups'
    },

    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],

        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
          'https://kit.fontawesome.com',
          'https://ka-f.fontawesome.com'
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com',
          'https://cdnjs.cloudflare.com',
          'https://kit.fontawesome.com',
          'https://ka-f.fontawesome.com'
        ],

        imgSrc: [
          "'self'",
          'data:',
          'https:',
          'http://localhost:*',
          'http://127.0.0.1:*'
        ],

        connectSrc: [
          "'self'",
          'http://localhost:*',
          'http://127.0.0.1:*',
          'https:'
        ],

        fontSrc: [
          "'self'",
          'data:',
          'https:',
          'https://fonts.gstatic.com',
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net'
        ],

        objectSrc: ["'none'"],

        mediaSrc: ["'self'"],

        frameSrc: [
          "'self'",
          'https:'
        ]
      }
    }
  })
);


// ============================================================
// CORS
// ============================================================

const parseAllowedOrigins = () => {
  const configuredOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ||
    process.env.FRONTEND_URL ||
    ''
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const defaults = [
    'http://localhost:5000',
    'http://localhost:3000',
    'http://localhost:8000',
    'http://localhost:8080',
    'http://localhost:5500',
    'http://localhost:5501',

    'http://127.0.0.1:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501'
  ];

  return [
    ...new Set([
      ...defaults,
      ...configuredOrigins
    ])
  ];
};


const FRONTEND_ORIGINS = parseAllowedOrigins();


const isAllowedOrigin = (origin) => {

  // Requests without an Origin header
  // are allowed (Postman, server-to-server, etc.)
  if (!origin) {
    return true;
  }

  try {

    const { hostname } = new URL(origin);

    const normalizedHostname =
      hostname.toLowerCase();


    // Local development
    if (
      normalizedHostname === 'localhost' ||
      normalizedHostname === '127.0.0.1' ||
      normalizedHostname === '0.0.0.0' ||
      normalizedHostname.startsWith('192.168.')
    ) {
      return true;
    }


    // Allowed hosting/domain platforms
    if (
      normalizedHostname.endsWith('.netlify.app') ||
      normalizedHostname.endsWith('.vercel.app') ||
      normalizedHostname.endsWith('.github.dev') ||
      normalizedHostname.endsWith('.pages.dev') ||
      normalizedHostname.endsWith('.ngrok-free.app') ||
      normalizedHostname.endsWith('.ngrok.app') ||
      normalizedHostname.endsWith('.co.ke')
    ) {
      return true;
    }


    // Explicitly configured origins
    return FRONTEND_ORIGINS.includes(origin);

  } catch (error) {

    return false;

  }
};


app.use(
  cors({

    origin: function (origin, callback) {

      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(
          `CORS blocked for origin: ${origin}`
        ),
        false
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    credentials: true
  })
);


// ============================================================
// RATE LIMITING
// ============================================================

const limiter = rateLimit({

  windowMs: 15 * 60 * 1000,

  max: 100,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    message:
      'Too many requests. Please try again later.'
  }
});


app.use('/api', limiter);


// ============================================================
// HEALTH CHECK
// ============================================================

// This is important for testing the Novahost backend.
//
// Visit:
// https://api.competencehub.co.ke/
//
// You should see the JSON response below.

app.get('/', (req, res) => {

  res.status(200).json({

    message: 'CBC Portal Backend is running',

    status: 'OK',

    environment:
      process.env.NODE_ENV || 'development',

    timestamp: new Date().toISOString()

  });

});


// Additional health endpoint

app.get('/health', (req, res) => {

  res.status(200).json({

    status: 'OK',

    database:
      mongoose.connection.readyState === 1
        ? 'connected'
        : 'disconnected'

  });

});


// ============================================================
// SEO & SITEMAP
// ============================================================

// Serve robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(__dirname, 'public/robots.txt'));
});

// Serve sitemap.xml
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.sendFile(path.join(__dirname, 'public/sitemap.xml'));
});


// ============================================================
// STATIC PUBLIC FILES
// ============================================================

// Backend public directory only.
// This is NOT your Netlify frontend.

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


// ============================================================
// UPLOADS
// ============================================================

// Keep this only if your backend uses local uploads.

app.use(
  '/uploads',

  express.static(
    path.join(__dirname, 'uploads'),

    {
      setHeaders: (res) => {

        res.setHeader(
          'Access-Control-Allow-Origin',
          '*'
        );

        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET,OPTIONS'
        );

      }
    }
  )
);


// ============================================================
// API ROUTES
// ============================================================

// M-Pesa callback

app.post(
  '/api/mpesa/callback',
  mpesaCallback
);


// Users

app.use(
  '/api/users',
  userRoutes
);


// Marks

app.use(
  '/api/marks',
  markRoutes
);


// Materials

app.use(
  '/api/materials',
  materialRoutes
);


// Password/reset

app.use(
  '/api/reset',
  resetRoutes
);


// Schools

app.use(
  '/api',
  schoolRoutes
);


// Super admin

app.use(
  '/api',
  superAdminRoutes
);


// Promotions

app.use(
  '/api/promotions',
  promotionRoutes
);


// Enrollments

app.use(
  '/api/enrollments',
  enrollmentRoutes
);


// Accounts

app.use(
  '/api/accounts',
  accountsRoutes
);


// Payments

app.use(
  '/api/payments',
  paymentRoutes
);


// Reports

app.use(
  '/api/reports',
  reportsRoutes
);


// Expenses

app.use(
  '/api/expenses',
  expenseRoutes
);


// Settings

app.use(
  '/api/settings',
  settingsRoutes
);


// Timetables

app.use(
  '/api/timetables',
  timetableRoutes
);


// Announcements

app.use(
  '/api/announcements',
  announcementRoutes
);


// Electives

app.use(
  '/api/electives',
  electiveRoutes
);


// Subjects

app.use(
  '/api/subjects',
  subjectRoutes
);


// Learners

app.use(
  '/api/learners',
  studentRoutes
);


// ============================================================
// API 404 HANDLER
// ============================================================

app.use((req, res, next) => {

  if (req.path.startsWith('/api')) {

    console.warn(
      `❌ API endpoint not found: ${req.method} ${req.path}`
    );

    return res.status(404).json({

      success: false,

      message:
        `API endpoint not found: ${req.method} ${req.path}`

    });
  }

  next();

});


// ============================================================
// GENERAL 404 HANDLER
// ============================================================

app.use((req, res) => {

  res.status(404).json({

    success: false,

    message: 'Route not found'

  });

});


// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {

  console.error(
    '❌ Server error:',
    err
  );

  if (err.message?.startsWith('CORS blocked')) {

    return res.status(403).json({

      success: false,

      message: 'CORS policy blocked this request'

    });
  }


  res.status(
    err.status || 500
  ).json({

    success: false,

    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message

  });

});


// ============================================================
// DATABASE CONFIGURATION
// ============================================================

const rawNodeEnv =
  process.env.NODE_ENV;


const normalizedNodeEnv =
  rawNodeEnv
    ? String(rawNodeEnv)
        .trim()
        .toLowerCase()
    : 'development';


const isProduction =
  normalizedNodeEnv === 'production';


const rawDatabaseSource =
  String(
    process.env.DB_SOURCE ||
    process.env.MONGO_SOURCE ||
    (isProduction ? 'atlas' : 'local')
  )
    .trim()
    .toLowerCase();


// ============================================================
// DATABASE TARGET RESOLUTION
// ============================================================

const resolveDatabaseTarget = () => {

  // First priority:
  // MONGO_URI or MONGO_URL

  const explicitMongoUri =
    (
      process.env.MONGO_URI ||
      process.env.MONGO_URL ||
      ''
    ).trim();


  if (explicitMongoUri) {

    return {

      source: 'explicit',

      uri: explicitMongoUri,

      sourceEnvVar: 'MONGO_URI'

    };
  }


  const mode =
    rawDatabaseSource;


  // ----------------------------------------------------------
  // ATLAS
  // ----------------------------------------------------------

  if (mode === 'atlas') {

    const uri =
      process.env.MONGO_ATLAS;


    if (!uri) {

      throw new Error(
        'DB_SOURCE=atlas was requested but MONGO_ATLAS is not defined.'
      );
    }


    return {

      source: 'atlas',

      uri,

      sourceEnvVar: 'MONGO_ATLAS'

    };
  }


  // ----------------------------------------------------------
  // LOCAL
  // ----------------------------------------------------------

  if (mode === 'local') {

    const uri =
      process.env.MONGO_LOCAL;


    if (!uri) {

      throw new Error(
        'DB_SOURCE=local was requested but MONGO_LOCAL is not defined.'
      );
    }


    return {

      source: 'local',

      uri,

      sourceEnvVar: 'MONGO_LOCAL'

    };
  }


  // ----------------------------------------------------------
  // AUTO
  // ----------------------------------------------------------

  if (mode === 'auto') {

    if (isProduction) {

      const uri =
        process.env.MONGO_ATLAS ||
        process.env.MONGO_LOCAL;


      if (!uri) {

        throw new Error(
          'AUTO database selection is production-mode, but neither MONGO_ATLAS nor MONGO_LOCAL is defined.'
        );
      }


      return {

        source:
          process.env.MONGO_ATLAS
            ? 'atlas'
            : 'local',

        uri,

        sourceEnvVar:
          process.env.MONGO_ATLAS
            ? 'MONGO_ATLAS'
            : 'MONGO_LOCAL'

      };
    }


    const uri =
      process.env.MONGO_LOCAL ||
      process.env.MONGO_ATLAS;


    if (!uri) {

      throw new Error(
        'AUTO database selection is development-mode, but neither MONGO_LOCAL nor MONGO_ATLAS is defined.'
      );
    }


    return {

      source:
        process.env.MONGO_LOCAL
          ? 'local'
          : 'atlas',

      uri,

      sourceEnvVar:
        process.env.MONGO_LOCAL
          ? 'MONGO_LOCAL'
          : 'MONGO_ATLAS'

    };
  }


  throw new Error(

    `Unsupported DB_SOURCE value: ${mode}. ` +
    'Use atlas, local, or auto.'

  );
};


// ============================================================
// RESOLVE DATABASE
// ============================================================

let databaseTarget;


try {

  databaseTarget =
    resolveDatabaseTarget();

} catch (error) {

  console.error(
    '\n❌ Database source selection failed:'
  );

  console.error(
    error.message
  );

  console.error(
    'Set DB_SOURCE=atlas|local|auto and make sure the matching MONGO_* variable is present.'
  );

  process.exit(1);
}


const mongoURI =
  databaseTarget.uri;


// ============================================================
// DATABASE LOGGING
// ============================================================

console.log(
  `\n🌍 Environment (raw): ${rawNodeEnv}`
);

console.log(
  `🌍 Environment (normalized): ${normalizedNodeEnv}`
);

console.log(
  `🧭 Database source override: ${rawDatabaseSource}`
);

console.log(
  `📦 Resolved database source: ${databaseTarget.source}`
);

console.log(
  `📦 Using database URI from: ${databaseTarget.sourceEnvVar}`
);


// ============================================================
// OPTIONAL PUBLIC DNS
// ============================================================

if (
  process.env.FORCE_PUBLIC_DNS === 'true'
) {

  try {

    dns.setServers([
      '8.8.8.8',
      '1.1.1.1'
    ]);

    console.log(
      '🔁 Using public DNS servers: 8.8.8.8, 1.1.1.1'
    );

  } catch (error) {

    console.warn(
      '⚠️ Could not set DNS servers:',
      error.message || error
    );

  }
}


// ============================================================
// MONGOOSE OPTIONS
// ============================================================

const mongooseOptions = {

  serverSelectionTimeoutMS: 30000,

  connectTimeoutMS: 30000

};


// ============================================================
// DATABASE CONNECTION
// ============================================================

mongoose
  .connect(
    mongoURI,
    mongooseOptions
  )

  .then(async () => {

    console.log(
      '✅ MongoDB connected successfully!'
    );


    // --------------------------------------------------------
    // INDEX CLEANUP
    // --------------------------------------------------------

    try {

      await User.collection
        .dropIndex(
          'schoolId_1_admission_1'
        )
        .catch(() => {});

    } catch (error) {

      console.warn(
        '⚠️ Index cleanup skipped:',
        error.message
      );

    }


    // --------------------------------------------------------
    // SYNC INDEXES
    // --------------------------------------------------------

    try {

      await User.syncIndexes();

      console.log(
        '✅ User indexes synchronized.'
      );

    } catch (error) {

      console.warn(
        '⚠️ User index synchronization failed:',
        error.message
      );

    }


    // --------------------------------------------------------
    // CRON JOBS
    // --------------------------------------------------------

    try {

      startCronJobs();

      console.log(
        '✅ Scheduled background jobs started.'
      );

    } catch (error) {

      console.error(
        '❌ Failed to start cron jobs:',
        error
      );

    }


    // --------------------------------------------------------
    // START SERVER
    // --------------------------------------------------------

    const PORT =
      process.env.PORT || 5000;


    app.listen(
      PORT,
      '0.0.0.0',
      () => {

        console.log(
          `🚀 CBC Portal API running on port ${PORT}`
        );

        console.log(
          `🌐 Environment: ${normalizedNodeEnv}`
        );

        console.log(
          `🔗 API base: /api`
        );

      }
    );

  })

  .catch((err) => {

    console.error(
      '❌ MongoDB connection error:',
      err
    );


    if (
      err.message?.includes('IP')
    ) {

      console.log(
        '\n💡 Hint: Add the Novahost server IP to the MongoDB Atlas Network Access list.'
      );

    }

  });


// ============================================================
// EXPORT APP
// ============================================================

export default app;