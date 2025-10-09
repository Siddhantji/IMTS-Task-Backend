const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

// Import controllers and middleware
const userController = require('../controllers/userController');
const { 
    authenticateToken, 
    handleValidationErrors 
} = require('../middleware');

// Validation rules
const updateRoleValidation = [
    body('role')
        .isIn(['employee', 'hod', 'admin'])
        .withMessage('Role must be employee, hod, or admin')
];

const transferUserValidation = [
    body('departmentId')
        .isMongoId()
        .withMessage('Valid department ID is required')
];

const mongoIdValidation = [
    param('id')
        .isMongoId()
        .withMessage('Invalid user ID')
];

const queryValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('role')
        .optional()
        .isIn(['employee', 'hod', 'admin'])
        .withMessage('Invalid role filter'),
    query('departmentId')
        .optional()
        .isMongoId()
        .withMessage('Invalid department ID')
];

// ==================== DEPARTMENT ENDPOINTS (Public) ====================

/**
 * @route   GET /api/users/departments
 * @desc    Get all active departments
 * @access  Public (No authentication required)
 */
router.get('/departments',
    userController.getDepartments
);

// ==================== PASSWORD UPDATE ENDPOINT (Open API) ====================

/**
 * @route   PUT /api/users/update-password
 * @desc    Update user password - Open API endpoint
 * @access  Public (No authentication required)
 */
router.put('/update-password',
    [
        body('email')
            .isEmail()
            .normalizeEmail()
            .withMessage('Valid email is required'),
        body('newPassword')
            .isLength({ min: 6 })
            .withMessage('Password must be at least 6 characters long')
    ],
    handleValidationErrors,
    userController.updatePassword
);

// ==================== USER ENDPOINTS (Private) ====================

/**
 * @route   GET /api/users
 * @desc    Get all users with filtering and pagination
 * @access  Private
 */
router.get('/',
    authenticateToken,
    queryValidation,
    handleValidationErrors,
    userController.getUsers
);

/**
 * @route   GET /api/users/employees
 * @desc    Get all employees (with optional department filter)
 * @access  Private
 */
router.get('/employees',
    authenticateToken,
    userController.getAllEmployees
);

/**
 * @route   GET /api/users/dropdown
 * @desc    Get users for dropdown (simplified response)
 * @access  Private
 */
router.get('/dropdown',
    authenticateToken,
    userController.getUsersForDropdown
);

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 * @access  Private
 */
router.get('/stats',
    authenticateToken,
    userController.getUserStats
);

/**
 * @route   GET /api/users/:id
 * @desc    Get single user by ID
 * @access  Private
 */
router.get('/:id',
    authenticateToken,
    mongoIdValidation,
    handleValidationErrors,
    userController.getUser
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    Update user role
 * @access  Private
 */
router.put('/:id/role',
    authenticateToken,
    mongoIdValidation,
    updateRoleValidation,
    handleValidationErrors,
    userController.updateUserRole
);

/**
 * @route   PUT /api/users/:id/status
 * @desc    Toggle user active/inactive status
 * @access  Private
 */
router.put('/:id/status',
    authenticateToken,
    mongoIdValidation,
    handleValidationErrors,
    userController.toggleUserStatus
);

/**
 * @route   PUT /api/users/:id/transfer
 * @desc    Transfer user to different department
 * @access  Private
 */
router.put('/:id/transfer',
    authenticateToken,
    mongoIdValidation,
    transferUserValidation,
    handleValidationErrors,
    userController.transferUser
);

module.exports = router;
