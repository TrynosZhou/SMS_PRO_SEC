import PDFDocument from 'pdfkit';
import sizeOf from 'image-size';
import * as fs from 'fs';
import * as path from 'path';
import { Settings } from '../entities/Settings';

type PDFDoc = InstanceType<typeof PDFDocument>;

/** Load School Logo 1 / 2 from settings (data URL, file path, or raw base64). */
function loadLogoBufferFromSettings(logo: string | null | undefined): Buffer | null {
  if (!logo || typeof logo !== 'string') return null;
  const trimmed = logo.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('data:image')) {
      const idx = trimmed.indexOf('base64,');
      const base64Data = idx >= 0 ? trimmed.slice(idx + 7) : trimmed.split(',')[1];
      return base64Data ? Buffer.from(base64Data, 'base64') : null;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return null;
    }
    const normalizedPath = trimmed.replace(/^\//, '');
    const absolutePath = path.join(__dirname, '../../', normalizedPath);
    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath);
    }
    if (trimmed.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(trimmed.replace(/\s/g, ''))) {
      return Buffer.from(trimmed.replace(/\s/g, ''), 'base64');
    }
  } catch (e) {
    console.error('loadLogoBufferFromSettings:', e);
  }
  return null;
}

/**
 * Draw image inside a box using "contain" scaling (preserve aspect ratio, no stretch).
 * Wide letterhead banners stay sharp; empty margins use the background already drawn.
 */
function addContainImage(
  doc: PDFDoc,
  imageBuffer: Buffer,
  x: number,
  y: number,
  maxW: number,
  maxH: number
): void {
  const dimensions = sizeOf(imageBuffer);
  const iw = dimensions.width || maxW;
  const ih = dimensions.height || maxH;
  const scale = Math.min(maxW / iw, maxH / ih);
  const finalW = iw * scale;
  const finalH = ih * scale;
  const drawX = x + (maxW - finalW) / 2;
  const drawY = y + (maxH - finalH) / 2;
  doc.image(imageBuffer, drawX, drawY, { width: finalW, height: finalH });
}

interface ReportCardData {
  student: {
    id: string;
    name: string;
    studentNumber: string;
    class: string;
  };
  exam?: {
    name: string;
    type: string;
    examDate: Date;
  };
  examType?: string;
  exams?: Array<{
    id: string;
    name: string;
    examDate: Date;
  }>;
  subjects: Array<{
    subject: string;
    subjectCode?: string;
    score: number;
    maxScore: number;
    percentage: string;
    classAverage?: number;
    grade?: string;
    comments?: string;
    points?: number;
  }>;
  overallAverage: string;
  overallGrade?: string;
  classPosition: number;
  formPosition?: number;
  totalStudents?: number;
  totalStudentsPerStream?: number;
  totalAttendance?: number;
  presentAttendance?: number;
  totalPoints?: number;
  isUpperForm?: boolean;
  remarks?: {
    classTeacherRemarks?: string | null;
    headmasterRemarks?: string | null;
  };
  generatedAt: Date;
}

export function createReportCardPDF(
  reportCard: ReportCardData,
  settings: Settings | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);

      // Add strong black border around the entire page
      const pageWidth = doc.page.width;
      const initialPageHeight = doc.page.height;
      const borderWidth = 5; // Strong border
      const borderColor = '#000000'; // Black
      
      // Top border
      doc.rect(0, 0, pageWidth, borderWidth)
        .fillColor(borderColor)
        .fill();
      // Bottom border
      doc.rect(0, initialPageHeight - borderWidth, pageWidth, borderWidth)
        .fillColor(borderColor)
        .fill();
      // Left border
      doc.rect(0, 0, borderWidth, initialPageHeight)
        .fillColor(borderColor)
        .fill();
      // Right border
      doc.rect(pageWidth - borderWidth, 0, borderWidth, initialPageHeight)
        .fillColor(borderColor)
        .fill();

      // School Header — full-width banner with School Logo 1 only (no second logo), then name/address
      const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';
      const academicYear = settings?.academicYear || new Date().getFullYear().toString();

      console.log('PDF Generator - Settings:', {
        hasSettings: !!settings,
        schoolName,
        schoolAddress: schoolAddress || 'EMPTY',
        academicYear,
        hasLogo1: !!settings?.schoolLogo
      });

      const innerLeft = borderWidth;
      const innerWidth = pageWidth - 2 * borderWidth;
      const bannerTop = borderWidth;
      /** Max height for banner strip — wide letterheads scale to fit inside without stretching */
      const bannerHeight = 115;

      const logo1Buffer = loadLogoBufferFromSettings(settings?.schoolLogo ?? null);
      doc.rect(innerLeft, bannerTop, innerWidth, bannerHeight).fillColor('#f1f5f9').fill();
      if (logo1Buffer) {
        try {
          addContainImage(doc, logo1Buffer, innerLeft, bannerTop, innerWidth, bannerHeight);
        } catch (error) {
          console.error('Could not draw school banner image:', error);
        }
      } else if (settings?.schoolLogo) {
        console.warn('School Logo 1 present but could not be decoded for PDF (check format or URL support)');
      }

      const schoolNameFontSize = 16;
      const textBaselineY = bannerTop + bannerHeight + 25;
      const textStartX = 50;
      const textEndX = pageWidth - 50;

      // School Name and Address
      doc.fontSize(schoolNameFontSize).font('Helvetica-Bold').text(schoolName, textStartX, textBaselineY);
      
      // Calculate positions for address and academic year (below school name baseline)
      let currentY = textBaselineY + 20;

      const maxTextWidth = textEndX - textStartX;
      const textWidth = Math.min(400, maxTextWidth); // Use smaller of 400 or available space
      
      // Always display school address if it exists
      if (schoolAddress && schoolAddress.trim()) {
        doc.fontSize(10).font('Helvetica').text(schoolAddress.trim(), textStartX, currentY, { 
          width: textWidth,
          align: 'left'
        });
        // Move down for phone (account for multi-line address)
        const addressHeight = doc.heightOfString(schoolAddress.trim(), { width: textWidth });
        currentY += addressHeight + 10;
      } else {
        currentY = textBaselineY + 20;
      }
      
      // Display school phone if it exists
      if (schoolPhone && schoolPhone.trim()) {
        doc.fontSize(10).font('Helvetica').text(`Phone: ${schoolPhone.trim()}`, textStartX, currentY, {
          width: textWidth,
          align: 'left'
        });
        // Move down for academic year (account for multi-line phone)
        const phoneHeight = doc.heightOfString(`Phone: ${schoolPhone.trim()}`, { width: textWidth });
        currentY += phoneHeight + 10;
      } else {
        // If no phone, add spacing before academic year
        currentY += 5;
      }
      
      // Display academic year
      doc.fontSize(10).text(`Academic Year: ${academicYear}`, textStartX, currentY);
      currentY += 15; // Add spacing after academic year

      // Title - adjust position based on logo size and header content with styled background
      // Ensure title is below all header content (logo, name, address, phone, academic year)
      const titleY = Math.max(currentY + 20, textBaselineY + 24);
      const titleBoxHeight = 35; // Increased to accommodate multiple lines
      
      // Title background box - Blue color
      doc.rect(50, titleY - 10, 500, titleBoxHeight)
        .fillColor('#4A90E2') // Standard blue
        .fill()
        .strokeColor('#357ABD') // Slightly darker blue for border
        .lineWidth(2)
        .stroke();
      
      // Get exam type and academic year for the title bar
      const examTypeText = reportCard.examType || reportCard.exam?.type || '';
      const titleText = `REPORT CARD${examTypeText ? ` - ${examTypeText.toUpperCase()}` : ''}`;
      
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#FFFFFF'); // Reduced from 16 to 14
      doc.text(titleText, 50, titleY, { align: 'center', width: 500 });
      
      // Add academic year below REPORT CARD
      if (academicYear) {
        doc.fontSize(9).font('Helvetica').fillColor('#FFFFFF'); // Reduced from 11 to 9
        doc.text(`Academic Year: ${academicYear}`, 50, titleY + 16, { align: 'center', width: 500 }); // Adjusted position
      }

      // Student Information - adjust position based on title with styled boxes (reduced spacing)
      const infoStartY = titleY + titleBoxHeight + 10; // Reduced spacing to fit more content
      
      // Student Information box
      doc.rect(50, infoStartY, 240, 80)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#DEE2E6')
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Student Information:', 60, infoStartY + 10);
      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      doc.text(`Name: ${reportCard.student.name}`, 60, infoStartY + 30);
      doc.text(`Student Number: ${reportCard.student.studentNumber}`, 60, infoStartY + 50);
      doc.text(`Class: ${reportCard.student.class}`, 60, infoStartY + 70);

      // Exam Information box - increased height to fit Class Position and Grade Position
      doc.rect(300, infoStartY, 250, 100)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#DEE2E6')
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Exam Information:', 310, infoStartY + 10);
      doc.fontSize(9).font('Helvetica').fillColor('#000000');
      let examInfoY = infoStartY + 25;
      
      if (reportCard.exam) {
        doc.text(`Exam: ${reportCard.exam.name}`, 310, examInfoY);
        examInfoY += 15;
        doc.text(`Type: ${reportCard.exam.type}`, 310, examInfoY);
        examInfoY += 15;
        doc.text(`Date: ${new Date(reportCard.exam.examDate).toLocaleDateString()}`, 310, examInfoY);
        examInfoY += 15;
      } else if (reportCard.exams && reportCard.exams.length > 0) {
        // Remove duplicate exam names before displaying
        const uniqueExamNames = Array.from(new Set(reportCard.exams.map((e: any) => e.name)));
        doc.text(`Exams: ${uniqueExamNames.join(', ')}`, 310, examInfoY);
        examInfoY += 15;
      }
      
      // Add Class Position and Grade Position
      const totalStudents = reportCard.totalStudents || 0;
      const classPosText = totalStudents > 0 
        ? `Class Position: ${reportCard.classPosition} out of ${totalStudents}`
        : `Class Position: ${reportCard.classPosition}`;
      doc.text(classPosText, 310, examInfoY);
      examInfoY += 15;
      
      if (reportCard.formPosition && reportCard.formPosition > 0) {
        const totalStudentsPerStream = reportCard.totalStudentsPerStream || 0;
        const gradePosText = totalStudentsPerStream > 0
          ? `Grade Position: ${reportCard.formPosition} out of ${totalStudentsPerStream}`
          : `Grade Position: ${reportCard.formPosition}`;
        doc.text(gradePosText, 310, examInfoY);
        examInfoY += 15;
      }
      
      // Add Total Attendance
      if (reportCard.totalAttendance !== undefined && reportCard.totalAttendance !== null) {
        const attendanceText = `Total Attendance: ${reportCard.totalAttendance} day${reportCard.totalAttendance !== 1 ? 's' : ''}`;
        if (reportCard.presentAttendance !== undefined && reportCard.presentAttendance !== null) {
          doc.text(`${attendanceText} (Present: ${reportCard.presentAttendance})`, 310, examInfoY);
        } else {
          doc.text(attendanceText, 310, examInfoY);
        }
        examInfoY += 15;
      }

      // Grade Thresholds
      const thresholds = settings?.gradeThresholds || {
        excellent: 90,
        veryGood: 80,
        good: 60,
        satisfactory: 40,
        needsImprovement: 20,
        basic: 1
      };

      const gradeLabels = settings?.gradeLabels || {
        excellent: 'OUTSTANDING',
        veryGood: 'VERY HIGH',
        good: 'HIGH',
        satisfactory: 'GOOD',
        needsImprovement: 'ASPIRING',
        basic: 'BASIC',
        fail: 'UNCLASSIFIED'
      };

      function getGrade(percentage: number): string {
        if (percentage === 0) return gradeLabels.fail || 'UNCLASSIFIED';
        if (percentage >= (thresholds.veryGood || 80)) return gradeLabels.veryGood || 'VERY HIGH';
        if (percentage >= (thresholds.good || 60)) return gradeLabels.good || 'HIGH';
        if (percentage >= (thresholds.satisfactory || 40)) return gradeLabels.satisfactory || 'GOOD';
        if (percentage >= (thresholds.needsImprovement || 20)) return gradeLabels.needsImprovement || 'ASPIRING';
        if (percentage >= (thresholds.basic || 1)) return gradeLabels.basic || 'BASIC';
        return gradeLabels.fail || 'UNCLASSIFIED';
      }

      // Subjects Table - adjust position based on info section (reduced spacing for one page)
      let yPos = infoStartY + 100;
      doc.fontSize(10).font('Helvetica-Bold').text('Subject Performance:', 50, yPos);
      yPos += 16;

      const tableStartX = 50;
      const tableEndX = 545;
      const headerRowHeight = 18;
      const baseRowHeight = 18;
      const rowExtraPadding = 8; // Prevents wrapped text from touching next row
      const showPointsColumn = !!reportCard.isUpperForm;

      type ColumnDef = { key: string; label: string; width: number; align?: 'left' | 'center' | 'right' };
      const columnDefs: ColumnDef[] = [
        { key: 'subject', label: 'Subject', width: 90, align: 'left' },
        { key: 'subjectCode', label: 'Subject Code', width: 60, align: 'center' },
        { key: 'markObtained', label: 'Mark Obtained', width: 80, align: 'center' },
        { key: 'classAverage', label: 'Class Avg', width: 60, align: 'center' },
        { key: 'grade', label: 'Grade', width: showPointsColumn ? 70 : 80, align: 'center' }
      ];

      if (showPointsColumn) {
        columnDefs.push({ key: 'points', label: 'Points', width: 55, align: 'center' });
      }

      columnDefs.push({
        key: 'comments',
        label: 'Comments',
        width: showPointsColumn ? 200 : 240,
        align: 'left'
      });

      const availableWidth = tableEndX - tableStartX;
      const currentWidth = columnDefs.reduce((sum, col) => sum + col.width, 0);
      if (currentWidth > availableWidth) {
        const overflow = currentWidth - availableWidth;
        const commentsCol = columnDefs.find(col => col.key === 'comments');
        if (commentsCol) {
          commentsCol.width = Math.max(120, commentsCol.width - overflow);
        }
      }

      const colPositions: Record<string, number> = {};
      const colBoundaries: number[] = [tableStartX];
      let runningX = tableStartX;
      columnDefs.forEach(col => {
        colPositions[col.key] = runningX + 5;
        runningX += col.width;
        colBoundaries.push(runningX);
      });

      const headerY = yPos;
      doc.rect(tableStartX, headerY, tableEndX - tableStartX, headerRowHeight)
        .fillColor('#4A90E2')
        .fill()
        .fillColor('#FFFFFF')
        .strokeColor('#000000')
        .lineWidth(1);

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      columnDefs.forEach(col => {
        doc.text(col.label, colPositions[col.key], headerY + 8, { width: col.width - 10, align: col.align || 'left' });
      });

      doc.strokeColor('#000000').lineWidth(1);
      doc.moveTo(tableStartX, headerY).lineTo(tableEndX, headerY).stroke();
      doc.moveTo(tableStartX, headerY + headerRowHeight).lineTo(tableEndX, headerY + headerRowHeight).stroke();
      colBoundaries.forEach((boundary, index) => {
        if (index > 0 && index < colBoundaries.length) {
          doc.moveTo(boundary, headerY).lineTo(boundary, headerY + headerRowHeight).stroke();
        }
      });

      yPos = headerY + headerRowHeight;

      doc.fontSize(10).font('Helvetica').fillColor('#000000');
      const sanitizeNumber = (value: any): number | null => {
        if (value === null || value === undefined) {
          return null;
        }
        const cleaned = typeof value === 'string' ? value.replace(/[^\d.-]/g, '') : value;
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const getSubjectValue = (subject: any) => {
        const subjectName = subject?.subject || subject?.subjectName || subject?.name || subject?.title || 'N/A';
        const subjectCode = subject?.subjectCode || subject?.code || subject?.subject_code || '-';
        const scoreValue = sanitizeNumber(subject?.score ?? subject?.markObtained ?? subject?.marks);
        const maxScoreValue = sanitizeNumber(subject?.maxScore ?? subject?.possibleMark ?? subject?.totalMarks ?? subject?.outOf);
        const classAverageValue = sanitizeNumber(subject?.classAverage ?? subject?.classAvg ?? subject?.average);
        const percentageValue = sanitizeNumber(subject?.percentage ?? subject?.percent ?? subject?.scorePercentage) ?? 0;
        const gradeValue = subject?.grade || subject?.gradeLabel || (subject?.gradeInfo?.label) || 'N/A';
        const commentsValue = subject?.comments || subject?.comment || '-';
        const pointsValueRaw = sanitizeNumber(subject?.points ?? subject?.scorePoints ?? subject?.pointValue);
        return {
          subjectName,
          subjectCode,
          scoreValue,
          maxScoreValue,
          classAverageValue,
          percentageValue,
          gradeValue,
          commentsValue,
          pointsValue: pointsValueRaw
        };
      };

      for (let index = 0; index < reportCard.subjects.length; index++) {
        const subject = reportCard.subjects[index];
        const normalizedSubject = getSubjectValue(subject);
        const rowY = yPos;
        const isEvenRow = index % 2 === 0;

        const percentage = normalizedSubject.percentageValue ?? 0;
        const grade = normalizedSubject.gradeValue || (subject.grade === 'N/A' ? 'N/A' : getGrade(percentage));
        const hasMarks = normalizedSubject.scoreValue !== null && grade !== 'N/A';
        const scoreText = hasMarks ? Math.round(normalizedSubject.scoreValue!).toString() : 'N/A';
        const commentsText = normalizedSubject.commentsValue || '-';
        const classAverageText = normalizedSubject.classAverageValue !== null
          ? `${Math.round(normalizedSubject.classAverageValue)}`
          : 'N/A';
        const pointsText = grade === 'N/A'
          ? '-'
          : (normalizedSubject.pointsValue !== null ? Math.round(normalizedSubject.pointsValue).toString() : (subject.points ?? 0).toString());

        // Build cell texts once, then compute wrapped text height for a safe row height.
        const cellTexts: Record<string, string> = {};
        const cellFontSizes: Record<string, number> = {};

        // Default fonts for height calculations
        doc.font('Helvetica');
        doc.fontSize(10);

        columnDefs.forEach(col => {
          switch (col.key) {
            case 'subject':
              cellTexts[col.key] = normalizedSubject.subjectName || '-';
              break;
            case 'subjectCode':
              cellTexts[col.key] = normalizedSubject.subjectCode || '-';
              break;
            case 'markObtained':
              cellTexts[col.key] = scoreText;
              break;
            case 'classAverage':
              cellTexts[col.key] = classAverageText;
              break;
            case 'grade': {
              cellTexts[col.key] = grade;
              const gradeWidth = col.width - 8;
              const gradeTextWidth = doc.widthOfString(grade);
              cellFontSizes[col.key] = gradeTextWidth > gradeWidth ? 8 : 10;
              break;
            }
            case 'points':
              cellTexts[col.key] = pointsText;
              break;
            case 'comments':
              cellTexts[col.key] = commentsText;
              break;
            default:
              cellTexts[col.key] = '';
          }
        });

        let maxTextHeight = 0;
        columnDefs.forEach(col => {
          const text = cellTexts[col.key] ?? '';
          const align = col.align || 'left';
          const cellWidth = col.width - 10;
          const fontSize = cellFontSizes[col.key] ?? 10;
          doc.font('Helvetica').fontSize(fontSize);
          const h = doc.heightOfString(text, { width: cellWidth, align });
          if (h > maxTextHeight) maxTextHeight = h;
        });

        const rowHeightForRow = Math.max(baseRowHeight, Math.ceil(maxTextHeight + rowExtraPadding));

        // Row background + grid lines
        doc.rect(tableStartX, rowY, tableEndX - tableStartX, rowHeightForRow)
          .fillColor(isEvenRow ? '#F8F9FA' : '#FFFFFF')
          .fill();

        doc.strokeColor('#CCCCCC').lineWidth(0.5);
        doc.moveTo(tableStartX, rowY).lineTo(tableEndX, rowY).stroke();
        doc.moveTo(tableStartX, rowY + rowHeightForRow).lineTo(tableEndX, rowY + rowHeightForRow).stroke();
        colBoundaries.forEach((boundary, boundaryIndex) => {
          if (boundaryIndex > 0 && boundaryIndex < colBoundaries.length) {
            doc.moveTo(boundary, rowY).lineTo(boundary, rowY + rowHeightForRow).stroke();
          }
        });

        // Render cell texts
        columnDefs.forEach(col => {
          const text = cellTexts[col.key] ?? '';
          const align = col.align || 'left';
          const fontSize = cellFontSizes[col.key] ?? 10;

          if (col.key === 'grade') {
            doc.fillColor(grade === 'N/A' ? '#6C757D' : '#000000');
          } else {
            doc.fillColor('#000000');
          }

          doc.font('Helvetica').fontSize(fontSize);
          doc.text(text, colPositions[col.key], rowY + 6, { width: col.width - 10, align });
          doc.fontSize(10).fillColor('#000000');
        });

        yPos += rowHeightForRow;

        const maxTableY = 527;
        if (yPos > maxTableY) {
          break;
        }
      }

      // Summary Section with styled box (reduced spacing for one page)
      yPos += 10;
      const summaryBoxY = yPos;
      const summaryBoxHeight = 50; // Slightly increased to prevent overlapping
      
      // Summary box background
      doc.rect(50, summaryBoxY, 500, summaryBoxHeight)
        .fillColor('#E8F4F8')
        .fill()
        .strokeColor('#4A90E2')
        .lineWidth(2)
        .stroke();
      
      // Summary title
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#2C3E50');
      doc.text('Summary', 60, summaryBoxY + 8);
      
      // Summary content - improved spacing to prevent overlapping
      yPos = summaryBoxY + 22;
      doc.fontSize(9).font('Helvetica').fillColor('#003366'); // Dark blue
      const overallPercentage = parseFloat(reportCard.overallAverage);
      const overallGrade = reportCard.overallGrade || getGrade(overallPercentage);
      const totalPointsValue = Number.isFinite(reportCard.totalPoints)
        ? Number(reportCard.totalPoints)
        : 0;
      const isUpperForm = !!reportCard.isUpperForm;
      
      // Overall Average with colored background - positioned on the left
      const averageBoxX = 60;
      const averageBoxWidth = 220; // Increased width for better spacing and content
      doc.rect(averageBoxX, yPos - 5, averageBoxWidth, 20)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();
      // Label in dark blue, value in different color
      doc.fillColor('#003366'); // Dark blue for label
      doc.text('Overall Average: ', averageBoxX + 5, yPos);
      // Calculate label width - widthOfString uses current font settings
      const labelWidth = doc.widthOfString('Overall Average: ');
      doc.fillColor('#1a237e'); // Darker blue for the value
      doc.text(`${Math.round(overallPercentage)}%`, averageBoxX + 5 + labelWidth, yPos);
      
      // Overall Grade - positioned on the right with proper spacing (20pt gap)
      const gradeBoxX = averageBoxX + averageBoxWidth + 20; // 20pt gap between boxes
      const gradeBoxWidth = 200; // Width for grade box
      doc.rect(gradeBoxX, yPos - 5, gradeBoxWidth, 20)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();
      const secondaryLabel = isUpperForm ? 'Total Points: ' : 'Overall Grade: ';
      const secondaryValue = isUpperForm ? `${Math.round(totalPointsValue)}` : overallGrade;
      doc.fillColor('#003366'); // Dark blue for label
      doc.text(secondaryLabel, gradeBoxX + 5, yPos);
      const secondaryLabelWidth = doc.widthOfString(secondaryLabel);
      doc.fillColor('#000000'); // Black for the value
      doc.text(secondaryValue, gradeBoxX + 5 + secondaryLabelWidth, yPos);
      
      // Class Position removed from Summary - now in Exam Information section

      // Remarks Section - Always display both sections (proper spacing to prevent overlap)
      yPos += 12; // Increased spacing between Summary and Remarks
      
      // Calculate dynamic height for remarks section
      const classTeacherRemarks = reportCard.remarks?.classTeacherRemarks || 'No remarks provided.';
      const headmasterRemarks = reportCard.remarks?.headmasterRemarks || 'No remarks provided.';
      
      // Get headmaster name from settings for height calculation
      const headmasterName = settings?.headmasterName || '';
      const signatureHeight = headmasterName ? 12 : 0;
      
      // Limit remarks height to fit on one page (more compact)
      const maxRemarksTextHeight = 22; // Maximum height for each remarks box (reduced)
      const teacherRemarksTextHeight = doc.heightOfString(classTeacherRemarks, { width: 480 });
      const headmasterRemarksTextHeight = doc.heightOfString(headmasterRemarks, { width: 480 });
      
      const teacherRemarksHeight = Math.min(maxRemarksTextHeight, Math.max(22, teacherRemarksTextHeight + 4));
      const headmasterRemarksHeight = Math.min(maxRemarksTextHeight, Math.max(22, headmasterRemarksTextHeight + 4)) + signatureHeight;
      
      // Calculate total remarks section height (proper spacing to prevent overlapping)
      const remarksTitleHeight = 24;
      const remarksBoxHeight = remarksTitleHeight + 18 + teacherRemarksHeight + 18 + headmasterRemarksHeight + 15;
      
      // Remarks title with styled box - full blue background
      const remarksBoxY = yPos;
      
      doc.rect(50, remarksBoxY, 500, remarksBoxHeight)
        .fillColor('#4A90E2') // Medium blue background
        .fill()
        .strokeColor('#003366') // Dark blue border
        .lineWidth(2)
        .stroke();
      
      // Main "Remarks" title - larger and more prominent
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('Remarks', 60, remarksBoxY + 8);
      yPos = remarksBoxY + 28; // Increased spacing after title
      
      // Class Teacher Remarks - Always display
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF'); // Bold white text for label
      doc.text('Class Teacher Remarks:', 60, yPos);
      yPos += 15; // Increased spacing before box
      
      // White rectangular box for Class Teacher Remarks
      doc.rect(60, yPos - 3, 480, teacherRemarksHeight)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(8).font('Helvetica').fillColor('#000000'); // Black text for remarks content
      // Truncate text if needed to fit in box
      const teacherRemarksToShow = teacherRemarksTextHeight > maxRemarksTextHeight 
        ? classTeacherRemarks.substring(0, Math.floor(classTeacherRemarks.length * 0.8)) + '...'
        : classTeacherRemarks;
      doc.text(teacherRemarksToShow, 65, yPos, { width: 480 });
      yPos += teacherRemarksHeight + 12; // Increased spacing after teacher remarks

      // Headmaster/Principal Remarks - Always display
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF'); // Bold white text for label
      doc.text('Headmaster/Principal Remarks:', 60, yPos);
      yPos += 15; // Increased spacing before box
      
      // Calculate height needed for remarks + signature
      // headmasterName and signatureHeight are already declared above
      const totalHeadmasterBoxHeight = headmasterRemarksHeight;
      
      // White rectangular box for Headmaster/Principal Remarks (extended to include signature)
      doc.rect(60, yPos - 3, 480, totalHeadmasterBoxHeight)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#CCCCCC')
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(8).font('Helvetica').fillColor('#000000'); // Black text for remarks content
      // Calculate available height for remarks (excluding signature space)
      const remarksOnlyHeight = headmasterRemarksHeight - signatureHeight;
      const availableRemarksHeight = Math.min(maxRemarksTextHeight, Math.max(22, headmasterRemarksTextHeight + 4));
      const headmasterRemarksToShow = headmasterRemarksTextHeight > availableRemarksHeight 
        ? headmasterRemarks.substring(0, Math.floor(headmasterRemarks.length * 0.8)) + '...'
        : headmasterRemarks;
      doc.text(headmasterRemarksToShow, 65, yPos, { width: 480 });
      
      // Add headmaster name as signature after remarks
      if (headmasterName) {
        const signatureY = yPos + remarksOnlyHeight - 2; // Position signature at bottom of remarks text area
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#000000'); // Bold black for signature
        // Position signature with left padding (move left by approximately 3 spaces)
        // Calculate right-aligned position then subtract space for 3 characters
        const signatureWidth = doc.widthOfString(headmasterName);
        const rightAlignedX = 65 + 480 - signatureWidth; // Right-aligned position
        const leftOffset = doc.widthOfString('   '); // Width of 3 spaces
        const signatureX = Math.max(65, rightAlignedX - leftOffset); // Move left by 3 spaces, but don't go past left margin
        doc.text(headmasterName, signatureX, signatureY, { width: 480 - (signatureX - 65) }); // Left-aligned from adjusted position
      }
      
      yPos += totalHeadmasterBoxHeight + 10; // Increased spacing after headmaster remarks

      // Grade Scale Footer Section
      yPos += 20; // Add spacing after remarks
      
      // Get page height for calculations
      const pageHeight = doc.page.height;
      
      // Check if we need a new page for grade scale
      const gradeScaleHeight = 120; // Estimated height for grade scale section
      if (yPos + gradeScaleHeight > pageHeight - 50) {
        doc.addPage();
        yPos = 50;
      }

      // Grade Scale Title
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#003366');
      doc.text('Grade Scale / Attainment Levels', 50, yPos, { align: 'center', width: 500 });
      yPos += 15;

      // Grade Scale Box
      const gradeScaleBoxY = yPos;
      const gradeScaleBoxHeight = 80;
      doc.rect(50, gradeScaleBoxY, 500, gradeScaleBoxHeight)
        .fillColor('#F8F9FA')
        .fill()
        .strokeColor('#DEE2E6')
        .lineWidth(1)
        .stroke();

      // Grade Scale Items derived from settings
      type ThresholdEntry = { key: string; min: number; label: string };
      const thresholdEntries: ThresholdEntry[] = [
        { key: 'veryGood', min: thresholds.veryGood ?? 80, label: gradeLabels.veryGood || 'VERY HIGH' },
        { key: 'good', min: thresholds.good ?? 60, label: gradeLabels.good || 'HIGH' },
        { key: 'satisfactory', min: thresholds.satisfactory ?? 40, label: gradeLabels.satisfactory || 'GOOD' },
        { key: 'needsImprovement', min: thresholds.needsImprovement ?? 20, label: gradeLabels.needsImprovement || 'ASPIRING' },
        { key: 'basic', min: thresholds.basic ?? 1, label: gradeLabels.basic || 'BASIC' }
      ].filter(entry => Number.isFinite(entry.min));
      thresholdEntries.sort((a, b) => b.min - a.min);

      const gradeItems = thresholdEntries.map((entry, index) => {
        const upperBound = index === 0 ? 100 : Math.max(thresholdEntries[index - 1].min - 1, entry.min);
        const rangeText = entry.min >= upperBound ? `${entry.min}+` : `${entry.min} – ${upperBound}`;
        return { range: rangeText, label: entry.label };
      });
      const lowestMin = thresholdEntries[thresholdEntries.length - 1]?.min ?? 1;
      const failUpperBound = Math.max(lowestMin - 1, 0);
      gradeItems.push({
        range: failUpperBound > 0 ? `0 – ${failUpperBound}` : '0',
        label: gradeLabels.fail || 'UNCLASSIFIED'
      });

      // Calculate grid positions dynamically (up to 3 columns)
      const columns = Math.min(3, gradeItems.length);
      const rows = Math.ceil(gradeItems.length / columns);
      const itemWidth = 150;
      const startX = 60;
      const startY = gradeScaleBoxY + 10;
      const rowGap = 35;
      const colGap = 20;

      gradeItems.forEach((item, index) => {
        const row = Math.floor(index / columns);
        const col = index % columns;
        const xPos = startX + col * (itemWidth + colGap);
        const yPosItem = startY + row * rowGap;

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#003366');
        doc.text(item.range, xPos, yPosItem, { width: itemWidth, align: 'center' });

        doc.fontSize(8).font('Helvetica').fillColor('#495057');
        doc.text(item.label, xPos, yPosItem + 14, { width: itemWidth, align: 'center' });
      });

      // Footer - Position at bottom of page
      const footerY = pageHeight - 25; // Position footer 25pt from bottom
      doc.fontSize(7).font('Helvetica').fillColor('#000000').text(
        `Generated on: ${new Date(reportCard.generatedAt).toLocaleString()}`,
        50,
        footerY,
        { align: 'center', width: 500 }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

