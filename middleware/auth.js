const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { logger } = require('../utils/logger');

/**
 * Authentication middleware to verify JWT tokens
 */
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }
        
        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user from database
        const user = await User.findById(decoded.id)
            .select('-password')
            .populate('department', 'name');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }
        
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'User account is deactivated'
            });
        }
        
        // Add user to request object
        req.user = user;
        next();
        
    } catch (error) {
        logger.error('Authentication error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        
        if (!token) {
            req.user = null;
            return next();
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id)
            .select('-password')
            .populate('department', 'name');
        
        req.user = user && user.isActive ? user : null;
        next();
        
    } catch (error) {
        // For optional auth, we don't fail on token errors
        req.user = null;
        next();
    }
};

module.exports = {
    authenticateToken,
    optionalAuth
};
