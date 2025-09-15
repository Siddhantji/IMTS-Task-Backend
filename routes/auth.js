const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();

// Import controllers and middleware
const authController = require('../controllers/authController');
const { 
    authenticateToken, 
    handleValidationErrors, 
    authRateLimit 
} = require('../middleware');

// Validation rules
const registerValidation = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('phone')
        .matches(/^\d{10}$/)
        .withMessage('Phone number must be exactly 10 digits'),
    body('role')
        .isIn(['employee', 'hod', 'admin'])
        .withMessage('Role must be employee, hod, or admin'),
    body('departmentId')
        .isMongoId()
        .withMessage('Valid department ID is required')
];

const loginValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

const updateProfileValidation = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('phone')
        .optional()
        .matches(/^\d{10}$/)
        .withMessage('Phone number must be exactly 10 digits')
];

const changePasswordValidation = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('New password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number')
];

const refreshTokenValidation = [
    body('refreshToken')
        .notEmpty()
        .withMessage('Refresh token is required')
];

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', 
    authRateLimit,
    registerValidation,
    handleValidationErrors,
    authController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login',
    authRateLimit,
    loginValidation,
    handleValidationErrors,
    authController.login
);

/**
 * @route   GET /api/auth/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile',
    authenticateToken,
    authController.getProfile
);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile',
    authenticateToken,
    updateProfileValidation,
    handleValidationErrors,
    authController.updateProfile
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.put('/change-password',
    authenticateToken,
    changePasswordValidation,
    handleValidationErrors,
    authController.changePassword
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh-token',
    refreshTokenValidation,
    handleValidationErrors,
    authController.refreshToken
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout',
    authenticateToken,
    authController.logout
);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout user from all devices
 * @access  Private
 */
router.post('/logout-all',
    authenticateToken,
    authController.logoutAll
);

module.exports = router;
