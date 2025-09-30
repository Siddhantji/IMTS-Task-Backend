const express = require('express');
const router = express.Router();
const {
    getHODDashboard,
    getDepartmentTasks,
    getDepartmentEmployees,
    toggleUserAccess,
    getDepartmentReport,
    getEmployeeDetail,
    getEmployeeTasks
} = require('../controllers/hodController');
const { authenticateToken } = require('../middleware');

// Apply authentication middleware to all HOD routes
router.use(authenticateToken);

/**
 * @route   GET /api/hod/dashboard
 * @desc    Get HOD dashboard overview with department statistics
 * @access  Protected (HOD only - uses authenticated user's department)
 */
router.get('/dashboard', getHODDashboard);

/**
 * @route   GET /api/hod/tasks
 * @desc    Get all tasks in HOD's department with filtering and pagination
 * @access  Protected (HOD only - uses authenticated user's department)
 * @query   {
 *            page: number,
 *            limit: number,
 *            status: string,
 *            priority: string,
 *            search: string,
 *            assignedTo: string,
 *            sortBy: string,
 *            sortOrder: string,
 *            startDate: string,
 *            endDate: string
 *          }
 */
router.get('/tasks', getDepartmentTasks);

/**
 * @route   GET /api/hod/employees
 * @desc    Get all employees in HOD's department with task statistics
 * @access  Protected (HOD only - uses authenticated user's department)
 * @query   {
 *            page: number,
 *            limit: number,
 *            search: string,
 *            isActive: boolean,
 *            sortBy: string,
 *            sortOrder: string
 *          }
 */
router.get('/employees', getDepartmentEmployees);

/**
 * @route   PUT /api/hod/employees/:userId/access
 * @desc    Toggle user access (activate/deactivate) for employees in HOD's department
 * @access  Protected (HOD only - can only manage own department employees)
 * @body    { isActive: boolean }
 */
router.put('/employees/:userId/access', toggleUserAccess);

/**
 * @route   GET /api/hod/employees/:employeeId
 * @desc    Get detailed information for a specific employee in HOD's department
 * @access  Protected (HOD only - can only view own department employees)
 */
router.get('/employees/:employeeId', getEmployeeDetail);

/**
 * @route   GET /api/hod/employees/:employeeId/tasks
 * @desc    Get all tasks for a specific employee in HOD's department
 * @access  Protected (HOD only - can only view own department employees' tasks)
 */
router.get('/employees/:employeeId/tasks', getEmployeeTasks);

/**
 * @route   GET /api/hod/reports
 * @desc    Get performance report for HOD's department
 * @access  Protected (HOD only - uses authenticated user's department)
 * @query   {
 *            startDate: string,
 *            endDate: string
 *          }
 */
router.get('/reports', getDepartmentReport);

module.exports = router;