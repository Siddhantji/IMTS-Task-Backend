const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

// Import controllers and middleware
const userController = require('../controllers/userController');
const { 
    authenticateToken, 
    authorizeRoles,
    handleValidationErrors 
} = require('../middleware');

// Validation rules
const updateRoleValidation = [
    body('role')
        .isIn(['worker', 'giver', 'hod', 'observer'])
        .withMessage('Role must be worker, giver, hod, or observer')
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
        .isIn(['worker', 'giver', 'hod', 'observer'])
        .withMessage('Invalid role filter'),
    query('departmentId')
        .optional()
        .isMongoId()
        .withMessage('Invalid department ID')
];

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
 * @route   GET /api/users/stats
 * @desc    Get user statistics
 * @access  Private
 */
router.get('/stats',
    authenticateToken,
    userController.getUserStats
);

/**
 * @route   GET /api/users/workers
 * @desc    Get workers for task assignment
 * @access  Private (Giver, HOD)
 */
router.get('/workers',
    authenticateToken,
    authorizeRoles('giver', 'hod'),
    userController.getWorkers
);

/**
 * @route   GET /api/users/givers
 * @desc    Get task givers
 * @access  Private
 */
router.get('/givers',
    authenticateToken,
    userController.getTaskGivers
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
 * @access  Private (HOD only)
 */
router.put('/:id/role',
    authenticateToken,
    authorizeRoles('hod'),
    mongoIdValidation,
    updateRoleValidation,
    handleValidationErrors,
    userController.updateUserRole
);

/**
 * @route   PUT /api/users/:id/status
 * @desc    Toggle user active/inactive status
 * @access  Private (HOD only)
 */
router.put('/:id/status',
    authenticateToken,
    authorizeRoles('hod'),
    mongoIdValidation,
    handleValidationErrors,
    userController.toggleUserStatus
);

/**
 * @route   PUT /api/users/:id/transfer
 * @desc    Transfer user to different department
 * @access  Private (HOD only)
 */
router.put('/:id/transfer',
    authenticateToken,
    authorizeRoles('hod'),
    mongoIdValidation,
    transferUserValidation,
    handleValidationErrors,
    userController.transferUser
);

// ==================== DEPARTMENT ENDPOINTS ====================

/**
 * @route   GET /api/users/departments
 * @desc    Get all active departments
 * @access  Public
 */
router.get('/departments',
    userController.getDepartments
);

module.exports = router;
