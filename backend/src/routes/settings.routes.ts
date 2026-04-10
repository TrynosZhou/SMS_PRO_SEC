import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserRole } from '../entities/User';
import { 
  getSettings, 
  updateSettings, 
  getActiveTerm, 
  processOpeningDay, 
  processClosingDay, 
  getYearEndReminders,
  getUniformItems,
  createUniformItem,
  updateUniformItem,
  deleteUniformItem,
  getPublicSplashSettings,
  resetCoreData
} from '../controllers/settings.controller';
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from '../controllers/department.controller';

const router = Router();

router.get('/public/splash', getPublicSplashSettings);
router.get('/', authenticate, getSettings);
router.put('/', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateSettings);
router.get('/active-term', authenticate, getActiveTerm);
router.get('/reminders', authenticate, getYearEndReminders);
router.get('/uniform-items', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN, UserRole.ACCOUNTANT), getUniformItems);
router.post('/uniform-items', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createUniformItem);
router.put('/uniform-items/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateUniformItem);
router.delete('/uniform-items/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteUniformItem);

// Departments (school structure)
router.get('/departments', authenticate, listDepartments);
router.post('/departments', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), createDepartment);
router.put('/departments/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), updateDepartment);
router.delete('/departments/:id', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), deleteDepartment);
router.post('/opening-day', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processOpeningDay);
router.post('/closing-day', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processClosingDay);
router.post('/reset-data', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), resetCoreData);

export default router;

