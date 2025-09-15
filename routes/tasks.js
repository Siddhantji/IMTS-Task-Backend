const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

// Import controllers and middleware
const taskController = require('../controllers/taskController');
const { 
    authenticateToken, 
    authorizeRoles,
    authorizeTaskAccess,
    handleValidationErrors 
} = require('../middleware');

// Validation rules
const createTaskValidation = [
    body('title')
        .trim()
        .isLength({ min: 3, max: 200 })
        .withMessage('Title must be between 3 and 200 characters'),
    body('description')
        .trim()
        .isLength({ min: 10, max: 2000 })
        .withMessage('Description must be between 10 and 2000 characters'),
    body('deadline')
        .isISO8601()
        .withMessage('Please provide a valid deadline date')
        .custom((value) => {
            if (new Date(value) <= new Date()) {
                throw new Error('Deadline must be in the future');
            }
            return true;
        }),
    body('priority')
        .isIn(['low', 'medium', 'high', 'urgent'])
        .withMessage('Priority must be low, medium, high, or urgent'),
    body('estimatedDuration')
        .isFloat({ min: 0.5 })
        .withMessage('Estimated duration must be at least 0.5 hours'),
    body('assignedTo')
        .optional()
        .isArray()
        .withMessage('Assigned users must be an array'),
    body('assignedTo.*')
        .optional()
        .isMongoId()
        .withMessage('Each assigned user must be a valid user ID'),
    body('observers')
        .optional()
        .isArray()
        .withMessage('Observers must be an array'),
    body('observers.*')
        .optional()
        .isMongoId()
        .withMessage('Each observer must be a valid user ID'),
    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array')
];

const updateTaskValidation = [
    body('title')
        .optional()
        .trim()
        .isLength({ min: 3, max: 200 })
        .withMessage('Title must be between 3 and 200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ min: 10, max: 2000 })
        .withMessage('Description must be between 10 and 2000 characters'),
    body('deadline')
        .optional()
        .isISO8601()
        .withMessage('Please provide a valid deadline date')
        .custom((value) => {
            if (new Date(value) <= new Date()) {
                throw new Error('Deadline must be in the future');
            }
            return true;
        }),
    body('priority')
        .optional()
        .isIn(['low', 'medium', 'high', 'urgent'])
        .withMessage('Priority must be low, medium, high, or urgent'),
    body('estimatedDuration')
        .optional()
        .isFloat({ min: 0.5 })
        .withMessage('Estimated duration must be at least 0.5 hours')
];

const updateStatusValidation = [
    body('status')
        .isIn(['created', 'assigned', 'in_progress', 'completed', 'approved', 'rejected', 'transferred'])
        .withMessage('Invalid status value'),
    body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters')
];

const updateStageValidation = [
    body('stage')
        .isIn(['planning', 'development', 'testing', 'review', 'deployment', 'completed'])
        .withMessage('Invalid stage value'),
    body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters')
];

const addRemarkValidation = [
    body('text')
        .trim()
        .isLength({ min: 1, max: 1000 })
        .withMessage('Remark text must be between 1 and 1000 characters'),
    body('category')
        .optional()
        .isIn(['giver', 'worker', 'general', 'auto'])
        .withMessage('Category must be giver, worker, general, or auto')
];

const assignTaskValidation = [
    body('userIds')
        .isArray({ min: 1 })
        .withMessage('At least one user must be assigned'),
    body('userIds.*')
        .isMongoId()
        .withMessage('Each user ID must be valid'),
    body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters')
];

const mongoIdValidation = [
    param('id')
        .isMongoId()
        .withMessage('Invalid task ID')
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
    query('status')
        .optional()
        .isIn(['created', 'assigned', 'in_progress', 'completed', 'approved', 'rejected', 'transferred'])
        .withMessage('Invalid status filter'),
    query('priority')
        .optional()
        .isIn(['low', 'medium', 'high', 'urgent'])
        .withMessage('Invalid priority filter'),
    query('stage')
        .optional()
        .isIn(['planning', 'development', 'testing', 'review', 'deployment', 'completed'])
        .withMessage('Invalid stage filter')
];

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Private (Giver, HOD)
 */
router.post('/',
    authenticateToken,
    authorizeRoles('giver', 'hod'),
    createTaskValidation,
    handleValidationErrors,
    taskController.createTask
);

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks with filtering and pagination
 * @access  Private
 */
router.get('/',
    authenticateToken,
    queryValidation,
    handleValidationErrors,
    taskController.getTasks
);

/**
 * @route   GET /api/tasks/stats
 * @desc    Get task statistics
 * @access  Private
 */
router.get('/stats',
    authenticateToken,
    taskController.getTaskStats
);

/**
 * @route   GET /api/tasks/:id
 * @desc    Get single task by ID
 * @access  Private
 */
router.get('/:id',
    authenticateToken,
    mongoIdValidation,
    handleValidationErrors,
    authorizeTaskAccess('read'),
    taskController.getTask
);

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update task details
 * @access  Private (Giver, HOD)
 */
router.put('/:id',
    authenticateToken,
    mongoIdValidation,
    updateTaskValidation,
    handleValidationErrors,
    authorizeTaskAccess('modify'),
    authorizeRoles('giver', 'hod'),
    taskController.updateTask
);

/**
 * @route   PUT /api/tasks/:id/status
 * @desc    Update task status
 * @access  Private
 */
router.put('/:id/status',
    authenticateToken,
    mongoIdValidation,
    updateStatusValidation,
    handleValidationErrors,
    authorizeTaskAccess('modify'),
    taskController.updateTaskStatus
);

/**
 * @route   PUT /api/tasks/:id/stage
 * @desc    Update task stage
 * @access  Private (Worker, Giver, HOD)
 */
router.put('/:id/stage',
    authenticateToken,
    mongoIdValidation,
    updateStageValidation,
    handleValidationErrors,
    authorizeTaskAccess('modify'),
    authorizeRoles('worker', 'giver', 'hod'),
    taskController.updateTaskStage
);

/**
 * @route   POST /api/tasks/:id/remarks
 * @desc    Add remark to task
 * @access  Private
 */
router.post('/:id/remarks',
    authenticateToken,
    mongoIdValidation,
    addRemarkValidation,
    handleValidationErrors,
    authorizeTaskAccess('read'),
    taskController.addRemark
);

/**
 * @route   PUT /api/tasks/:id/assign
 * @desc    Assign task to users
 * @access  Private (Giver, HOD)
 */
router.put('/:id/assign',
    authenticateToken,
    mongoIdValidation,
    assignTaskValidation,
    handleValidationErrors,
    authorizeTaskAccess('modify'),
    authorizeRoles('giver', 'hod'),
    taskController.assignTask
);

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete task (soft delete)
 * @access  Private (Giver, HOD)
 */
router.delete('/:id',
    authenticateToken,
    mongoIdValidation,
    handleValidationErrors,
    authorizeTaskAccess('modify'),
    authorizeRoles('giver', 'hod'),
    taskController.deleteTask
);

module.exports = router;
