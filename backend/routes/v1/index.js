const express = require('express');

const productsRoutes = require('./productsRoutes');
const customersRoutes = require('./customersRoutes');
const bakiRoutes = require('./bakiRoutes');
const movementsRoutes = require('./movementsRoutes');
const transactionsRoutes = require('./transactionsRoutes');
const reportsRoutes = require('./reportsRoutes');
const auditLogsRoutes = require('./auditLogsRoutes');
const syncRoutes = require('./syncRoutes');
const trustRoutes = require('./trustRoutes');
const marketDataRoutes = require('./marketDataRoutes');
const markovRoutes = require('./markovRoutes');
const suggestionsRoutes = require('./suggestionsRoutes');
const approvalRequestsRoutes = require('./approvalRequestsRoutes');
const branchesRoutes = require('./branchesRoutes');
const teamUsersRoutes = require('./teamUsersRoutes');
const reliabilityRoutes = require('./reliabilityRoutes');
const pilotRoutes = require('./pilotRoutes');
const globalIdentityRoutes = require('./globalIdentityRoutes');
const customerMarkovRoutes = require('./customerMarkovRoutes');

const router = express.Router();

router.use('/products', productsRoutes);
router.use('/customers', customersRoutes);
router.use('/baki', bakiRoutes);
router.use('/inventory/movements', movementsRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/reports', reportsRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/sync', syncRoutes);
router.use('/trust', trustRoutes);
router.use('/market-data', marketDataRoutes);
router.use('/markov', markovRoutes);
router.use('/suggestions', suggestionsRoutes);
router.use('/approvals', approvalRequestsRoutes);
router.use('/branches', branchesRoutes);
router.use('/team/users', teamUsersRoutes);
router.use('/reliability', reliabilityRoutes);
router.use('/pilot', pilotRoutes);
router.use('/identity', globalIdentityRoutes);
router.use('/customer-markov', customerMarkovRoutes);

module.exports = router;
