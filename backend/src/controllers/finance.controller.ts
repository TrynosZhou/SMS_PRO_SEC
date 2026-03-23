import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Invoice, InvoiceStatus } from '../entities/Invoice';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';
import { AuthRequest } from '../middleware/auth';
import { createInvoicePDF } from '../utils/invoicePdfGenerator';
import { createReceiptPDF } from '../utils/receiptPdfGenerator';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { isDemoUser } from '../utils/demoDataFilter';
import { parseAmount, roundMoney } from '../utils/numberUtils';
import { buildPaginationResponse, parsePaginationParams } from '../utils/pagination';
import { logPaymentAuditEvent } from '../utils/paymentAuditLogger';
import { PaymentAuditEventType } from '../entities/PaymentAuditLog';

/**
 * Uniform subtotal for an invoice: prefer sum of line items (source of truth) when rows exist,
 * otherwise the invoices.uniformTotal column (e.g. legacy rows).
 */
function getUniformTotalForInvoice(invoice: Invoice | null | undefined): number {
  if (!invoice) return 0;
  const lines = invoice.uniformItems;
  if (Array.isArray(lines) && lines.length > 0) {
    return roundMoney(lines.reduce((sum, row) => sum + parseAmount(row.lineTotal), 0));
  }
  return roundMoney(parseAmount(invoice.uniformTotal));
}

// Helper function to determine next term
function getNextTerm(currentTerm: string): string {
  // Extract term number and year if present
  const termMatch = currentTerm.match(/Term\s*(\d+)(?:\s*(\d{4}))?/i);
  if (!termMatch) {
    // If format is not recognized, try to increment
    if (currentTerm.includes('1')) return currentTerm.replace(/1/g, '2');
    if (currentTerm.includes('2')) return currentTerm.replace(/2/g, '3');
    if (currentTerm.includes('3')) {
      const yearMatch = currentTerm.match(/(\d{4})/);
      if (yearMatch) {
        const nextYear = parseInt(yearMatch[1]) + 1;
        return currentTerm.replace(/\d{4}/, nextYear.toString()).replace(/3/g, '1');
      }
      return currentTerm.replace(/3/g, '1');
    }

    return currentTerm;
  }

  const termNum = parseInt(termMatch[1]);
  const year = termMatch[2] ? parseInt(termMatch[2]) : new Date().getFullYear();

  if (termNum === 1) {
    return `Term 2 ${year}`;
  } else if (termNum === 2) {
    return `Term 3 ${year}`;
  } else if (termNum === 3) {
    return `Term 1 ${year + 1}`;
  }

  return currentTerm;
}

export const createInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, amount, dueDate, term, description, uniformItems } = req.body;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const uniformItemRepository = AppDataSource.getRepository(UniformItem);
    const invoiceUniformItemRepository = AppDataSource.getRepository(InvoiceUniformItem);

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get previous balance and prepaid amount from last invoice
    const lastInvoice = await invoiceRepository.findOne({
      where: { studentId },
      order: { createdAt: 'DESC' }
    });

    // Ensure numeric values to avoid string concatenation
    const previousBalance = parseAmount(lastInvoice?.balance);
    const prepaidAmount = parseAmount(lastInvoice?.prepaidAmount);
    let baseAmount = parseAmount(amount);
    let calculatedFees = 0;

    // If term is provided, automatically calculate fees for that term
    // This ensures fees are added for the selected term (tuition, transport, DH, sports, library)
    // The amount field can be used for manual adjustments, but if term is provided, we calculate fees
    if (term) {
      const settingsRepository = AppDataSource.getRepository(Settings);
      const settingsList = await settingsRepository.find({
        order: { createdAt: 'DESC' },
        take: 1
      });
      const settings = settingsList.length > 0 ? settingsList[0] : null;

      if (settings && settings.feesSettings) {
        const fees = settings.feesSettings;
        const dayScholarTuitionFee = parseAmount(fees.dayScholarTuitionFee);
        const boarderTuitionFee = parseAmount(fees.boarderTuitionFee);
        const deskFee = parseAmount(fees.deskFee);
        const transportCost = parseAmount(fees.transportCost);
        const diningHallCost = parseAmount(fees.diningHallCost);
        const libraryFee = parseAmount(fees.libraryFee);
        const sportsFee = parseAmount(fees.sportsFee);
        const otherFees = Array.isArray(fees.otherFees) ? fees.otherFees : [];
        const otherFeesTotal = otherFees.reduce((sum: number, fee: any) => sum + parseAmount(fee?.amount), 0);

        // Check if desk fee was already charged (only charge once at registration)
        const hasPreviousInvoice = Boolean(lastInvoice);
        const shouldChargeDeskFee = !hasPreviousInvoice;

        // Calculate fees based on staff child status
        if (!student.isStaffChild) {
          const tuitionFee = student.studentType === 'Boarder' ? boarderTuitionFee : dayScholarTuitionFee;
          calculatedFees += tuitionFee;
        }

        // Desk fee: only charged once at registration
        if (!student.isStaffChild && shouldChargeDeskFee) {
          calculatedFees += deskFee;
        }

        // Library fee, sports fee: charged every term
        if (!student.isStaffChild) {
          calculatedFees += libraryFee;
          calculatedFees += sportsFee;
          calculatedFees += otherFeesTotal;
        }

        // Transport cost: only for day scholars who use transport
        if (student.studentType === 'Day Scholar' && student.usesTransport && !student.isStaffChild) {
          calculatedFees += transportCost;
        }

        // Dining hall cost: full price for regular students, 50% for staff children
        if (student.usesDiningHall) {
          if (student.isStaffChild) {
            calculatedFees += diningHallCost * 0.5; // 50% for staff children
          } else {
            calculatedFees += diningHallCost; // Full price for regular students
          }
        }

        const hasUniformItems = Array.isArray(uniformItems) && uniformItems.length > 0;
        const isUniformOnlyInvoice = hasUniformItems && baseAmount === 0;

        if (calculatedFees > 0) {
          // When the user supplied a base amount, respect it (allows discounts/adjustments)
          // Otherwise, default to the calculated fees – except for uniform-only invoices where
          // accountants intentionally keep tuition at 0.
          if (!isUniformOnlyInvoice) {
            const baseAmountMatchesCalculated = Math.abs(baseAmount - calculatedFees) < 0.01;
            if (baseAmount === 0 || baseAmountMatchesCalculated) {
              baseAmount = calculatedFees;
            }
          }
        } else if (calculatedFees === 0 && baseAmount === 0 && !hasUniformItems) {
          // If no fees calculated and no amount provided and no uniform items, this is an error
          // But we'll let it pass and handle validation elsewhere
        }
      }
    }

    if (!Number.isFinite(calculatedFees)) {
      calculatedFees = 0;
    }

    // Process uniform items (check if this is a uniform-only invoice)
    let uniformTotal = 0;
    let uniformItemsEntities: InvoiceUniformItem[] = [];

    if (Array.isArray(uniformItems) && uniformItems.length > 0) {
      for (let index = 0; index < uniformItems.length; index++) {
        const payloadItem = uniformItems[index];
        const itemId = payloadItem?.itemId || payloadItem?.uniformItemId;
        const quantityRaw = payloadItem?.quantity;

        if (!itemId) {
          return res.status(400).json({ message: `Uniform item ID missing for entry at index ${index}` });
        }

        const quantity = parseInt(String(quantityRaw), 10);
        if (isNaN(quantity) || quantity <= 0) {
          return res.status(400).json({ message: `Invalid quantity for uniform item at index ${index}` });
        }

        const uniformItem = await uniformItemRepository.findOne({
          where: { id: itemId }
        });

        if (!uniformItem || !uniformItem.isActive) {
          return res.status(400).json({ message: `Uniform item not found or inactive (${itemId})` });
        }

        const unitPrice = parseAmount(uniformItem.unitPrice);
        const lineTotal = unitPrice * quantity;
        uniformTotal += lineTotal;

        uniformItemsEntities.push(
          invoiceUniformItemRepository.create({
            uniformItem,
            uniformItemId: uniformItem.id,
            itemName: uniformItem.name,
            unitPrice,
            quantity,
            lineTotal
          })
        );
      }
    }

    const amountNumRaw = baseAmount + uniformTotal;
    const amountNum = Number.isFinite(amountNumRaw) ? amountNumRaw : 0;
    
    // Calculate total invoice amount (previous balance + new amount)
    const totalInvoiceAmountRaw = previousBalance + amountNum;
    const totalInvoiceAmount = Number.isFinite(totalInvoiceAmountRaw) ? totalInvoiceAmountRaw : 0;
    
    // Calculate how much prepaid amount is applied to this invoice
    // Prepaid amount can cover part or all of the total invoice amount
    const appliedPrepaidAmount = Math.min(prepaidAmount, totalInvoiceAmount);
    const remainingPrepaidAmount = Math.max(0, prepaidAmount - appliedPrepaidAmount);
    const finalBalance = totalInvoiceAmount - appliedPrepaidAmount;

    // Generate invoice number
    const invoiceCount = await invoiceRepository.count();
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCount + 1).padStart(6, '0')}`;

    const invoice = invoiceRepository.create({
      invoiceNumber,
      studentId,
      amount: amountNum,
      previousBalance,
      paidAmount: appliedPrepaidAmount,
      prepaidAmount: remainingPrepaidAmount,
      balance: finalBalance,
      dueDate,
      term,
      description,
      status: finalBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PENDING,
      uniformTotal,
      uniformItems: uniformItemsEntities
    });

    const savedInvoice = await invoiceRepository.save(invoice);
    const invoiceWithRelations = await invoiceRepository.findOne({
      where: { id: savedInvoice.id },
      relations: ['student']
    });
    
    // Generate invoice PDF
    const studentWithClass = await studentRepository.findOne({ 
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (studentWithClass) {
      const settingsRepository = AppDataSource.getRepository(Settings);
      const settings = await settingsRepository.findOne({
        where: {},
        order: { createdAt: 'DESC' }
      });

      try {
        const invoicePDF = await createInvoicePDF({
          invoice: (invoiceWithRelations || savedInvoice),
          student: studentWithClass,
          settings
        });

        res.status(201).json({ 
          message: 'Invoice created successfully', 
          invoice: (invoiceWithRelations || savedInvoice),
          invoicePdf: invoicePDF.toString('base64')
        });
      } catch (pdfError) {
        console.error('Error generating invoice PDF:', pdfError);
        res.status(201).json({ 
          message: 'Invoice created successfully (PDF generation failed)', 
          invoice: (invoiceWithRelations || savedInvoice)
        });
      }
    } else {
      res.status(201).json({ message: 'Invoice created successfully', invoice: (invoiceWithRelations || savedInvoice) });
    }
  } catch (error: any) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getInvoices = async (req: AuthRequest, res: Response) => {
  try {
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const { studentId, status, invoiceId } = req.query as { studentId?: string; status?: string; invoiceId?: string };
    const pagination = parsePaginationParams(req.query);
    const searchQuery = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

    // Demo users have full access to all invoices
    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (status) where.status = status;
    if (invoiceId) where.id = invoiceId;

    let invoices = await invoiceRepository.find({
      where,
      relations: ['student', 'uniformItems'],
      order: { createdAt: 'DESC' }
    });

    // Uniform subtotal: use sum of line items when present (keeps UI in sync if invoices.uniformTotal was 0)
    for (const inv of invoices) {
      (inv as Invoice).uniformTotal = getUniformTotalForInvoice(inv);
    }

    if (searchQuery) {
      invoices = invoices.filter(invoice => {
        const invoiceNumber = (invoice.invoiceNumber || '').toLowerCase();
        const studentName = `${invoice.student?.firstName || ''} ${invoice.student?.lastName || ''}`.toLowerCase();
        return invoiceNumber.includes(searchQuery) || studentName.includes(searchQuery);
      });
    }

    if (pagination.isPaginated) {
      const total = invoices.length;
      const paged = invoices.slice(pagination.skip, pagination.skip + pagination.limit);
      return res.json(buildPaginationResponse(paged, pagination.page, pagination.limit, total));
    }

    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateInvoicePayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { paidAmount, paymentDate, paymentMethod, notes, isPrepayment } = req.body;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    if (!paidAmount || paidAmount <= 0) {
      return res.status(400).json({ message: 'Payment amount is required and must be greater than 0' });
    }

    const invoice = await invoiceRepository.findOne({ 
      where: { id },
      relations: ['student']
    });
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const oldInvoiceStatus = invoice.status;

    // Ensure all values are numbers to avoid string concatenation
    const oldPaidAmount = parseAmount(invoice.paidAmount);
    const oldPrepaidAmount = parseAmount(invoice.prepaidAmount);
    const paidAmountNum = parseAmount(paidAmount);
    const currentBalance = parseAmount(invoice.balance);
    
    if (isPrepayment) {
      invoice.prepaidAmount = oldPrepaidAmount + paidAmountNum;
      invoice.paidAmount = oldPaidAmount + paidAmountNum;
    } else {
      const paymentTowardBalance = Math.min(paidAmountNum, currentBalance);
      const overPayment = Math.max(0, paidAmountNum - paymentTowardBalance);

      invoice.paidAmount = oldPaidAmount + paymentTowardBalance;
      invoice.balance = Math.max(0, currentBalance - paymentTowardBalance);

      if (overPayment > 0) {
        invoice.prepaidAmount = oldPrepaidAmount + overPayment;
      }
    }

    if (invoice.balance <= 0) {
      invoice.status = InvoiceStatus.PAID;
    } else if (invoice.paidAmount > 0) {
      invoice.status = InvoiceStatus.PARTIAL;
    }

    // Check if overdue
    if (new Date() > invoice.dueDate && invoice.balance > 0) {
      invoice.status = InvoiceStatus.OVERDUE;
    }

    await invoiceRepository.save(invoice);

    // Generate receipt PDF
    const student = await studentRepository.findOne({ 
      where: { id: invoice.studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Generate receipt number
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;

    // Use provided payment date or current date
    const actualPaymentDate = paymentDate ? new Date(paymentDate) : new Date();

    const receiptPDF = await createReceiptPDF({
      invoice,
      student,
      settings,
      paymentAmount: paidAmount,
      paymentDate: actualPaymentDate,
      paymentMethod: paymentMethod || 'Cash',
      notes: notes || '',
      receiptNumber,
      isPrepayment: isPrepayment || false
    });

    // Audit: record transaction (cash receipt / manual payment update)
    try {
      if (req.user) {
        const eventType =
          oldPaidAmount === 0 && oldPrepaidAmount === 0 && oldInvoiceStatus === InvoiceStatus.PENDING
            ? PaymentAuditEventType.CREATE
            : PaymentAuditEventType.UPDATE;

        const previousInvoiceWasConfirmed =
          oldInvoiceStatus === InvoiceStatus.PAID || oldInvoiceStatus === InvoiceStatus.PARTIAL;

        await logPaymentAuditEvent({
          user: { id: req.user.id, username: req.user.username, role: req.user.role },
          student,
          amountPaid: paidAmountNum,
          paymentMethod: paymentMethod || 'Cash',
          referenceNumber: receiptNumber,
          eventAt: actualPaymentDate,
          eventType,
          paymentId: null,
          invoiceId: invoice.id,
          previousInvoiceStatus: oldInvoiceStatus,
          previousInvoiceWasConfirmed
        });
      }
    } catch (auditErr) {
      console.error('Payment audit (cash) failed:', auditErr);
    }

    res.json({ 
      message: 'Payment updated successfully', 
      invoice,
      receiptPdf: receiptPDF.toString('base64'),
      receiptNumber
    });
  } catch (error: any) {
    console.error('Error updating payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const calculateNextTermBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, nextTermAmount } = req.body;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    const student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Get current balance
    const lastInvoice = await invoiceRepository.findOne({
      where: { studentId },
      order: { createdAt: 'DESC' }
    });

    const currentBalance = parseAmount(lastInvoice?.balance);
    const prepaidAmount = parseAmount(lastInvoice?.prepaidAmount);
    const totalBeforeCredit = currentBalance + nextTermAmount;
    const appliedPrepaid = Math.min(prepaidAmount, totalBeforeCredit);
    const nextTermBalance = totalBeforeCredit - appliedPrepaid;

    res.json({
      currentBalance,
      nextTermAmount,
      appliedPrepaid,
      availablePrepaid: prepaidAmount,
      nextTermBalance
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const createBulkInvoices = async (req: AuthRequest, res: Response) => {
  try {
    // term is the CURRENT term - invoices will be created for the FOLLOWING term
    const { term, dueDate, description } = req.body;
    
    if (!term || !dueDate) {
      return res.status(400).json({ message: 'Current term and due date are required' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    // Get settings for tuition fees
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });

    if (!settings || !settings.feesSettings) {
      return res.status(400).json({ message: 'Fee settings not configured. Please configure fees in settings first.' });
    }

    const feesConfig = settings.feesSettings;
    const dayScholarTuitionFee = parseAmount(feesConfig.dayScholarTuitionFee);
    const boarderTuitionFee = parseAmount(feesConfig.boarderTuitionFee);
    const transportCost = parseAmount(feesConfig.transportCost);
    const diningHallCost = parseAmount(feesConfig.diningHallCost);
    const deskFee = parseAmount(feesConfig.deskFee);
    const libraryFee = parseAmount(feesConfig.libraryFee);
    const sportsFee = parseAmount(feesConfig.sportsFee);
    const otherFeesArray = Array.isArray(feesConfig.otherFees) ? feesConfig.otherFees : [];
    const otherFeesTotal = otherFeesArray.reduce((sum: number, fee: any) => sum + parseAmount(fee?.amount), 0);

    // Get all active students
    const students = await studentRepository.find({
      where: { isActive: true },
      relations: ['classEntity']
    });

    if (students.length === 0) {
      return res.status(404).json({ message: 'No active students found' });
    }

    const results = {
      total: students.length,
      created: 0,
      failed: 0,
      invoices: [] as any[],
      errors: [] as string[]
    };

    // Get current invoice count for numbering
    const invoiceCount = await invoiceRepository.count();
    let invoiceCounter = invoiceCount + 1;

    // Process each student
    for (const student of students) {
      try {
        // Get previous balance from last invoice (this is the outstanding fees balance)
        const lastInvoice = await invoiceRepository.findOne({
          where: { studentId: student.id },
          order: { createdAt: 'DESC' }
        });

        // Previous balance and prepaid credit from the last invoice
        const previousBalance = parseAmount(lastInvoice?.balance);
        const previousPrepaid = parseAmount(lastInvoice?.prepaidAmount);

        // Determine tuition fee for the NEXT term (following term)
        // The term provided is the current term, so we calculate fees for the following term
        const nextTerm = getNextTerm(term);
        
        // Desk fee is only charged once at registration
        // Get the first invoice to check if desk fee was already charged
        const shouldChargeDeskFee = !lastInvoice;
        
        // Calculate fees based on staff child status
        let termFees = 0;
        
        // Staff children don't pay tuition fees
        if (!student.isStaffChild) {
          const tuitionFeeNum = student.studentType === 'Boarder' 
            ? boarderTuitionFee
            : dayScholarTuitionFee;
          
          if (tuitionFeeNum <= 0) {
            results.failed++;
            results.errors.push(`${student.firstName} ${student.lastName}: Tuition fee not set for ${student.studentType}`);
            continue;
          }
          
          termFees += tuitionFeeNum;
        }

        // Desk fee: only charged once at registration (first invoice only)
        if (!student.isStaffChild && shouldChargeDeskFee) {
          termFees += deskFee;
        }
        
        // Library fee, sports fee, and other fees: charged every term for non-staff children
        if (!student.isStaffChild) {
          termFees += libraryFee;
          termFees += sportsFee;
          termFees += otherFeesTotal;
        }

        // Transport cost: only for day scholars who use transport AND are not staff children
        if (student.studentType === 'Day Scholar' && student.usesTransport && !student.isStaffChild) {
          termFees += transportCost;
        }

        // Dining hall cost: full price for regular students, 50% for staff children
        if (student.usesDiningHall) {
          const diningCost = diningHallCost;
          if (student.isStaffChild) {
            termFees += diningCost * 0.5; // 50% for staff children
          } else {
            termFees += diningCost; // Full price for regular students
          }
        }

        if (!Number.isFinite(termFees)) {
          termFees = 0;
        }

        // Calculate total amount due for the new invoice (before applying prepaid credit)
        const totalAmount = previousBalance + termFees;
        const appliedPrepaid = Math.min(previousPrepaid, totalAmount);
        const remainingPrepaid = previousPrepaid - appliedPrepaid;
        const finalBalance = totalAmount - appliedPrepaid;

        // Generate invoice number
        const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoiceCounter).padStart(6, '0')}`;
        invoiceCounter++;

        // Create invoice for the following term
        // term variable is the current term, but we're creating invoice for next term
        const invoice = invoiceRepository.create({
          invoiceNumber,
          studentId: student.id,
          amount: termFees,
          previousBalance,
          balance: finalBalance,
          prepaidAmount: remainingPrepaid,
          paidAmount: appliedPrepaid,
          dueDate: new Date(dueDate),
          term: nextTerm,
          description: description || `Fees for ${nextTerm} - ${student.studentType}${student.isStaffChild ? ' (Staff Child)' : ''}`,
          status: finalBalance <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PENDING
        });

        const savedInvoice = await invoiceRepository.save(invoice);
        
        results.created++;
        results.invoices.push({
          invoiceNumber: savedInvoice.invoiceNumber,
          studentName: `${student.firstName} ${student.lastName}`,
          studentNumber: student.studentNumber,
          termFees: termFees,
          previousBalance,
          totalBalance: finalBalance,
          prepaidApplied: appliedPrepaid,
          remainingPrepaid,
          term: nextTerm
        });
      } catch (error: any) {
        results.failed++;
        results.errors.push(`${student.firstName} ${student.lastName}: ${error.message || 'Unknown error'}`);
        console.error(`Error creating invoice for student ${student.id}:`, error);
      }
    }

    res.status(201).json({
      message: `Bulk invoice creation completed. Created: ${results.created}, Failed: ${results.failed}`,
      summary: results
    });
  } catch (error: any) {
    console.error('Error in bulk invoice creation:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const generateInvoicePDF = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const invoice = await invoiceRepository.findOne({ 
      where: { id },
      relations: ['student', 'uniformItems']
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const student = await studentRepository.findOne({ 
      where: { id: invoice.studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    const pdfBuffer = await createInvoicePDF({
      invoice,
      student,
      settings
    });

    // Create filename with student's full name
    const firstName = (student.firstName || '').trim();
    const lastName = (student.lastName || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    
    // Sanitize filename: keep letters, numbers, spaces, and hyphens only
    let sanitizedName = fullName
      .replace(/[^a-zA-Z0-9\s\-]/g, '') // Remove special characters except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens for filename compatibility
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .trim();
    
    // If sanitization removed everything, use a fallback
    if (!sanitizedName || sanitizedName.length === 0) {
      sanitizedName = `Student-${student.studentNumber || 'Invoice'}`;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${sanitizedName}-${invoice.invoiceNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating invoice PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getOutstandingBalances = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    // Get all students
    const allStudents = await studentRepository.find({
      order: { studentNumber: 'ASC' }
    });

    // Get latest invoice for each student in a single query
    const outstandingBalances = [];

    for (const student of allStudents) {
      // Get the latest invoice for this student
      const latestInvoice = await invoiceRepository.findOne({
        where: { studentId: student.id },
        order: { createdAt: 'DESC' }
      });

      if (latestInvoice) {
        const balance = parseAmount(latestInvoice.balance);
        
        // Only include students with balance > 0
        if (balance > 0) {
          outstandingBalances.push({
            studentId: student.id,
            studentNumber: student.studentNumber,
            firstName: student.firstName,
            lastName: student.lastName,
            phoneNumber: student.phoneNumber || '',
            invoiceBalance: balance
          });
        }
      }
    }

    res.json(outstandingBalances);
  } catch (error: any) {
    console.error('Error fetching outstanding balances:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message || 'Unknown error' 
    });
  }
};

/**
 * Correct prepaid carry-forward by setting the remaining prepaid amount on a given invoice,
 * then recalculating subsequent invoices balances using the updated prepaid carry-forward.
 *
 * This is intended for cases where a user enters an amount wrongly and the system treats it as prepaid.
 * Strategy supported:
 * - carryOutOnly: only adjusts prepaidAmount on `fromInvoiceId`, keeps that invoice's balance as-is,
 *   then recalculates subsequent invoices assuming balances were affected only by prepaid carry-forward.
 */
export const correctPrepaidCarryForward = async (req: AuthRequest, res: Response) => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const {
      studentId: bodyStudentId,
      fromInvoiceId,
      correctedPrepaidAmount,
      strategy
    } = req.body as {
      studentId?: string;
      fromInvoiceId: string;
      correctedPrepaidAmount: number;
      strategy?: 'carryOutOnly';
    };

    if (!fromInvoiceId) {
      return res.status(400).json({ message: 'fromInvoiceId is required' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);

    const fromInvoice = await invoiceRepository.findOne({ where: { id: fromInvoiceId } });
    if (!fromInvoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const studentId = bodyStudentId || fromInvoice.studentId;
    if (!studentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const corrected = parseAmount(correctedPrepaidAmount);
    if (!Number.isFinite(corrected) || corrected < 0) {
      return res.status(400).json({ message: 'correctedPrepaidAmount must be a non-negative number' });
    }

    const invoices = await invoiceRepository.find({
      where: { studentId },
      order: { createdAt: 'ASC' }
    });

    const startIndex = invoices.findIndex(i => i.id === fromInvoiceId);
    if (startIndex === -1) {
      return res.status(404).json({ message: 'fromInvoiceId not found for student' });
    }

    // Only carryOutOnly is implemented for now.
    const effectiveStrategy: 'carryOutOnly' = strategy === 'carryOutOnly' || !strategy ? 'carryOutOnly' : 'carryOutOnly';

    if (effectiveStrategy !== 'carryOutOnly') {
      return res.status(400).json({ message: 'Only carryOutOnly strategy is supported currently' });
    }

    // Clone to avoid mutating repository objects unexpectedly in case of failures.
    const updatedInvoices = invoices.map(i => ({ ...i }));

    // Apply corrected prepaid on the selected invoice (keep its balance as-is).
    updatedInvoices[startIndex].prepaidAmount = corrected;

    // Recalculate subsequent invoices based on updated prepaid carry-forward.
    for (let i = startIndex + 1; i < updatedInvoices.length; i++) {
      const prev = updatedInvoices[i - 1];
      const inv = updatedInvoices[i];

      const prevBalance = parseAmount(prev.balance);
      const prepaidCarryIn = parseAmount(prev.prepaidAmount);

      const termAmount = parseAmount(inv.amount);
      const totalInvoiceAmount = prevBalance + termAmount;

      const appliedPrepaid = Math.min(prepaidCarryIn, totalInvoiceAmount);
      const remainingPrepaid = Math.max(0, prepaidCarryIn - appliedPrepaid);
      const finalBalance = totalInvoiceAmount - appliedPrepaid;

      inv.previousBalance = prevBalance;
      inv.paidAmount = appliedPrepaid;
      inv.prepaidAmount = remainingPrepaid;
      inv.balance = Math.max(0, finalBalance);
      inv.status =
        inv.balance <= 0
          ? InvoiceStatus.PAID
          : appliedPrepaid > 0
            ? InvoiceStatus.PARTIAL
            : InvoiceStatus.PENDING;
    }

    // Persist changes from startIndex onwards.
    const toSave = updatedInvoices.slice(startIndex);
    for (const inv of toSave) {
      await invoiceRepository.save(inv);
    }

    return res.json({
      message: 'Prepaid carry-forward corrected successfully',
      updated: toSave.map(i => ({
        invoiceId: i.id,
        invoiceNumber: i.invoiceNumber,
        dueDate: i.dueDate,
        prepaidAmount: i.prepaidAmount,
        paidAmount: i.paidAmount,
        balance: i.balance,
        status: i.status
      }))
    });
  } catch (error: any) {
    console.error('Error correcting prepaid carry-forward:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

export const getStudentBalance = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.query;
    
    if (!studentId) {
      return res.status(400).json({ message: 'Student ID or Student Number is required' });
    }

    // Ensure studentId is a string
    const studentIdString = typeof studentId === 'string' ? studentId : String(studentId);
    
    if (!studentIdString || studentIdString.trim() === '') {
      return res.status(400).json({ message: 'Student ID or Student Number is required' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    // Try to find student by ID (UUID) or by studentNumber
    // Check if it's a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let student;
    
    if (uuidRegex.test(studentIdString)) {
      // Search by ID (UUID)
      student = await studentRepository.findOne({
        where: { id: studentIdString },
        relations: ['classEntity']
      });
    } else {
      // Search by studentNumber
      student = await studentRepository.findOne({
        where: { studentNumber: studentIdString },
        relations: ['classEntity']
      });
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found. Please check the Student ID or Student Number.' });
    }

    // Get the latest invoice to get current balance (load uniform line items for accurate uniform subtotal)
    const lastInvoice = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' },
      relations: ['uniformItems']
    });

    let balance = parseAmount(lastInvoice?.balance);
    const lastInvoiceAmount = parseAmount(lastInvoice?.amount);
    const previousBalance = parseAmount(lastInvoice?.previousBalance);
    const paidAmount = parseAmount(lastInvoice?.paidAmount);
    const prepaidAmount = parseAmount(lastInvoice?.prepaidAmount);
    const uniformTotal = getUniformTotalForInvoice(lastInvoice);

    // If balance column is stuck at 0 but the invoice clearly owes only uniform (derived ≈ uniform subtotal), fix display.
    const derivedBalance = roundMoney(
      Math.max(0, previousBalance + lastInvoiceAmount - paidAmount)
    );
    if (
      balance <= 0.01 &&
      uniformTotal > 0.01 &&
      derivedBalance > 0.01 &&
      Math.abs(derivedBalance - uniformTotal) < 0.05
    ) {
      balance = derivedBalance;
    }

    res.json({
      studentId: student.id,
      studentNumber: student.studentNumber,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.lastName} ${student.firstName}`,
      balance: balance,
      prepaidAmount: prepaidAmount,
      uniformTotal,
      lastInvoiceId: lastInvoice?.id || null,
      lastInvoiceNumber: lastInvoice?.invoiceNumber || null,
      lastInvoiceTerm: lastInvoice?.term || null,
      lastInvoiceDate: lastInvoice?.createdAt || null,
      lastInvoiceAmount: lastInvoiceAmount,
      lastInvoicePreviousBalance: previousBalance,
      lastInvoicePaidAmount: paidAmount,
      lastInvoiceBalance: balance
    });
  } catch (error: any) {
    console.error('Error getting student balance:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

/**
 * Apply a credit note (tuition reduction) for a student who was overcharged.
 * Reduces the latest invoice balance by the credit amount.
 * If the student is already paid up (balance is 0), the full credit is carried forward as prepaid for the next term.
 * If credit exceeds current balance, the excess is carried forward as prepaid.
 */
export const applyCreditNote = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, creditAmount } = req.body;

    if (!studentId || creditAmount == null || creditAmount <= 0) {
      return res.status(400).json({
        message: 'Student ID and a positive credit amount are required.'
      });
    }

    const creditAmountNum = parseAmount(creditAmount);
    if (!Number.isFinite(creditAmountNum) || creditAmountNum <= 0) {
      return res.status(400).json({
        message: 'Credit amount must be a valid positive number.'
      });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    let student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (!student) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(studentId))) {
        student = await studentRepository.findOne({
          where: { studentNumber: String(studentId).trim() },
          relations: ['classEntity']
        });
      }
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const latestInvoice = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' },
      relations: ['student']
    });

    if (!latestInvoice) {
      return res.status(404).json({
        message: 'No invoice found for this student. Create an invoice first.'
      });
    }

    const currentBalance = parseAmount(latestInvoice.balance);
    const currentPrepaid = parseAmount(latestInvoice.prepaidAmount);

    const appliedToBalance = Math.min(creditAmountNum, currentBalance);
    const excessCredit = Math.max(0, creditAmountNum - currentBalance);

    latestInvoice.balance = Math.max(0, currentBalance - creditAmountNum);
    latestInvoice.prepaidAmount = currentPrepaid + excessCredit;

    if (latestInvoice.balance <= 0) {
      latestInvoice.status = InvoiceStatus.PAID;
    } else if (parseAmount(latestInvoice.paidAmount) > 0) {
      latestInvoice.status = InvoiceStatus.PARTIAL;
    }

    await invoiceRepository.save(latestInvoice);

    return res.json({
      message: 'Credit note applied successfully.',
      invoice: latestInvoice,
      appliedToBalance,
      carriedForwardAsPrepaid: excessCredit,
      newBalance: latestInvoice.balance,
      newPrepaidAmount: latestInvoice.prepaidAmount
    });
  } catch (error: any) {
    console.error('Error applying credit note:', error);
    return res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Apply a debit note (correction for undercharge) for a student.
 * Adds the debit amount to the latest invoice balance.
 */
export const applyDebitNote = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, debitAmount } = req.body;

    if (!studentId || debitAmount == null || debitAmount <= 0) {
      return res.status(400).json({
        message: 'Student ID and a positive debit amount are required.'
      });
    }

    const debitAmountNum = parseAmount(debitAmount);
    if (!Number.isFinite(debitAmountNum) || debitAmountNum <= 0) {
      return res.status(400).json({
        message: 'Debit amount must be a valid positive number.'
      });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);

    let student = await studentRepository.findOne({
      where: { id: studentId },
      relations: ['classEntity']
    });

    if (!student) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(studentId))) {
        student = await studentRepository.findOne({
          where: { studentNumber: String(studentId).trim() },
          relations: ['classEntity']
        });
      }
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const latestInvoice = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' },
      relations: ['student']
    });

    if (!latestInvoice) {
      return res.status(404).json({
        message: 'No invoice found for this student. Create an invoice first.'
      });
    }

    const currentBalance = parseAmount(latestInvoice.balance);
    const currentAmount = parseAmount(latestInvoice.amount);

    latestInvoice.balance = currentBalance + debitAmountNum;
    latestInvoice.amount = currentAmount + debitAmountNum;

    if (latestInvoice.balance <= 0) {
      latestInvoice.status = InvoiceStatus.PAID;
    } else if (parseAmount(latestInvoice.paidAmount) > 0) {
      latestInvoice.status = InvoiceStatus.PARTIAL;
    } else {
      latestInvoice.status = InvoiceStatus.PENDING;
    }

    if (new Date() > latestInvoice.dueDate && latestInvoice.balance > 0) {
      latestInvoice.status = InvoiceStatus.OVERDUE;
    }

    await invoiceRepository.save(latestInvoice);

    return res.json({
      message: 'Debit note applied successfully.',
      invoice: latestInvoice,
      newBalance: latestInvoice.balance
    });
  } catch (error: any) {
    console.error('Error applying debit note:', error);
    return res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

/**
 * Add uniform line items to the student's latest invoice.
 * Uniform is tracked separately (uniformTotal + invoice_uniform_items) and shown as its own subtotal on the invoice PDF.
 * billingMode: 'invoice' — amount is added to balance (bill later).
 * billingMode: 'cash' — uniform is added to the invoice for record-keeping and paid immediately (paidAmount increased, balance unchanged net).
 */
export const addUniformToInvoice = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, uniformItems, billingMode } = req.body as {
      studentId?: string;
      uniformItems?: Array<{ itemId?: string; uniformItemId?: string; quantity?: number }>;
      billingMode?: string;
    };

    if (!studentId) {
      return res.status(400).json({ message: 'Student ID is required.' });
    }

    if (!Array.isArray(uniformItems) || uniformItems.length === 0) {
      return res.status(400).json({ message: 'Select at least one uniform item with quantity.' });
    }

    const mode = String(billingMode || 'invoice').toLowerCase();
    if (mode !== 'invoice' && mode !== 'cash') {
      return res.status(400).json({ message: 'billingMode must be "invoice" or "cash".' });
    }

    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const uniformItemRepository = AppDataSource.getRepository(UniformItem);
    const invoiceUniformItemRepository = AppDataSource.getRepository(InvoiceUniformItem);

    let student = await studentRepository.findOne({ where: { id: studentId } });
    if (!student) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(String(studentId))) {
        student = await studentRepository.findOne({
          where: { studentNumber: String(studentId).trim() }
        });
      }
    }

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    const invoice = await invoiceRepository.findOne({
      where: { studentId: student.id },
      order: { createdAt: 'DESC' },
      relations: ['uniformItems', 'student']
    });

    if (!invoice) {
      return res.status(404).json({
        message: 'No invoice found for this student. Create an invoice first.'
      });
    }

    let addedTotal = 0;
    const newLines: InvoiceUniformItem[] = [];

    for (let index = 0; index < uniformItems.length; index++) {
      const payloadItem = uniformItems[index];
      const itemId = payloadItem?.itemId || payloadItem?.uniformItemId;
      const quantityRaw = payloadItem?.quantity;
      if (!itemId) {
        return res.status(400).json({ message: `Uniform item ID missing at index ${index}` });
      }
      const quantity = parseInt(String(quantityRaw), 10);
      if (isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ message: `Invalid quantity for uniform item at index ${index}` });
      }

      const uniformItem = await uniformItemRepository.findOne({ where: { id: itemId } });
      if (!uniformItem || !uniformItem.isActive) {
        return res.status(400).json({ message: `Uniform item not found or inactive (${itemId})` });
      }

      const unitPrice = parseAmount(uniformItem.unitPrice);
      const lineTotal = unitPrice * quantity;
      addedTotal += lineTotal;

      const line = invoiceUniformItemRepository.create({
        invoiceId: invoice.id,
        uniformItem,
        uniformItemId: uniformItem.id,
        itemName: uniformItem.name,
        unitPrice,
        quantity,
        lineTotal
      });
      newLines.push(line);
    }

    await invoiceUniformItemRepository.save(newLines);

    // Sum of saved line items is the uniform subtotal (fixes invoices.uniformTotal column stuck at 0)
    const invoiceWithLines = await invoiceRepository.findOne({
      where: { id: invoice.id },
      relations: ['uniformItems']
    });
    const totalUniformFromLines = getUniformTotalForInvoice(invoiceWithLines);
    const prevAmount = parseAmount(invoice.amount);
    const prevBalance = parseAmount(invoice.balance);
    const prevPaid = parseAmount(invoice.paidAmount);

    // Uniform increases invoice amount and uniform subtotal; billing mode decides balance vs paid.
    invoice.uniformTotal = totalUniformFromLines;
    invoice.amount = roundMoney(prevAmount + addedTotal);

    if (mode === 'invoice') {
      // Bill later: outstanding balance increases by the uniform total (same rule as debit note).
      invoice.balance = roundMoney(prevBalance + addedTotal);
    } else {
      // Cash: record uniform as paid now — amount and paidAmount both increase; net balance unchanged.
      invoice.paidAmount = roundMoney(prevPaid + addedTotal);
      invoice.balance = roundMoney(Math.max(0, prevBalance));
    }

    if (invoice.balance <= 0) {
      invoice.status = InvoiceStatus.PAID;
    } else if (parseAmount(invoice.paidAmount) > 0) {
      invoice.status = InvoiceStatus.PARTIAL;
    } else {
      invoice.status = InvoiceStatus.PENDING;
    }

    if (new Date() > invoice.dueDate && invoice.balance > 0) {
      invoice.status = InvoiceStatus.OVERDUE;
    }

    // Do not save the full `invoice` entity (eager uniformItems can corrupt child rows).
    // Persist only changed scalars — avoids touching invoice_uniform_items.
    await invoiceRepository.save({
      id: invoice.id,
      uniformTotal: invoice.uniformTotal,
      amount: invoice.amount,
      balance: invoice.balance,
      paidAmount: invoice.paidAmount,
      status: invoice.status
    } as Invoice);

    const withRelations = await invoiceRepository.findOne({
      where: { id: invoice.id },
      relations: ['uniformItems', 'student']
    });

    const inv = withRelations ?? invoice;
    const balanceOut = roundMoney(parseAmount(inv.balance));
    const uniformOut = getUniformTotalForInvoice(inv);
    const amountOut = roundMoney(parseAmount(inv.amount));

    return res.json({
      message:
        mode === 'cash'
          ? 'Uniform items added and recorded as cash paid on the invoice.'
          : 'Uniform items added and billed on the student invoice.',
      invoice: withRelations ?? invoice,
      addedTotal: roundMoney(addedTotal),
      billingMode: mode,
      newBalance: balanceOut,
      newUniformTotal: uniformOut,
      newAmount: amountOut
    });
  } catch (error: any) {
    console.error('Error adding uniform to invoice:', error);
    return res.status(500).json({
      message: 'Server error',
      error: error.message || 'Unknown error'
    });
  }
};

export const generateReceiptPDF = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentAmount, paymentDate } = req.query;
    const invoiceRepository = AppDataSource.getRepository(Invoice);
    const studentRepository = AppDataSource.getRepository(Student);
    const settingsRepository = AppDataSource.getRepository(Settings);

    const invoice = await invoiceRepository.findOne({ 
      where: { id },
      relations: ['student']
    });

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    const student = await studentRepository.findOne({ 
      where: { id: invoice.studentId },
      relations: ['classEntity']
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const settingsList = await settingsRepository.find({
      order: { createdAt: 'DESC' },
      take: 1
    });
    const settings = settingsList.length > 0 ? settingsList[0] : null;

    // Generate receipt number
    const receiptNumber = `RCP-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;

    const pdfBuffer = await createReceiptPDF({
      invoice,
      student,
      settings,
      paymentAmount: paymentAmount ? parseAmount(paymentAmount) : parseAmount(invoice.paidAmount),
      paymentDate: paymentDate ? new Date(paymentDate as string) : new Date(),
      receiptNumber
    });

    const sanitizedName = `${student.lastName || 'student'}-${student.firstName || ''}`
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9\-]/g, '')
      .toLowerCase();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=${sanitizedName ? sanitizedName : 'receipt'}-${receiptNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Error generating receipt PDF:', error);
    res.status(500).json({ message: 'Server error', error: error.message || 'Unknown error' });
  }
};

