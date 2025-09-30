const express = require('express');
const router = express.Router();
const {
    generateAnalyticsReport,
    exportReport,
    getPerformanceMetrics,
    getTopPerformers
} = require('../controllers/reportController');

/**
 * @route   GET /api/reports/analytics
 * @desc    Generate detailed analytics report
 * @access  Public (restrictions handled on frontend)
 * @query   {
 *            startDate: string,
 *            endDate: string,
 *            departmentId: string
 *          }
 */
router.get('/analytics', generateAnalyticsReport);

/**
 * @route   GET /api/reports/export
 * @desc    Export report data in various formats
 * @access  Public (restrictions handled on frontend)
 * @query   {
 *            format: string ('json', 'csv'),
 *            reportType: string ('tasks', 'users'),
 *            startDate: string,
 *            endDate: string,
 *            departmentId: string
 *          }
 */
router.get('/export', exportReport);

/**
 * @route   GET /api/reports/performance
 * @desc    Get performance metrics for specific user or department
 * @access  Public (restrictions handled on frontend)
 * @query   {
 *            userId: string,
 *            departmentId: string,
 *            timeframe: string (number of days, default: 30)
 *          }
 */
router.get('/performance', getPerformanceMetrics);

/**
 * @route   GET /api/reports/top-performers
 * @desc    Get top performers across system or department
 * @access  Public (restrictions handled on frontend)
 * @query   {
 *            departmentId: string,
 *            limit: number (default: 10),
 *            timeframe: string (number of days, default: 30)
 *          }
 */
router.get('/top-performers', getTopPerformers);

module.exports = router;