const PDFDocument = require('pdfkit');

const toText = (value) => {
  if (value === null || value === undefined) {
    return '-';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
};

const writeSectionTitle = (doc, title) => {
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).text(title);
  doc.moveDown(0.2);
};

const writeKeyValueBlock = (doc, objectValue = {}) => {
  Object.entries(objectValue).forEach(([key, value]) => {
    doc.font('Helvetica-Bold').fontSize(10).text(`${key}: `, { continued: true });
    doc.font('Helvetica').fontSize(10).text(toText(value));
  });
};

const writeArrayPreview = (doc, rows = [], maxRows = 40) => {
  const previewRows = rows.slice(0, maxRows);

  if (previewRows.length === 0) {
    doc.font('Helvetica').fontSize(10).text('No data.');
    return;
  }

  previewRows.forEach((row, index) => {
    doc.font('Helvetica-Bold').fontSize(9).text(`#${index + 1}`);
    writeKeyValueBlock(doc, row);
    doc.moveDown(0.2);
  });

  if (rows.length > maxRows) {
    doc.font('Helvetica').fontSize(9).text(`... ${rows.length - maxRows} more rows omitted in PDF preview.`);
  }
};

const buildPdfExport = ({ reportType, reportData }) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(16).text(`HISAB ${String(reportType || '').toUpperCase()} REPORT`);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).text(`Generated At: ${reportData?.generatedAt || new Date().toISOString()}`);

    writeSectionTitle(doc, 'Summary');
    writeKeyValueBlock(doc, reportData?.summary || {});

    if (reportData?.taxSummary) {
      writeSectionTitle(doc, 'Tax Summary');
      writeKeyValueBlock(doc, reportData.taxSummary);
    }

    writeSectionTitle(doc, 'Timestamps');
    writeKeyValueBlock(doc, reportData?.timestamps || {});

    const breakdown = reportData?.breakdown || {};
    Object.entries(breakdown).forEach(([sectionName, value]) => {
      writeSectionTitle(doc, `Breakdown: ${sectionName}`);
      if (Array.isArray(value)) {
        writeArrayPreview(doc, value, 30);
      } else if (value && typeof value === 'object') {
        writeKeyValueBlock(doc, value);
      } else {
        doc.font('Helvetica').fontSize(10).text(toText(value));
      }
    });

    if (reportData?.reconciliation) {
      writeSectionTitle(doc, 'Reconciliation');
      const checks = Array.isArray(reportData.reconciliation.checks) ? reportData.reconciliation.checks : [];

      if (checks.length > 0) {
        writeArrayPreview(doc, checks, 20);
      } else {
        writeKeyValueBlock(doc, {
          reconciled: Boolean(reportData.reconciliation.reconciled),
        });
      }
    }

    doc.end();
  });
};

module.exports = {
  buildPdfExport,
};
