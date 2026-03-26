import { Router } from 'express';
import {
  sendBulkMessage,
  getParentMessages,
  markParentMessageRead,
  sendParentMessageToSchool,
  getParentOutboxMessages
} from '../controllers/message.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/bulk', authenticate, sendBulkMessage);
router.get('/parent', authenticate, getParentMessages);
router.get('/parent/outbox', authenticate, getParentOutboxMessages);
router.post('/parent/send', authenticate, sendParentMessageToSchool);
router.patch('/parent/:id/read', authenticate, markParentMessageRead);

export default router;

