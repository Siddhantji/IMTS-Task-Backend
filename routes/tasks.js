const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

// Import controllers and middleware
const taskController = require('../controllers/taskController');
const upload = require('../config/upload');
const { 
    authenticateToken, 
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
        .withMessage('Tags must be an array'),
    // Custom validation for file attachments (handled by multer middleware)
    body('removeAttachments')
        .optional()
        .isArray()
        .withMessage('Remove attachments must be an array of attachment IDs'),
    body('removeAttachments.*')
        .optional()
        .isMongoId()
        .withMessage('Each attachment ID must be valid')
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
        .withMessage('Priority must be low, medium, high, or urgent')
];

const updateStatusValidation = [
    body('status')
        .isIn(['created', 'assigned', 'in_progress', 'completed', 'approved', 'rejected', 'transferred', 'pending'])
        .withMessage('Invalid status value'),
    body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters')
];

const updateStageValidation = [
    body('stage')
        .isIn(['not_started', 'pending', 'done'])
        .withMessage('Invalid stage value'),
    body('reason')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters')
];

const updateIndividualStageValidation = [
    body('stage')
        .optional()
        .isIn(['not_started', 'pending', 'done'])
        .withMessage('Invalid individual stage value'),
    body('status')
        .optional()
        .isIn(['assigned', 'in_progress', 'completed', 'blocked'])
        .withMessage('Invalid individual status value'),
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Notes cannot exceed 1000 characters')
];

const updateIndividualApprovalValidation = [
    body('userId')
        .isMongoId()
        .withMessage('Valid assignee userId is required'),
    body('decision')
        .isIn(['approve', 'reject'])
        .withMessage('Decision must be approve or reject'),
    body('reason')
        .optional()
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
        .isIn(['creator', 'assignee', 'general', 'auto'])
        .withMessage('Category must be creator, assignee, general, or auto')
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
        .isIn(['not_started', 'pending', 'done'])
        .withMessage('Invalid stage filter')
];

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Private (Any authenticated user can create tasks)
 */
router.post('/',
    authenticateToken,
    upload.multiple('attachments', 5),
    upload.errorHandler,
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
 * @route   GET /api/tasks/dashboard-stats
 * @desc    Get dashboard statistics for progress cards
 * @access  Private
 */
router.get('/dashboard-stats',
    authenticateToken,
    taskController.getDashboardStats
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
    upload.multiple('attachments', 5),
    upload.errorHandler,
    updateTaskValidation,
    handleValidationErrors,
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
    taskController.updateTaskStage
);

/**
 * @route   PUT /api/tasks/:id/individual-stage
 * @desc    Update individual stage for group task member
 * @access  Private (Assigned users only)
 */
router.put('/:id/individual-stage',
    authenticateToken,
    mongoIdValidation,
    updateIndividualStageValidation,
    handleValidationErrors,
    taskController.updateIndividualStage
);

/**
 * @route   PUT /api/tasks/:id/individual-approval
 * @desc    Approve or reject an individual assignee in a group task
 * @access  Private (Creator/HOD/Admin)
 */
router.put('/:id/individual-approval',
    authenticateToken,
    mongoIdValidation,
    updateIndividualApprovalValidation,
    handleValidationErrors,
    taskController.updateIndividualApproval
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
    taskController.deleteTask
);

// ==================== FILE ATTACHMENT ENDPOINTS ====================

/**
 * @route   POST /api/tasks/:id/attachments
 * @desc    Add attachments to existing task
 * @access  Private (Assignee, Giver, HOD)
 */
router.post('/:id/attachments',
    authenticateToken,
    mongoIdValidation,
    handleValidationErrors,
    upload.multiple('attachments', 5),
    upload.errorHandler,
    taskController.addAttachments
);

/**
 * @route   DELETE /api/tasks/:id/attachments/:attachmentId
 * @desc    Remove attachment from task
 * @access  Private (Uploader, Giver, HOD)
 */
router.delete('/:id/attachments/:attachmentId',
    authenticateToken,
    mongoIdValidation,
    param('attachmentId').isMongoId().withMessage('Invalid attachment ID'),
    handleValidationErrors,
    taskController.removeAttachment
);

/**
 * @route   GET /api/tasks/:id/attachments/:attachmentId/download
 * @desc    Download task attachment
 * @access  Private (Task participants)
 */
router.get('/:id/attachments/:attachmentId/download',
    authenticateToken,
    mongoIdValidation,
    param('attachmentId').isMongoId().withMessage('Invalid attachment ID'),
    handleValidationErrors,
    taskController.downloadAttachment
);

/**
 * @route   GET /api/tasks/:id/attachments/:attachmentId/view
 * @desc    View task attachment in browser (for PDFs) - PUBLIC ROUTE
 * @access  Public (No authentication required for viewing)
 */
router.get('/:id/attachments/:attachmentId/view',
    mongoIdValidation,
    param('attachmentId').isMongoId().withMessage('Invalid attachment ID'),
    handleValidationErrors,
    taskController.viewAttachmentPublic
);

module.exports = router;
