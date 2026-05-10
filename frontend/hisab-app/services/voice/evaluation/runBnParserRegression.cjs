const fs = require('fs');
const path = require('path');

require('esbuild-register/dist/node').register({
  target: 'es2020',
  format: 'cjs',
});

const { parseAmount } = require('../normalization/numberParser.js');
const { parseDate } = require('../normalization/dateParser.js');

const NOW = new Date('2026-04-21T00:00:00.000Z');
const OUT_JSON = path.resolve(__dirname, './parserRegressionReport.json');
const OUT_MD = path.resolve(__dirname, './parserRegressionReport.md');

const amountCases = [
  { input: 'একশ বিশ টাকা', expected: 120 },
  { input: 'পাঁচশ পঞ্চাশ', expected: 550 },
  { input: 'tin hajar', expected: 3000 },
  { input: 'দেড়শ', expected: 150 },
  { input: '1,250', expected: 1250 },
  { input: '৩৫০০ টাকা', expected: 3500 },
  { input: 'bish', expected: 20 },
  { input: 'noy sho', expected: 900 },
];

const dateCases = [
  { input: 'aj', expected: '2026-04-21' },
  { input: 'kal', expected: '2026-04-22' },
  { input: '2026-12-05', expected: '2026-12-05' },
  { input: '12/5', expected: '2026-05-12' },
  { input: '২৮ তারিখ', expected: '2026-04-28' },
  { input: 'saturday', expected: '2026-04-25' },
  { input: 'shukrobar', expected: '2026-04-24' },
  { input: '01-11', expected: '2026-11-01' },
];

const runAmountSuite = () => {
  const failures = [];

  for (const testCase of amountCases) {
    const row = parseAmount(testCase.input);
    if (Number(row.amount) !== Number(testCase.expected)) {
      failures.push({
        input: testCase.input,
        expected: testCase.expected,
        got: row.amount,
      });
    }
  }

  return {
    passed: amountCases.length - failures.length,
    total: amountCases.length,
    failures,
  };
};

const runDateSuite = () => {
  const failures = [];

  for (const testCase of dateCases) {
    const row = parseDate(testCase.input, NOW);
    if (String(row.date || '') !== String(testCase.expected || '')) {
      failures.push({
        input: testCase.input,
        expected: testCase.expected,
        got: row.date,
      });
    }
  }

  return {
    passed: dateCases.length - failures.length,
    total: dateCases.length,
    failures,
  };
};

const amountResult = runAmountSuite();
const dateResult = runDateSuite();

const report = {
  generatedAt: new Date().toISOString(),
  amount: amountResult,
  date: dateResult,
  totalPassed: amountResult.passed + dateResult.passed,
  totalCases: amountResult.total + dateResult.total,
  passRate: Number(((amountResult.passed + dateResult.passed) / (amountResult.total + dateResult.total)).toFixed(4)),
};

fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

const md = [
  '# Bengali Parser Regression Report',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `- Amount cases: ${amountResult.passed}/${amountResult.total}`,
  `- Date cases: ${dateResult.passed}/${dateResult.total}`,
  `- Overall pass rate: ${report.passRate}`,
  '',
  '## Amount Failures',
  '',
  ...(amountResult.failures.length
    ? amountResult.failures.map((item) => `- ${item.input} | expected=${item.expected} | got=${item.got}`)
    : ['- None']),
  '',
  '## Date Failures',
  '',
  ...(dateResult.failures.length
    ? dateResult.failures.map((item) => `- ${item.input} | expected=${item.expected} | got=${item.got}`)
    : ['- None']),
].join('\n');

fs.writeFileSync(OUT_MD, md, 'utf8');

if (amountResult.failures.length || dateResult.failures.length) {
  console.error('Bengali parser regression failed. See parserRegressionReport.json');
  process.exit(1);
}

console.log('Bengali parser regression passed.', report);
