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

module.exports = router;
