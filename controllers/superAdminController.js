const { User, Department, Task, TaskHistory } = require('../models');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * Get Super Admin Dashboard Overview
 * Super Admin can see system-wide statistics
 */
const getSuperAdminDashboard = async (req, res) => {
    try {
        // Overall system statistics
        const totalDepartments = await Department.countDocuments();
        const totalUsers = await User.countDocuments({ isActive: true });
        const totalTasks = await Task.countDocuments();
        const activeTasks = await Task.countDocuments({
            status: { $in: ['pending', 'in_progress'] }
        });
        const completedTasks = await Task.countDocuments({ status: 'completed' });
        const overdueTasks = await Task.countDocuments({
            status: { $in: ['pending', 'in_progress'] },
            deadline: { $lt: new Date() }
        });

        // User distribution by role
        const usersByRole = await User.aggregate([
            { $match: { isActive: true } },
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Recent activities (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentTasks = await Task.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });

        const recentUsers = await User.countDocuments({
            createdAt: { $gte: thirtyDaysAgo }
        });

        res.json({
            success: true,
            data: {
                systemStats: {
                    totalDepartments,
                    totalUsers,
                    totalTasks,
                    activeTasks,
                    completedTasks,
                    overdueTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                },
                usersByRole,
                recentActivities: {
                    recentTasks,
                    recentUsers
                }
            }
        });
    } catch (error) {
        logger.error('Error getting Super Admin dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching dashboard data'
        });
    }
};

/**
 * Get all departments with statistics
 */
const getAllDepartments = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            sortBy = 'name',
            sortOrder = 'asc'
        } = req.query;

        // Build filter query
        const filter = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const departments = await Department.find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        const totalDepartments = await Department.countDocuments(filter);

        // Get statistics for each department
        const departmentsWithStats = await Promise.all(departments.map(async (dept) => {
            const totalEmployees = await User.countDocuments({
                department: dept._id,
                isActive: true
            });

            const totalHODs = await User.countDocuments({
                department: dept._id,
                role: 'hod',
                isActive: true
            });

            const departmentUserIds = await User.find({ 
                department: dept._id 
            }).select('_id');
            
            const userIds = departmentUserIds.map(user => user._id);

            const totalTasks = await Task.countDocuments({
                'assignedTo.user': { $in: userIds }
            });

            const completedTasks = await Task.countDocuments({
                'assignedTo.user': { $in: userIds },
                status: 'completed'
            });

            const activeTasks = await Task.countDocuments({
                'assignedTo.user': { $in: userIds },
                status: { $in: ['pending', 'in_progress'] }
            });

            const overdueTasks = await Task.countDocuments({
                'assignedTo.user': { $in: userIds },
                status: { $in: ['pending', 'in_progress'] },
                deadline: { $lt: new Date() }
            });

            return {
                ...dept.toObject(),
                stats: {
                    totalEmployees,
                    totalHODs,
                    totalTasks,
                    completedTasks,
                    activeTasks,
                    overdueTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                }
            };
        }));

        res.json({
            success: true,
            data: {
                departments: departmentsWithStats,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalDepartments / parseInt(limit)),
                    totalDepartments,
                    hasNextPage: skip + departments.length < totalDepartments,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (error) {
        logger.error('Error getting all departments:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching departments'
        });
    }
};

/**
 * Get all users across departments
 */
const getAllUsers = async (req, res) => {
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
        if (role) filter.role = role;
        if (department) filter.department = department;
        if (isActive !== undefined) filter.isActive = isActive === 'true';

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

        const totalUsers = await User.countDocuments(filter);

        // Get task statistics for each user
        const usersWithStats = await Promise.all(users.map(async (user) => {
            const totalTasks = await Task.countDocuments({
                'assignedTo.user': user._id
            });
            
            const completedTasks = await Task.countDocuments({
                'assignedTo.user': user._id,
                status: 'completed'
            });
            
            const activeTasks = await Task.countDocuments({
                'assignedTo.user': user._id,
                status: { $in: ['pending', 'in_progress'] }
            });

            const overdueTasks = await Task.countDocuments({
                'assignedTo.user': user._id,
                status: { $in: ['pending', 'in_progress'] },
                deadline: { $lt: new Date() }
            });

            return {
                ...user.toObject(),
                taskStats: {
                    totalTasks,
                    completedTasks,
                    activeTasks,
                    overdueTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                }
            };
        }));

        res.json({
            success: true,
            data: {
                users: usersWithStats,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalUsers / parseInt(limit)),
                    totalUsers,
                    hasNextPage: skip + users.length < totalUsers,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (error) {
        logger.error('Error getting all users:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching users'
        });
    }
};

/**
 * Get all tasks across departments
 */
const getAllTasks = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            priority,
            department,
            search,
            assignedTo,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            startDate,
            endDate
        } = req.query;

        // Build filter query
        const filter = {};
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (assignedTo) filter['assignedTo.user'] = assignedTo;

        // Department filter
        if (department) {
            const departmentUsers = await User.find({ department }).select('_id');
            const userIds = departmentUsers.map(user => user._id);
            filter['assignedTo.user'] = { $in: userIds };
        }

        // Date range filter
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Search functionality
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const tasks = await Task.find(filter)
            .populate('assignedTo.user', 'name email')
            .populate({
                path: 'assignedTo.user',
                populate: {
                    path: 'department',
                    select: 'name'
                }
            })
            .populate('createdBy', 'name email')
            .populate('overviewer', 'name email')
            .select('-attachments') // Exclude large attachment data
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        const totalTasks = await Task.countDocuments(filter);

        res.json({
            success: true,
            data: {
                tasks,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalTasks / parseInt(limit)),
                    totalTasks,
                    hasNextPage: skip + tasks.length < totalTasks,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (error) {
        logger.error('Error getting all tasks:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching tasks'
        });
    }
};

/**
 * Manage user access across all departments
 */
const manageUserAccess = async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive, role } = req.body;

        // Find the target user
        const targetUser = await User.findById(userId).populate('department');
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update user status and/or role
        if (isActive !== undefined) {
            targetUser.isActive = isActive;
        }
        
        if (role && ['employee', 'hod', 'admin', 'super_admin'].includes(role)) {
            targetUser.role = role;
        }

        await targetUser.save();

        logger.info(`User ${targetUser.email} updated - isActive: ${targetUser.isActive}, role: ${targetUser.role}`);

        res.json({
            success: true,
            message: 'User updated successfully',
            data: {
                user: {
                    id: targetUser._id,
                    name: targetUser.name,
                    email: targetUser.email,
                    role: targetUser.role,
                    isActive: targetUser.isActive,
                    department: targetUser.department
                }
            }
        });
    } catch (error) {
        logger.error('Error managing user access:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating user'
        });
    }
};

/**
 * Get comprehensive system reports
 */
const getSystemReports = async (req, res) => {
    try {
        const { startDate, endDate, reportType = 'overview' } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        let reportData = {};

        if (reportType === 'overview' || reportType === 'all') {
            // Overall system statistics
            const totalDepartments = await Department.countDocuments();
            const totalUsers = await User.countDocuments({ isActive: true });
            const totalTasks = await Task.countDocuments(dateFilter);
            
            const tasksByStatus = await Task.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]);

            reportData.overview = {
                totalDepartments,
                totalUsers,
                totalTasks,
                tasksByStatus
            };
        }

        if (reportType === 'departments' || reportType === 'all') {
            // Department-wise performance
            const departments = await Department.find();
            const departmentPerformance = await Promise.all(departments.map(async (dept) => {
                const departmentUsers = await User.find({ department: dept._id }).select('_id');
                const userIds = departmentUsers.map(user => user._id);

                const taskStats = await Task.aggregate([
                    {
                        $match: {
                            'assignedTo.user': { $in: userIds },
                            ...dateFilter
                        }
                    },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]);

                const totalTasks = taskStats.reduce((sum, stat) => sum + stat.count, 0);
                const completedTasks = taskStats.find(stat => stat._id === 'completed')?.count || 0;

                return {
                    department: dept,
                    stats: {
                        totalTasks,
                        completedTasks,
                        completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0,
                        tasksByStatus: taskStats
                    }
                };
            }));

            reportData.departments = departmentPerformance.sort((a, b) => 
                parseFloat(b.stats.completionRate) - parseFloat(a.stats.completionRate)
            );
        }

        if (reportType === 'performance' || reportType === 'all') {
            // Top performers
            const allUsers = await User.find({ 
                role: 'employee',
                isActive: true 
            }).populate('department');

            const userPerformance = await Promise.all(allUsers.map(async (user) => {
                const taskStats = await Task.aggregate([
                    {
                        $match: {
                            'assignedTo.user': user._id,
                            ...dateFilter
                        }
                    },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 }
                        }
                    }
                ]);

                const totalTasks = taskStats.reduce((sum, stat) => sum + stat.count, 0);
                const completedTasks = taskStats.find(stat => stat._id === 'completed')?.count || 0;

                return {
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        department: user.department
                    },
                    stats: {
                        totalTasks,
                        completedTasks,
                        completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                    }
                };
            }));

            // Sort by different metrics
            const topPerformers = userPerformance
                .filter(up => up.stats.totalTasks > 0)
                .sort((a, b) => parseFloat(b.stats.completionRate) - parseFloat(a.stats.completionRate))
                .slice(0, 10);

            const mostTasksAssigned = userPerformance
                .sort((a, b) => b.stats.totalTasks - a.stats.totalTasks)
                .slice(0, 10);

            const mostTasksCompleted = userPerformance
                .sort((a, b) => b.stats.completedTasks - a.stats.completedTasks)
                .slice(0, 10);

            reportData.performance = {
                topPerformers,
                mostTasksAssigned,
                mostTasksCompleted
            };
        }

        res.json({
            success: true,
            data: {
                reportType,
                reportPeriod: {
                    startDate: startDate || 'All time',
                    endDate: endDate || 'Present'
                },
                ...reportData
            }
        });
    } catch (error) {
        logger.error('Error getting system reports:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while generating reports'
        });
    }
};

module.exports = {
    getSuperAdminDashboard,
    getAllDepartments,
    getAllUsers,
    getAllTasks,
    manageUserAccess,
    getSystemReports
};