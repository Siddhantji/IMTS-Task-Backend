const { User, Department, Task, TaskHistory } = require('../models');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * Get HOD Dashboard Overview
 * HOD can see their department's statistics
 */
const getHODDashboard = async (req, res) => {
    try {
        // Security logging
        logger.info(`HOD Dashboard Access Attempt:`, {
            userId: req.user?.id,
            userEmail: req.user?.email,
            userRole: req.user?.role,
            userDepartment: req.user?.department,
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Get HOD's department from authenticated user
        const hodUser = await User.findById(req.user.id).populate('department');
        
        if (!hodUser || hodUser.role !== 'hod') {
            logger.warn(`Unauthorized HOD access attempt:`, {
                userId: req.user?.id,
                userEmail: req.user?.email,
                actualRole: hodUser?.role,
                requiredRole: 'hod',
                timestamp: new Date().toISOString()
            });
            return res.status(403).json({
                success: false,
                message: 'Access denied. HOD role required.'
            });
        }

        const departmentId = hodUser.department._id;
        const department = hodUser.department;
        
        logger.info(`HOD Dashboard Access Granted:`, {
            hodId: hodUser._id,
            hodEmail: hodUser.email,
            departmentId: departmentId,
            departmentName: department.name,
            timestamp: new Date().toISOString()
        });
        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found'
            });
        }

        // Get department statistics using direct department filtering
        const totalEmployees = await User.countDocuments({
            department: departmentId,
            role: 'employee',
            isActive: true
        });

        // Use direct department filtering for tasks - more accurate and efficient
        const totalTasks = await Task.countDocuments({
            department: departmentId
        });

        const activeTasks = await Task.countDocuments({
            department: departmentId,
            status: { $in: ['pending', 'in_progress', 'assigned'] }
        });

        const completedTasks = await Task.countDocuments({
            department: departmentId,
            status: 'completed'
        });

        const overdueTasks = await Task.countDocuments({
            department: departmentId,
            status: { $in: ['pending', 'in_progress', 'assigned'] },
            deadline: { $lt: new Date() }
        });

        res.json({
            success: true,
            data: {
                department,
                stats: {
                    totalEmployees,
                    totalTasks,
                    activeTasks,
                    completedTasks,
                    overdueTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                }
            }
        });
    } catch (error) {
        logger.error('Error getting HOD dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching dashboard data'
        });
    }
};

/**
 * Get all tasks in a specific department
 */
const getDepartmentTasks = async (req, res) => {
    try {
        // Security logging
        logger.info(`HOD Tasks Access Attempt:`, {
            userId: req.user?.id,
            userEmail: req.user?.email,
            userRole: req.user?.role,
            filters: req.query,
            timestamp: new Date().toISOString()
        });

        // Get HOD's department from authenticated user
        const hodUser = await User.findById(req.user.id).populate('department');
        
        if (!hodUser || hodUser.role !== 'hod') {
            logger.warn(`Unauthorized HOD tasks access:`, {
                userId: req.user?.id,
                userEmail: req.user?.email,
                actualRole: hodUser?.role,
                timestamp: new Date().toISOString()
            });
            return res.status(403).json({
                success: false,
                message: 'Access denied. HOD role required.'
            });
        }

        const departmentId = hodUser.department._id;
        
        logger.info(`HOD Tasks Access Granted:`, {
            hodId: hodUser._id,
            departmentId: departmentId,
            departmentName: hodUser.department.name,
            filters: req.query,
            timestamp: new Date().toISOString()
        });
        
        const {
            page = 1,
            limit = 10,
            status,
            priority,
            search,
            assignedTo,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            startDate,
            endDate
        } = req.query;

        // Build filter query - use direct department filtering
        const filter = {
            department: departmentId
        };

        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (assignedTo) filter['assignedTo.user'] = assignedTo;

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
            .populate('createdBy', 'name email')
            .populate('overviewers.user', 'name email')
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
        logger.error('Error getting department tasks:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching tasks'
        });
    }
};

/**
 * Get all employees in a specific department
 */
const getDepartmentEmployees = async (req, res) => {
    try {
        // Security logging
        logger.info(`HOD Employees Access Attempt:`, {
            userId: req.user?.id,
            userEmail: req.user?.email,
            filters: req.query,
            timestamp: new Date().toISOString()
        });

        // Get HOD's department from authenticated user
        const hodUser = await User.findById(req.user.id).populate('department');
        
        if (!hodUser || hodUser.role !== 'hod') {
            logger.warn(`Unauthorized HOD employees access:`, {
                userId: req.user?.id,
                userEmail: req.user?.email,
                actualRole: hodUser?.role,
                timestamp: new Date().toISOString()
            });
            return res.status(403).json({
                success: false,
                message: 'Access denied. HOD role required.'
            });
        }

        const departmentId = hodUser.department._id;
        
        logger.info(`HOD Employees Access Granted:`, {
            hodId: hodUser._id,
            departmentId: departmentId,
            departmentName: hodUser.department.name,
            timestamp: new Date().toISOString()
        });
        
        const {
            page = 1,
            limit = 10,
            search,
            isActive = true,
            sortBy = 'name',
            sortOrder = 'asc'
        } = req.query;

        // Build filter query
        const filter = {
            department: departmentId,
            role: 'employee'
        };

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

        const employees = await User.find(filter)
            .select('-password -refreshTokens')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        const totalEmployees = await User.countDocuments(filter);

        // Get task statistics for each employee
        const employeesWithStats = await Promise.all(employees.map(async (employee) => {
            const totalTasks = await Task.countDocuments({
                'assignedTo.user': employee._id
            });
            
            const completedTasks = await Task.countDocuments({
                'assignedTo.user': employee._id,
                status: 'completed'
            });
            
            const activeTasks = await Task.countDocuments({
                'assignedTo.user': employee._id,
                status: { $in: ['pending', 'in_progress'] }
            });

            const overdueTasks = await Task.countDocuments({
                'assignedTo.user': employee._id,
                status: { $in: ['pending', 'in_progress'] },
                deadline: { $lt: new Date() }
            });

            return {
                ...employee.toObject(),
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
                employees: employeesWithStats,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalEmployees / parseInt(limit)),
                    totalEmployees,
                    hasNextPage: skip + employees.length < totalEmployees,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (error) {
        logger.error('Error getting department employees:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching employees'
        });
    }
};

/**
 * Toggle user access (activate/deactivate)
 */
const toggleUserAccess = async (req, res) => {
    try {
        // Get HOD's department from authenticated user
        const hodUser = await User.findById(req.user.id).populate('department');
        
        if (!hodUser || hodUser.role !== 'hod') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. HOD role required.'
            });
        }

        const { userId } = req.params;
        const { isActive } = req.body;

        // Find the target user
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Ensure the target user belongs to HOD's department
        if (targetUser.department.toString() !== hodUser.department._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You can only manage employees in your department.'
            });
        }

        // Update user status
        targetUser.isActive = isActive;
        await targetUser.save();

        logger.info(`User ${targetUser.email} ${isActive ? 'activated' : 'deactivated'}`);

        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: {
                user: {
                    id: targetUser._id,
                    name: targetUser.name,
                    email: targetUser.email,
                    isActive: targetUser.isActive
                }
            }
        });
    } catch (error) {
        logger.error('Error toggling user access:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating user access'
        });
    }
};

/**
 * Get department performance report
 */
const getDepartmentReport = async (req, res) => {
    try {
        // Get HOD's department from authenticated user
        const hodUser = await User.findById(req.user.id).populate('department');
        
        if (!hodUser || hodUser.role !== 'hod') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. HOD role required.'
            });
        }

        const departmentId = hodUser.department._id;
        const department = hodUser.department;
        const { startDate, endDate } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        const departmentUsers = await User.find({ 
            department: departmentId,
            role: 'employee' 
        }).select('_id name email');

        // Task statistics by status - use direct department filtering
        const tasksByStatus = await Task.aggregate([
            {
                $match: {
                    department: departmentId,
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

        // Task statistics by priority - use direct department filtering
        const tasksByPriority = await Task.aggregate([
            {
                $match: {
                    department: departmentId,
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Employee performance - show tasks assigned to each employee
        const employeePerformance = await Promise.all(departmentUsers.map(async (employee) => {
            const taskStats = await Task.aggregate([
                {
                    $match: {
                        'assignedTo.user': employee._id,
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
            const overdueTasks = await Task.countDocuments({
                'assignedTo.user': employee._id,
                status: { $in: ['pending', 'in_progress', 'assigned'] },
                deadline: { $lt: new Date() },
                ...dateFilter
            });

            return {
                employee: {
                    id: employee._id,
                    name: employee.name,
                    email: employee.email
                },
                stats: {
                    totalTasks,
                    completedTasks,
                    overdueTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                }
            };
        }));

        res.json({
            success: true,
            data: {
                department,
                reportPeriod: {
                    startDate: startDate || 'All time',
                    endDate: endDate || 'Present'
                },
                tasksByStatus,
                tasksByPriority,
                employeePerformance: employeePerformance.sort((a, b) => 
                    parseFloat(b.stats.completionRate) - parseFloat(a.stats.completionRate)
                )
            }
        });
    } catch (error) {
        logger.error('Error getting department report:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while generating report'
        });
    }
};

module.exports = {
    getHODDashboard,
    getDepartmentTasks,
    getDepartmentEmployees,
    toggleUserAccess,
    getDepartmentReport
};