// Export all middleware for easy importing
const { authenticateToken, optionalAuth } = require('./auth');
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
    
    // Error handling
    handleValidationErrors,
    errorHandler,
    notFound,
    authRateLimit,
    apiRateLimit
};
