const { User, Department } = require('../models');
const { logger } = require('../utils/logger');
const emailConfig = require('../config/email');

/**
 * Register a new user
 */
const register = async (req, res) => {
    try {
        const { name, email, password, phone, role, departmentId } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }
        
        // Verify department exists
        const department = await Department.findById(departmentId);
        if (!department) {
            return res.status(400).json({
                success: false,
                message: 'Invalid department'
            });
        }
        
        // Create new user
        const user = new User({
            name,
            email,
            password,
            phone,
            role,
            department: departmentId
        });
        
        await user.save();
        
        // Generate JWT token
        const token = user.generateJWT();
        const refreshToken = user.generateRefreshToken();
        
        // Save refresh token
        user.refreshTokens.push({ token: refreshToken });
        await user.save();
        
        // Send welcome email
        try {
            await emailConfig.sendEmail(emailConfig.templates.welcomeEmail({
                name: user.name,
                email: user.email,
                role: user.role,
                department: department.name
            }));
        } catch (emailError) {
            logger.error('Failed to send welcome email:', emailError);
            // Don't fail registration if email fails
        }
        
        // Remove password from response
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.refreshTokens;
        
        logger.info(`New user registered: ${email} with role ${role}`);
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: userResponse,
                token,
                refreshToken
            }
        });
        
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Login user
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user with password field
        const user = await User.findByEmail(email)
            .select('+password')
            .populate('department', 'name code');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Check if user is active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }
        
        // Check password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        
        // Update last login
        user.lastLogin = new Date();
        
        // Generate tokens
        const token = user.generateJWT();
        const refreshToken = user.generateRefreshToken();
        
        // Save refresh token
        user.refreshTokens.push({ token: refreshToken });
        
        // Clean up old refresh tokens (keep only last 5)
        if (user.refreshTokens.length > 5) {
            user.refreshTokens = user.refreshTokens.slice(-5);
        }
        
        await user.save();
        
        // Remove sensitive data from response
        const userResponse = user.toObject();
        delete userResponse.password;
        delete userResponse.refreshTokens;
        
        logger.info(`User logged in: ${email}`);
        
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: userResponse,
                token,
                refreshToken
            }
        });
        
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get user profile
 */
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('department', 'name code description')
            .select('-password -refreshTokens');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            data: { user }
        });
        
    } catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update user profile
 */
const updateProfile = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const userId = req.user._id;
        
        // Find and update user
        const user = await User.findByIdAndUpdate(
            userId,
            { 
                name: name || req.user.name,
                phone: phone || req.user.phone
            },
            { 
                new: true, 
                runValidators: true 
            }
        ).populate('department', 'name code').select('-password -refreshTokens');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        logger.info(`Profile updated for user: ${user.email}`);
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: { user }
        });
        
    } catch (error) {
        logger.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Change password
 */
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;
        
        // Get user with password
        const user = await User.findById(userId).select('+password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }
        
        // Update password
        user.password = newPassword;
        
        // Clear all refresh tokens (force re-login)
        user.refreshTokens = [];
        
        await user.save();
        
        logger.info(`Password changed for user: ${user.email}`);
        
        res.json({
            success: true,
            message: 'Password changed successfully. Please login again.'
        });
        
    } catch (error) {
        logger.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to change password',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Refresh token
 */
const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token is required'
            });
        }
        
        // Verify refresh token
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        
        // Find user and check if refresh token exists
        const user = await User.findById(decoded.id);
        if (!user || !user.refreshTokens.some(rt => rt.token === refreshToken)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }
        
        // Generate new tokens
        const newToken = user.generateJWT();
        const newRefreshToken = user.generateRefreshToken();
        
        // Replace old refresh token with new one
        user.refreshTokens = user.refreshTokens.filter(rt => rt.token !== refreshToken);
        user.refreshTokens.push({ token: newRefreshToken });
        
        await user.save();
        
        res.json({
            success: true,
            data: {
                token: newToken,
                refreshToken: newRefreshToken
            }
        });
        
    } catch (error) {
        logger.error('Refresh token error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
};

/**
 * Logout user
 */
const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const userId = req.user._id;
        
        // Remove refresh token from user
        if (refreshToken) {
            await User.findByIdAndUpdate(userId, {
                $pull: { refreshTokens: { token: refreshToken } }
            });
        }
        
        logger.info(`User logged out: ${req.user.email}`);
        
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
        
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Logout from all devices
 */
const logoutAll = async (req, res) => {
    try {
        const userId = req.user._id;
        
        // Remove all refresh tokens
        await User.findByIdAndUpdate(userId, {
            refreshTokens: []
        });
        
        logger.info(`User logged out from all devices: ${req.user.email}`);
        
        res.json({
            success: true,
            message: 'Logged out from all devices successfully'
        });
        
    } catch (error) {
        logger.error('Logout all error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    register,
    login,
    getProfile,
    updateProfile,
    changePassword,
    refreshToken,
    logout,
    logoutAll
};
