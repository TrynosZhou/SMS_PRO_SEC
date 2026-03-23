import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import { User } from '../entities/User';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Exam } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { Invoice } from '../entities/Invoice';
import { Parent } from '../entities/Parent';
import { Settings } from '../entities/Settings';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Message } from '../entities/Message';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { Attendance } from '../entities/Attendance';
import { PromotionRule } from '../entities/PromotionRule';
import { RecordBook } from '../entities/RecordBook';
import { StudentTransfer } from '../entities/StudentTransfer';
import { StudentEnrollment } from '../entities/StudentEnrollment';
import { TimetableConfig } from '../entities/TimetableConfig';
import { TimetableSlot } from '../entities/TimetableSlot';
import { TimetableVersion } from '../entities/TimetableVersion';
import { ETask } from '../entities/ETask';
import { ETaskSubmission } from '../entities/ETaskSubmission';

// Load environment variables (only if not already set, e.g., in production)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

console.log('[DB Config] Creating DataSource configuration...');
console.log('[DB Config] Node version:', process.version);
console.log('[DB Config] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB Config] Module type check - typeof exports:', typeof exports);
console.log('[DB Config] Module type check - typeof module:', typeof module);

console.log('[DB Config] Preparing entity list...');
// Try using entity classes first, fallback to paths if needed
const entities = [User, Student, Teacher, Class, Subject, Exam, Marks, Invoice, Parent, Settings, ReportCardRemarks, Message, UniformItem, InvoiceUniformItem, Attendance, PromotionRule, RecordBook, StudentTransfer, StudentEnrollment, TimetableConfig, TimetableSlot, TimetableVersion, ETask, ETaskSubmission];
console.log('[DB Config] Entity count:', entities.length);
console.log('[DB Config] Entity names:', entities.map(e => e?.name || 'unknown').join(', '));
console.log('[DB Config] Checking each entity...');
entities.forEach((entity, index) => {
  try {
    console.log(`[DB Config] Entity ${index + 1}: ${entity?.name || 'unknown'} - OK`);
  } catch (err: any) {
    console.error(`[DB Config] Entity ${index + 1}: ERROR -`, err?.message);
  }
});

console.log('[DB Config] Creating DataSource instance...');
let AppDataSource: DataSource;
try {
  const entityPaths = process.env.NODE_ENV === 'production'
    ? ['dist/entities/**/*.js']
    : ['src/entities/**/*.ts'];
  const migrationsPath = process.env.NODE_ENV === 'production' 
    ? ['dist/migrations/**/*.js'] 
    : ['src/migrations/**/*.ts'];
  const subscribersPath = process.env.NODE_ENV === 'production'
    ? ['dist/subscribers/**/*.js']
    : ['src/subscribers/**/*.ts'];
  
  console.log('[DB Config] Using entity paths:', entityPaths);
  console.log('[DB Config] Migrations path:', migrationsPath);
  console.log('[DB Config] Subscribers path:', subscribersPath);
  
  AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USERNAME || 'postgres',
    password: String(process.env.DB_PASSWORD || ''),
    database: process.env.DB_NAME || 'sms_db',
    synchronize: false,
    logging: false,
    entities: entityPaths,
    migrations: migrationsPath,
    subscribers: subscribersPath,
  });
  
  console.log('[DB Config] DataSource created successfully');
  console.log('[DB Config] DataSource.isInitialized:', AppDataSource.isInitialized);
} catch (error: any) {
  console.error('[DB Config] ✗ ERROR creating DataSource:');
  console.error('[DB Config] Error type:', error?.constructor?.name);
  console.error('[DB Config] Error message:', error?.message);
  console.error('[DB Config] Error code:', error?.code);
  console.error('[DB Config] Error stack:', error?.stack);
  if (error?.cause) {
    console.error('[DB Config] Error cause:', error.cause);
  }
  throw error;
}

export { AppDataSource };

