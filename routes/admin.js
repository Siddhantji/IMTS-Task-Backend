const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Dashboard routes
router.get('/dashboard', adminController.getAdminDashboard);

// Department management routes
router.get('/departments', adminController.getAllDepartments);
router.get('/departments/:departmentId', adminController.getDepartmentDetail);
router.get('/departments/:departmentId/tasks', adminController.getDepartmentTasks);
router.get('/departments/:departmentId/employees', adminController.getDepartmentEmployees);
router.get('/departments/:departmentId/reports', adminController.getDepartmentReport);

// System-wide reports
router.get('/reports/system', adminController.getSystemReport);

// User management
router.put('/users/:userId/toggle-access', adminController.toggleUserAccess);

module.exports = router;