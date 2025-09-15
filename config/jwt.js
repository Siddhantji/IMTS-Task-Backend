const jwt = require('jsonwebtoken');

const jwtConfig = {
    secret: process.env.JWT_SECRET || 'fallback_secret_key',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    
    // Generate access token
    generateToken: (payload) => {
        return jwt.sign(payload, jwtConfig.secret, {
            expiresIn: jwtConfig.expiresIn,
        });
    },

    // Generate refresh token
    generateRefreshToken: (payload) => {
        return jwt.sign(payload, jwtConfig.refreshSecret, {
            expiresIn: jwtConfig.refreshExpiresIn,
        });
    },

    // Verify access token
    verifyToken: (token) => {
        return jwt.verify(token, jwtConfig.secret);
    },

    // Verify refresh token
    verifyRefreshToken: (token) => {
        return jwt.verify(token, jwtConfig.refreshSecret);
    },

    // Get token from header
    getTokenFromHeader: (authHeader) => {
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
        return null;
    }
};

module.exports = jwtConfig;
