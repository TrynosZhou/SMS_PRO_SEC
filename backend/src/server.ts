import 'reflect-metadata';
console.log('[Server] ✓ reflect-metadata loaded');

import express from 'express';
console.log('[Server] ✓ express loaded');

import cors from 'cors';
console.log('[Server] ✓ cors loaded');

import dotenv from 'dotenv';
console.log('[Server] ✓ dotenv loaded');

console.log('[Server] Loading database configuration...');
import { AppDataSource } from './config/database';
console.log('[Server] ✓ Database configuration imported');

import routes from './routes';
console.log('[Server] ✓ Routes loaded');

import { syncStoredStudentNumbersWithSettingsPrefix } from './utils/syncStudentNumbersWithSettingsPrefix';
import { syncStoredTeacherIdsWithSettingsPrefix } from './utils/syncStoredTeacherIdsWithSettingsPrefix';
import { ensureETaskTable } from './utils/ensureETaskTable';
import { ensureETaskSubmissionTable } from './utils/ensureETaskSubmissionTable';
import { ensureTeacherGenderColumn } from './utils/ensureTeacherGenderColumn';

import * as path from 'path';
import * as fs from 'fs';

// =================== ENVIRONMENT SETUP ===================
dotenv.config();

// Validate required environment variables
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const hasDiscreteDb =
  Boolean(process.env.DB_HOST?.trim()) &&
  Boolean(process.env.DB_USERNAME?.trim()) &&
  process.env.DB_PASSWORD !== undefined &&
  String(process.env.DB_PASSWORD).trim() !== '' &&
  Boolean(process.env.DB_NAME?.trim());

const missingJwt = !process.env.JWT_SECRET?.trim();
const missingDb = !hasDatabaseUrl && !hasDiscreteDb;

if (missingJwt || missingDb) {
  console.error('❌ Missing required environment variables:');
  if (missingJwt) {
    console.error('   - JWT_SECRET');
  }
  if (missingDb) {
    console.error(
      '   - DATABASE_URL (recommended for Render), or all of: DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME'
    );
  }
  process.exit(1);
}

// Validate JWT_SECRET
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️ JWT_SECRET should be at least 32 characters long');
}

// =================== APP SETUP ===================
const app = express();

// CORS setup
const allowedOrigins = [
  'https://sms-apua.vercel.app',
  'http://localhost:4200',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    console.log('CORS request from origin:', origin);

    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // In production, restrict to allowed origins (+ vercel subdomains)
    const isAllowed =
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin) ||
      origin.includes('.vercel.app');

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Disable caching on auth routes to prevent Cloudflare caching responses
app.use('/api/auth', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded student photos
// Use absolute path to ensure it works regardless of where the server is started from
const uploadsPath = path.join(__dirname, '../../uploads/students');
console.log('[Server] Serving static files from:', uploadsPath);
app.use('/uploads/students', express.static(uploadsPath));

// Serve generated payroll PDFs
const payrollUploadsPath = path.join(__dirname, '../../uploads/payrolls');
console.log('[Server] Serving static files from:', payrollUploadsPath);
try {
  if (!fs.existsSync(payrollUploadsPath)) {
    fs.mkdirSync(payrollUploadsPath, { recursive: true });
  }
} catch (e) {
  console.warn('[Server] Could not ensure payroll uploads directory exists:', e);
}
app.use('/uploads/payrolls', express.static(payrollUploadsPath));

// E-learning task attachments (teachers upload; students download)
const etaskUploadsPath = path.join(__dirname, '../../uploads/etasks');
console.log('[Server] Serving static files from:', etaskUploadsPath);
try {
  if (!fs.existsSync(etaskUploadsPath)) {
    fs.mkdirSync(etaskUploadsPath, { recursive: true });
  }
} catch (e) {
  console.warn('[Server] Could not ensure etasks uploads directory exists:', e);
}
app.use('/uploads/etasks', express.static(etaskUploadsPath));

// =================== ROUTES ===================
app.use('/api', routes);

// Health check (use publicSignupRoles to confirm production runs a build that allows admin signup)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'School Management System API',
    publicSignupRoles: ['student', 'parent', 'admin'],
    gitCommit: process.env.RENDER_GIT_COMMIT || undefined,
  });
});

// Debug route for exams
app.get('/api/exams/test', (req, res) => {
  res.json({ message: 'Exam routes are working', path: req.path });
});

// Root
app.get('/', (req, res) => {
  res.send('<h1>School Management System API</h1><p>Use /api/... endpoints to interact.</p>');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.path, method: req.method });
});

// Optional: global error handler (for thrown errors in routes)
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
  ) => {
    console.error('[Server] ✗ EXPRESS ERROR HANDLER:');
    console.error('  Path:', req.path);
    console.error('  Method:', req.method);
    console.error('  Error message:', err?.message);
    console.error('  Stack:', err?.stack);
    res.status(500).json({ message: 'Internal server error', error: err?.message || 'Unknown error' });
  }
);

// =================== DATABASE & SERVER ===================
const PORT = process.env.PORT || 3007;

console.log('[Server] Starting database initialization...');
console.log('[Server] Node version:', process.version);
console.log('[Server] Platform:', process.platform);
console.log('[Server] Architecture:', process.arch);
console.log('[Server] Current working directory:', process.cwd());
console.log('[Server] AppDataSource type:', typeof AppDataSource);
console.log('[Server] AppDataSource.isInitialized before:', AppDataSource.isInitialized);

// Global process-level error listeners
process.on('uncaughtException', (error) => {
  console.error('[Server] ✗ UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] ✗ UNHANDLED REJECTION:', { reason, promise });
});

// Wrap everything in an async bootstrap function
async function bootstrap() {
  try {
    console.log('[Server] Calling AppDataSource.initialize()...');
    await AppDataSource.initialize();
    console.log('[Server] ✓ Database connected successfully');
    console.log('[Server] DataSource.isInitialized:', AppDataSource.isInitialized);

    try {
      await ensureETaskTable(AppDataSource);
    } catch (etErr: any) {
      console.error('[Server] ensureETaskTable failed (e-learning tasks may not work):', etErr?.message || etErr);
    }

    try {
      await ensureETaskSubmissionTable(AppDataSource);
    } catch (esErr: any) {
      console.error('[Server] ensureETaskSubmissionTable failed (e-learning submissions may not work):', esErr?.message || esErr);
    }

    try {
      await ensureTeacherGenderColumn(AppDataSource);
    } catch (tgErr: any) {
      console.warn('[Server] ensureTeacherGenderColumn:', tgErr?.message || tgErr);
    }

    // Ensure existing students use the student ID prefix from settings (one-time alignment per boot)
    if (process.env.SKIP_STUDENT_ID_PREFIX_SYNC !== 'true') {
      try {
        const syncResult = await syncStoredStudentNumbersWithSettingsPrefix();
        if (syncResult.updated > 0) {
          console.log(
            `[Server] Student ID prefix sync: updated ${syncResult.updated}, skipped ${syncResult.skipped}`
          );
        }
        if (syncResult.errors.length > 0) {
          console.warn('[Server] Student ID prefix sync:', syncResult.errors.join('; '));
        }
      } catch (syncErr: any) {
        console.warn('[Server] Student ID prefix sync skipped/failed:', syncErr?.message || syncErr);
      }
    }

    if (process.env.SKIP_TEACHER_ID_PREFIX_SYNC !== 'true') {
      try {
        const syncResult = await syncStoredTeacherIdsWithSettingsPrefix();
        if (syncResult.updated > 0) {
          console.log(
            `[Server] Teacher ID prefix sync: updated ${syncResult.updated}, skipped ${syncResult.skipped}`
          );
        }
        if (syncResult.errors.length > 0) {
          console.warn('[Server] Teacher ID prefix sync:', syncResult.errors.join('; '));
        }
      } catch (syncErr: any) {
        console.warn('[Server] Teacher ID prefix sync skipped/failed:', syncErr?.message || syncErr);
      }
    }

    // ========== SKIP MIGRATIONS ON STARTUP ==========
    // Migrations should be run manually using: npm run typeorm -- migration:run
    // This prevents the server from hanging on startup if migrations are slow or blocked
    console.log('[Server] Skipping migrations (tables already created by sync-schema)...');
    console.log('[Server] Migrations skipped - proceeding to start server');

    console.log('[Server] DataSource options:', {
      type: AppDataSource.options.type,
      database: AppDataSource.options.database,
      entitiesCount: AppDataSource.entityMetadatas.length,
      migrationsCount: AppDataSource.migrations.length,
    });

    console.log('[Server] Starting HTTP server on port', PORT);
    app.listen(PORT, () => {
      console.log(`[Server] ✓ Server running on port ${PORT}`);
    });
  } catch (error: any) {
    console.error('[Server] ✗ ERROR connecting to database:');
    console.error('  Error type:', error?.constructor?.name);
    console.error('  Error name:', error?.name);
    console.error('  Message:', error?.message);
    console.error('  Code:', error?.code);
    console.error('  Stack:', error?.stack);

    const dbUrl = String(process.env.DATABASE_URL || '').trim();
    let urlHost = '';
    if (dbUrl) {
      try {
        urlHost = new URL(dbUrl.replace(/^postgresql:/i, 'postgres:')).hostname;
      } catch {
        /* ignore */
      }
    }
    const host = String(process.env.DB_HOST || urlHost || '').trim();
    if (error?.code === 'ENOTFOUND' && host && !host.includes('.')) {
      console.error(
        '[Server] Hint: database host looks like a short Render DB id (no domain). ' +
          'Use a full hostname in DATABASE_URL or DB_HOST ' +
          '(e.g. dpg-xxxxx.<region>-postgres.render.com), or link Postgres to the web service so Render sets DATABASE_URL.'
      );
    }

    process.exit(1);
  }
}

bootstrap();