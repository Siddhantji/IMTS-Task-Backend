const { logger } = require('../utils/logger');

/**
 * Role-based authorization middleware
 * @param {Array|String} allowedRoles - Array of roles or single role string
 */
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }
            
            // Flatten the allowedRoles array in case nested arrays are passed
            const roles = allowedRoles.flat();
            
            if (!roles.includes(req.user.role)) {
                logger.warn(`Access denied for user ${req.user.email} with role ${req.user.role}. Required roles: ${roles.join(', ')}`);
                return res.status(403).json({
                    success: false,
                    message: 'Insufficient permissions'
                });
            }
            
            next();
        } catch (error) {
            logger.error('Authorization error:', error);
            return res.status(500).json({
                success: false,
                message: 'Authorization failed'
            });
        }
    };
};

/**
 * Permission-based authorization middleware
 * @param {Array|String} requiredPermissions - Array of permissions or single permission string
 */
const authorizePermissions = (...requiredPermissions) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }
            
            const permissions = requiredPermissions.flat();
            const userPermissions = req.user.permissions || [];
            
            const hasPermission = permissions.some(permission => 
                userPermissions.includes(permission)
            );
            
            if (!hasPermission) {
                logger.warn(`Access denied for user ${req.user.email}. Required permissions: ${permissions.join(', ')}`);
                return res.status(403).json({
                    success: false,
                    message: 'Insufficient permissions'
                });
            }
            
            next();
        } catch (error) {
            logger.error('Permission authorization error:', error);
            return res.status(500).json({
                success: false,
                message: 'Authorization failed'
            });
        }
    };
};

/**
 * Department-based authorization middleware
 * Checks if user can access resources from a specific department
 */
const authorizeDepartment = (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        // Get department ID from various possible sources
        const departmentId = req.params.departmentId || 
                           req.body.department || 
                           req.query.departmentId;
        
        if (!departmentId) {
            return res.status(400).json({
                success: false,
                message: 'Department ID is required'
            });
        }
        
        // HODs can access any department (cross-department approval)
        if (req.user.role === 'hod') {
            return next();
        }
        
        // Other users can only access their own department
        if (req.user.department._id.toString() !== departmentId.toString()) {
            logger.warn(`Department access denied for user ${req.user.email} trying to access department ${departmentId}`);
            return res.status(403).json({
                success: false,
                message: 'Cannot access resources from other departments'
            });
        }
        
        next();
    } catch (error) {
        logger.error('Department authorization error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authorization failed'
        });
    }
};

/**
 * Task ownership authorization middleware
 * Checks if user can access/modify a specific task
 */
const authorizeTaskAccess = (accessType = 'read') => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }
            
            const { Task } = require('../models');
            const taskId = req.params.taskId || req.params.id;
            
            if (!taskId) {
                return res.status(400).json({
                    success: false,
                    message: 'Task ID is required'
                });
            }
            
            const task = await Task.findById(taskId)
                .populate('giver', '_id')
                .populate('assignedTo.user', '_id')
                .populate('observers', '_id');
            
            if (!task) {
                return res.status(404).json({
                    success: false,
                    message: 'Task not found'
                });
            }
            
            const userId = req.user._id.toString();
            const userRole = req.user.role;
            
            // Check access based on access type
            let hasAccess = false;
            
            if (accessType === 'read') {
                // Can read if: giver, assigned worker, observer, or HOD of same department
                hasAccess = task.giver._id.toString() === userId ||
                           task.assignedTo.some(assignment => assignment.user._id.toString() === userId) ||
                           task.observers.some(observer => observer._id.toString() === userId) ||
                           (userRole === 'hod' && task.department.toString() === req.user.department._id.toString());
            } else if (accessType === 'modify') {
                // Can modify if: giver or assigned worker
                hasAccess = task.giver._id.toString() === userId ||
                           task.assignedTo.some(assignment => assignment.user._id.toString() === userId);
            } else if (accessType === 'approve') {
                // Can approve if: giver or HOD
                hasAccess = task.giver._id.toString() === userId ||
                           userRole === 'hod';
            }
            
            if (!hasAccess) {
                logger.warn(`Task access denied for user ${req.user.email} on task ${taskId} with access type ${accessType}`);
                return res.status(403).json({
                    success: false,
                    message: 'Insufficient permissions to access this task'
                });
            }
            
            // Add task to request for use in controller
            req.task = task;
            next();
            
        } catch (error) {
            logger.error('Task authorization error:', error);
            return res.status(500).json({
                success: false,
                message: 'Authorization failed'
            });
        }
    };
};

/**
 * Conditional authorization - applies different rules based on user role
 */
const conditionalAuth = (roleRules) => {
    return (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }
            
            const userRole = req.user.role;
            const rule = roleRules[userRole];
            
            if (!rule) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied for your role'
                });
            }
            
            // Apply the rule function
            if (typeof rule === 'function') {
                return rule(req, res, next);
            }
            
            // If rule is just true, allow access
            if (rule === true) {
                return next();
            }
            
            // If rule is false or anything else, deny access
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
            
        } catch (error) {
            logger.error('Conditional authorization error:', error);
            return res.status(500).json({
                success: false,
                message: 'Authorization failed'
            });
        }
    };
};

module.exports = {
    authorizeRoles,
    authorizePermissions,
    authorizeDepartment,
    authorizeTaskAccess,
    conditionalAuth
};
