// Export all middleware for easy importing
const { authenticateToken, optionalAuth } = require('./auth');
const { 
    authorizeRoles, 
    authorizePermissions, 
    authorizeDepartment, 
    authorizeTaskAccess,
    conditionalAuth 
} = require('./authorization');
const { 
    handleValidationErrors, 
    errorHandler, 
    notFound, 
    authRateLimit, 
    apiRateLimit 
} = require('./errorHandler');

module.exports = {
    // Authentication
    authenticateToken,
    optionalAuth,
    
    // Authorization
    authorizeRoles,
    authorizePermissions,
    authorizeDepartment,
    authorizeTaskAccess,
    conditionalAuth,
    
    // Error handling
    handleValidationErrors,
    errorHandler,
    notFound,
    authRateLimit,
    apiRateLimit
};
