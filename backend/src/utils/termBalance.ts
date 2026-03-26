import { AppDataSource } from '../config/database';
import { Invoice } from '../entities/Invoice';

/**
 * Outstanding balance for the current term invoice only (latest invoice's `balance` field).
 * Does not include projected next-term tuition/fees — those are merged into `currentInvoiceBalance`
 * for parents in `getParentStudents` only.
 */
export async function getTermBalanceForStudent(studentId: string): Promise<number> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  const invoiceRepository = AppDataSource.getRepository(Invoice);
  const latestInvoice = await invoiceRepository.findOne({
    where: { studentId },
    order: { createdAt: 'DESC' }
  });
  if (!latestInvoice) {
    return 0;
  }
  return parseFloat(String(latestInvoice.balance ?? 0));
}
