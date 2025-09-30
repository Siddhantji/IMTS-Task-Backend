const express = require('express');
const router = express.Router();
const {
    getSuperAdminDashboard,
    getAllDepartments,
    getAllUsers,
    getAllTasks,
    manageUserAccess,
    getSystemReports
} = require('../controllers/superAdminController');

/**
 * @route   GET /api/super-admin/dashboard
 * @desc    Get Super Admin dashboard overview with system-wide statistics
 * @access  Public (restrictions handled on frontend)
 */
router.get('/dashboard', getSuperAdminDashboard);

/**
 * @route   GET /api/super-admin/departments
 * @desc    Get all departments with statistics
 * @access  Public (restrictions handled on frontend)
 * @query   {
 *            page: number,
 *            limit: number,
 *            search: string,
 *            sortBy: string,
 *            sortOrder: string
 *          }
 */
router.get('/departments', getAllDepartments);

/**
 * @route   GET /api/super-admin/users
 * @desc    Get all users across departments with task statistics
 * @access  Public (restrictions handled on frontend)
 * @query   {
 *            page: number,
 *            limit: number,
 *            role: string,
 *            department: string,
 *            search: string,
 *            isActive: boolean,
 *            sortBy: string,
 *            sortOrder: string
 *          }
 */
router.get('/users', getAllUsers);

/**
 * @route   GET /api/super-admin/tasks
 * @desc    Get all tasks across departments
 * @access  Public (restrictions handled on frontend)
 * @query   {
 *            page: number,
 *            limit: number,
 *            status: string,
 *            priority: string,
 *            department: string,
 *            search: string,
 *            assignedTo: string,
 *            sortBy: string,
 *            sortOrder: string,
 *            startDate: string,
 *            endDate: string
 *          }
 */
router.get('/tasks', getAllTasks);

/**
 * @route   PUT /api/super-admin/users/:userId
 * @desc    Manage user access and roles across all departments
 * @access  Public (restrictions handled on frontend)
 * @body    { isActive: boolean, role: string }
 */
router.put('/users/:userId', manageUserAccess);

/**
 * @route   GET /api/super-admin/reports
 * @desc    Get comprehensive system reports
 * @access  Public (restrictions handled on frontend)
 * @query   {
 *            startDate: string,
 *            endDate: string,
 *            reportType: string ('overview', 'departments', 'performance', 'all')
 *          }
 */
router.get('/reports', getSystemReports);

module.exports = router;