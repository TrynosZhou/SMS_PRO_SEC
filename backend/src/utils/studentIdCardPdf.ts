import PDFDocument from 'pdfkit';

type PDFDoc = InstanceType<typeof PDFDocument>;
import * as path from 'path';
import * as fs from 'fs';
import sizeOf from 'image-size';
import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';
import { Student } from '../entities/Student';
import { Settings } from '../entities/Settings';

interface StudentIdCardData {
  student: Student;
  settings: Settings | null;
  qrDataUrl: string;
  photoPath?: string | null;
}

function loadStudentPhoto(photoPath?: string | null): Buffer | null {
  if (!photoPath) {
    return null;
  }

  try {
    const normalizedPath = photoPath.replace(/^\//, '');
    const absolutePath = path.join(__dirname, '../../', normalizedPath);

    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath);
    }
  } catch (error) {
    console.error('Failed to load student photo for ID card:', error);
  }

  return null;
}

function loadSchoolLogo(logo?: string | null): Buffer | null {
  if (!logo) return null;

  try {
    // Stored as base64 data URL
    if (logo.startsWith('data:image')) {
      const base64Data = logo.split(',')[1];
      return base64Data ? Buffer.from(base64Data, 'base64') : null;
    }

    // Stored as relative/local path (e.g. /uploads/...)
    const normalizedPath = String(logo).replace(/^\//, '');
    const absolutePath = path.join(__dirname, '../../', normalizedPath);
    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath);
    }
  } catch (error) {
    console.error('Failed to load school logo for ID card:', error);
  }

  return null;
}

/**
 * Best-effort: remove near-white pixels from logo and convert to PNG with transparency.
 * This is needed because settings uploads are saved as JPEG (white background baked-in).
 */
function removeWhiteBackgroundFromLogo(imageBuffer: Buffer, whitenessThreshold = 245): Buffer {
  const isPng = imageBuffer.length >= 8 && imageBuffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  const isJpeg = imageBuffer.length >= 3 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8;

  try {
    if (isJpeg) {
      const decoded = jpeg.decode(imageBuffer, { useTArray: true });
      const { data, width, height } = decoded; // data is RGBA

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        // For JPEG, alpha is usually opaque; we "punch out" near-white pixels.
        if (a > 0 && r >= whitenessThreshold && g >= whitenessThreshold && b >= whitenessThreshold) {
          data[i + 3] = 0;
        }
      }

      const png = new PNG({ width, height });
      png.data = Buffer.from(data);
      return PNG.sync.write(png);
    }

    if (isPng) {
      const png = PNG.sync.read(imageBuffer);
      const data = png.data; // RGBA buffer

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a > 0 && r >= whitenessThreshold && g >= whitenessThreshold && b >= whitenessThreshold) {
          data[i + 3] = 0;
        }
      }

      return PNG.sync.write(png);
    }
  } catch (error) {
    // If anything fails, return the original buffer to avoid breaking PDF generation.
    console.error('Failed to remove white background from school logo:', error);
  }

  return imageBuffer;
}

/**
 * Draw one ID card on the current PDF page (350×220, landscape-style card).
 */
export function drawStudentIdCardPage(doc: PDFDoc, data: StudentIdCardData): void {
  const { student, settings, qrDataUrl, photoPath } = data;

  const schoolName = settings?.schoolName || 'School Management System';
      const schoolAddress = settings?.schoolAddress ? String(settings.schoolAddress).trim() : '';
      const schoolPhone = settings?.schoolPhone ? String(settings.schoolPhone).trim() : '';

      // Background
      doc.rect(0, 0, doc.page.width, doc.page.height)
        .fillColor('#F5F7FA')
        .fill();

      // Outer border
      doc.roundedRect(5, 5, doc.page.width - 10, doc.page.height - 10, 12)
        .lineWidth(2)
        .strokeColor('#1F4B99')
        .stroke();

      // Header bar - increased height to accommodate longer addresses
      const headerHeight = 50; // Increased from 36 to 50
      doc.rect(10, 10, doc.page.width - 20, headerHeight)
        .fillColor('#1F4B99')
        .fill();

      // School logo (logo 1) - keep small so it never overlaps the centered title.
      const logoBuffer = loadSchoolLogo(settings?.schoolLogo);
      if (logoBuffer) {
        const logoWithTransparency = removeWhiteBackgroundFromLogo(logoBuffer);
        const logoPadding = 8;
        const maxLogoWidth = 36; // Keep it compact for the 350x220 card
        const maxLogoHeight = headerHeight - (logoPadding * 2);

        const addLogoWithAspectRatio = (
          imageBuffer: Buffer,
          startX: number,
          startY: number,
          maxWidth: number,
          maxHeight: number
        ) => {
          try {
            const dimensions = sizeOf(imageBuffer);
            const imgWidth = dimensions.width || maxWidth;
            const imgHeight = dimensions.height || maxHeight;

            const scaleX = maxWidth / imgWidth;
            const scaleY = maxHeight / imgHeight;
            const scale = Math.min(scaleX, scaleY);

            const finalWidth = imgWidth * scale;
            const finalHeight = imgHeight * scale;

            const centeredX = startX + (maxWidth - finalWidth) / 2;
            const centeredY = startY + (maxHeight - finalHeight) / 2;

            doc.image(imageBuffer, centeredX, centeredY, { width: finalWidth, height: finalHeight });
          } catch (error) {
            // Fallback: draw with width only (pdfkit keeps aspect ratio)
            doc.image(imageBuffer, startX, startY, { width: maxWidth });
            // If this fails too, it will throw and be caught by outer try/catch.
          }
        };

        const logoBoxX = 10 + logoPadding;
        const logoBoxY = 10 + logoPadding;
        addLogoWithAspectRatio(logoWithTransparency, logoBoxX, logoBoxY, maxLogoWidth, maxLogoHeight);
      }

      // School name - displayed only once at the top (large, bold)
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#FFFFFF');
      // Reserve space on the left for the logo.
      const reservedLeftForLogo = 44; // logo width + padding
      doc.text(schoolName, 15 + reservedLeftForLogo, 18, { 
        width: doc.page.width - 30 - reservedLeftForLogo,
        align: 'center'
      });

      // Address and phone - positioned below school name, ensuring no duplicate school name
      // Only show address and phone, not school name again
      if (schoolAddress || schoolPhone) {
        doc.fontSize(8).font('Helvetica').fillColor('#E7ECF6');
        // Ensure school name is not accidentally included in address or phone
        let contactLine = [schoolAddress, schoolPhone].filter(Boolean).join(' | ');
        // Remove any accidental school name from contact line
        contactLine = contactLine.replace(new RegExp(schoolName, 'gi'), '').trim();
        // Clean up any double separators
        contactLine = contactLine.replace(/\s*\|\s*\|\s*/g, ' | ').replace(/^\s*\|\s*|\s*\|\s*$/g, '');
        
        // Position address text lower to allow for wrapping, with more space from bottom
        // Start at Y=36 to give room for school name above
        if (contactLine) {
          doc.text(contactLine, 15 + reservedLeftForLogo, 36, { 
            width: doc.page.width - 30 - reservedLeftForLogo, 
            align: 'center' 
          });
        }
      }

      // Student information panel - adjusted Y position to account for taller header
      const infoBoxY = 70; // Increased from 56 to 70 (10 + headerHeight + 10 spacing)
      doc.roundedRect(18, infoBoxY, 200, 120, 10)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#D7DFEB')
        .lineWidth(1)
        .stroke();

      // Student photo
      const photoBuffer = loadStudentPhoto(photoPath);
      const photoX = 26;
      const photoY = infoBoxY + 12;
      const photoSize = 60;

      doc.save();
      doc.roundedRect(photoX, photoY, photoSize, photoSize, 8)
        .clip()
        .fillColor('#E3E9F2')
        .fill();

      if (photoBuffer) {
        try {
          doc.image(photoBuffer, photoX, photoY, { width: photoSize, height: photoSize, align: 'center', valign: 'center' });
        } catch (error) {
          console.error('Failed to add student photo to ID card:', error);
        }
      } else {
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#1F4B99');
        doc.text(student.gender === 'Male' ? '👦' : '👧', photoX, photoY + 8, { width: photoSize, align: 'center' });
      }

      doc.restore();

      const infoStartX = photoX + photoSize + 12;
      const infoStartY = photoY;

      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1F4B99');
      doc.text(`${student.firstName} ${student.lastName}`.toUpperCase(), infoStartX, infoStartY, { width: 140 });

      doc.fontSize(10).font('Helvetica').fillColor('#344055');
      doc.text(`Student No: ${student.studentNumber}`, infoStartX, infoStartY + 22);
      doc.text(`Class: ${student.classEntity?.name || 'N/A'}`, infoStartX, infoStartY + 38);
      doc.text(`Type: ${student.studentType || 'Day Scholar'}`, infoStartX, infoStartY + 54);

      if (student.dateOfBirth) {
        const dob = student.dateOfBirth instanceof Date ? student.dateOfBirth : new Date(student.dateOfBirth);
        doc.text(`DOB: ${dob.toLocaleDateString()}`, infoStartX, infoStartY + 70);
      }

      const contactInfo = student.contactNumber || student.phoneNumber;
      if (contactInfo) {
        doc.text(`Contact: ${contactInfo}`, infoStartX, infoStartY + 86, { width: 140 });
      }

      // QR Code and validity panel
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      const qrSize = 78;
      const qrX = doc.page.width - qrSize - 28;
      const qrY = infoBoxY + 16;

      doc.roundedRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 20, 12)
        .fillColor('#FFFFFF')
        .fill()
        .strokeColor('#D7DFEB')
        .lineWidth(1)
        .stroke();

      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

      doc.fontSize(8).font('Helvetica').fillColor('#1F4B99');
      doc.text('Scan QR for verification', qrX - 4, qrY + qrSize + 2, { width: qrSize + 8, align: 'center' });

      // Footer bar
      const footerY = doc.page.height - 36;
      doc.rect(10, footerY, doc.page.width - 20, 24)
        .fillColor('#1F4B99')
        .fill();

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('VALID STUDENT IDENTIFICATION CARD', 15, footerY + 6, { width: doc.page.width - 30, align: 'center' });
}

export async function createStudentIdCardPDF(data: StudentIdCardData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [350, 220], margin: 16 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      drawStudentIdCardPage(doc, data);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/** Multi-page PDF: one card per student (same layout as single ID card). */
export async function createClassStudentIdCardsPDF(items: StudentIdCardData[]): Promise<Buffer> {
  if (!items.length) {
    return Buffer.alloc(0);
  }
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: [350, 220], margin: 16 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      items.forEach((item, index) => {
        if (index > 0) {
          doc.addPage();
        }
        drawStudentIdCardPage(doc, item);
      });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
