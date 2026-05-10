const EOL = '\n';

const toSafeString = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const csvEscape = (value) => {
  const raw = toSafeString(value);
  const escaped = raw.replace(/"/g, '""');

  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
};

const objectToRows = (obj = {}) => {
  return Object.entries(obj).map(([key, value]) => [key, toSafeString(value)]);
};

const rowsToCsv = (headers = [], rows = []) => {
  const lines = [];

  if (headers.length) {
    lines.push(headers.map(csvEscape).join(','));
  }

  rows.forEach((row) => {
    lines.push((row || []).map(csvEscape).join(','));
  });

  return lines.join(EOL);
};

const buildCsvExport = ({ reportType, reportData }) => {
  const lines = [];

  lines.push(`# HISAB ${String(reportType || '').toUpperCase()} REPORT`);
  lines.push(`# Generated At: ${reportData?.generatedAt || new Date().toISOString()}`);
  lines.push('');

  lines.push('Summary Metric,Value');
  objectToRows(reportData?.summary || {}).forEach((row) => {
    lines.push(rowsToCsv([], [row]));
  });

  if (reportData?.taxSummary) {
    lines.push('');
    lines.push('Tax Metric,Value');
    objectToRows(reportData.taxSummary).forEach((row) => {
      lines.push(rowsToCsv([], [row]));
    });
  }

  lines.push('');
  lines.push('Timestamp Key,Value');
  objectToRows(reportData?.timestamps || {}).forEach((row) => {
    lines.push(rowsToCsv([], [row]));
  });

  const breakdown = reportData?.breakdown || {};
  Object.entries(breakdown).forEach(([sectionName, sectionValue]) => {
    lines.push('');
    lines.push(`# ${sectionName}`);

    if (Array.isArray(sectionValue)) {
      if (sectionValue.length === 0) {
        lines.push('No data');
        return;
      }

      const keys = [...new Set(sectionValue.flatMap((row) => Object.keys(row || {})))];
      const rows = sectionValue.map((row) => keys.map((key) => row?.[key]));
      lines.push(rowsToCsv(keys, rows));
      return;
    }

    if (sectionValue && typeof sectionValue === 'object') {
      const sectionRows = objectToRows(sectionValue);
      lines.push(rowsToCsv(['Metric', 'Value'], sectionRows));
      return;
    }

    lines.push(rowsToCsv(['Value'], [[toSafeString(sectionValue)]]));
  });

  if (reportData?.reconciliation) {
    lines.push('');
    lines.push('# reconciliation');

    const checks = Array.isArray(reportData.reconciliation.checks) ? reportData.reconciliation.checks : [];
    if (checks.length > 0) {
      const keys = [...new Set(checks.flatMap((row) => Object.keys(row || {})))];
      const rows = checks.map((row) => keys.map((key) => row?.[key]));
      lines.push(rowsToCsv(keys, rows));
    } else {
      lines.push(rowsToCsv(['reconciled'], [[String(Boolean(reportData.reconciliation.reconciled))]]));
    }
  }

  return lines.join(EOL);
};

module.exports = {
  buildCsvExport,
};
