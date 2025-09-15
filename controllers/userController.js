const { User, Department } = require('../models');
const { logger } = require('../utils/logger');

/**
 * Get all users with filtering and pagination
 */
const getUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            role,
            department,
            search,
            isActive = true,
            sortBy = 'name',
            sortOrder = 'asc'
        } = req.query;

        // Build filter query
        const filter = {};

        // Other filters
        if (role) filter.role = role;
        if (isActive !== undefined) filter.isActive = isActive === 'true';

        // If departmentId provided, filter by it
        if (department) {
            filter.department = department;
        }

        // Search functionality
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const users = await User.find(filter)
            .populate('department', 'name')
            .select('-password -refreshTokens')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(filter);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalUsers: total,
                    hasNextPage: page * limit < total,
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get users',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get single user by ID
 */
const getUser = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id)
            .populate('department', 'name')
            .select('-password -refreshTokens');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if user can access this user's info
        if (req.user.role !== 'hod' && req.user.role !== 'admin' && 
            user.department._id.toString() !== req.user.department._id.toString() &&
            user._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Cannot access user from other department'
            });
        }

        res.json({
            success: true,
            data: { user }
        });

    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update user role (HOD only)
 */
const updateUserRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Can't change own role
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change your own role'
            });
        }

        const oldRole = user.role;
        user.role = role;
        await user.save();

        logger.info(`User role updated: ${user.email} from ${oldRole} to ${role} by ${req.user.email}`);

        const updatedUser = await User.findById(id)
            .populate('department', 'name')
            .select('-password -refreshTokens');

        res.json({
            success: true,
            message: 'User role updated successfully',
            data: { user: updatedUser }
        });

    } catch (error) {
        logger.error('Update user role error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user role',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Deactivate/Activate user (HOD only)
 */
const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Can't deactivate own account
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot deactivate your own account'
            });
        }

        user.isActive = !user.isActive;
        await user.save();

        logger.info(`User ${user.isActive ? 'activated' : 'deactivated'}: ${user.email} by ${req.user.email}`);

        const updatedUser = await User.findById(id)
            .populate('department', 'name')
            .select('-password -refreshTokens');

        res.json({
            success: true,
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
            data: { user: updatedUser }
        });

    } catch (error) {
        logger.error('Toggle user status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Transfer user to different department (HOD only)
 */
const transferUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { departmentId } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
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

        // Can't transfer own account
        if (user._id.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot transfer your own account'
            });
        }

        const oldDepartment = await Department.findById(user.department);
        user.department = departmentId;
        await user.save();

        logger.info(`User transferred: ${user.email} from ${oldDepartment.name} to ${department.name} by ${req.user.email}`);

        const updatedUser = await User.findById(id)
            .populate('department', 'name')
            .select('-password -refreshTokens');

        res.json({
            success: true,
            message: 'User transferred successfully',
            data: { user: updatedUser }
        });

    } catch (error) {
        logger.error('Transfer user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to transfer user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get all employees (for task assignment and general use)
 */
const getAllEmployees = async (req, res) => {
    try {
        const { departmentId } = req.query;

        // Build filter for all active users
        const filter = { 
            isActive: true 
        };

        // If departmentId provided, filter by it
        if (departmentId) {
            filter.department = departmentId;
        }

        const employees = await User.find(filter)
            .populate('department', 'name')
            .select('name email department role')
            .sort({ name: 1 });

        res.json({
            success: true,
            data: employees
        });

    } catch (error) {
        logger.error('Get all employees error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get employees',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get user statistics
 */
const getUserStats = async (req, res) => {
    try {
        const filter = {};

        // If not HOD or admin, limit to own department
        if (req.user.role !== 'hod' && req.user.role !== 'admin') {
            filter.department = req.user.department._id;
        }

        const stats = await User.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
                    inactive: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 1, 0] } },
                    employees: { $sum: { $cond: [{ $eq: ['$role', 'employee'] }, 1, 0] } },
                    hods: { $sum: { $cond: [{ $eq: ['$role', 'hod'] }, 1, 0] } },
                    admins: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } }
                }
            }
        ]);

        res.json({
            success: true,
            data: stats.length > 0 ? stats[0] : {
                total: 0,
                active: 0,
                inactive: 0,
                employees: 0,
                hods: 0,
                admins: 0
            }
        });

    } catch (error) {
        logger.error('Get user stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get all active departments
 */
const getDepartments = async (req, res) => {
    try {
        const departments = await Department.find({ isActive: true })
            .select('name _id')
            .sort({ name: 1 });

        res.json({
            success: true,
            data: departments,
            count: departments.length
        });

    } catch (error) {
        logger.error('Get departments error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get departments',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getUsers,
    getUser,
    updateUserRole,
    toggleUserStatus,
    transferUser,
    getAllEmployees,
    getUserStats,
    getDepartments
};
