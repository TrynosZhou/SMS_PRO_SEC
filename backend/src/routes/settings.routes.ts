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
router.post('/opening-day', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processOpeningDay);
router.post('/closing-day', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), processClosingDay);
router.post('/reset-data', authenticate, authorize(UserRole.ADMIN, UserRole.SUPERADMIN), resetCoreData);

export default router;

