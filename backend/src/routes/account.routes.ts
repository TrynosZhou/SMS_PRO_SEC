import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { updateAccount, getAccountInfo, createUserAccount, adminResetTeacherPassword } from '../controllers/account.controller';
import { UserRole } from '../entities/User';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get account info (all authenticated users)
router.get('/', getAccountInfo);

// Update account (all authenticated users - teachers, parents, students)
router.put('/', updateAccount);

// Admin/SuperAdmin can create user accounts
router.post(
  '/users',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN),
  createUserAccount
);

// Admin/SuperAdmin/Demo: reset teacher user password (returns temporary password)
router.post(
  '/users/:userId/reset-password',
  authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.DEMO_USER),
  adminResetTeacherPassword
);

export default router;

