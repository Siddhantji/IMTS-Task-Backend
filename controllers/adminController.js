const { User, Department, Task, TaskHistory } = require('../models');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');
const reminderService = require('../services/reminderService');

/**
 * Get Admin Dashboard Overview - All departments
 */
const getAdminDashboard = async (req, res) => {
    try {
        // Security logging
        logger.info(`Admin Dashboard Access Attempt:`, {
            userId: req.user?.id,
            userEmail: req.user?.email,
            userRole: req.user?.role,
            timestamp: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });

        // Verify admin role
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            logger.warn(`Unauthorized Admin access attempt:`, {
                userId: req.user?.id,
                userEmail: req.user?.email,
                actualRole: adminUser?.role,
                requiredRole: 'admin',
                timestamp: new Date().toISOString()
            });
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        logger.info(`Admin Dashboard Access Granted:`, {
            adminId: adminUser._id,
            adminEmail: adminUser.email,
            timestamp: new Date().toISOString()
        });

        // Get all departments with statistics
        const departments = await Department.find({ isActive: true });
        
        // Get overall system statistics
        const totalUsers = await User.countDocuments({ isActive: true });
        const totalDepartments = departments.length;
        const totalTasks = await Task.countDocuments();
        const activeTasks = await Task.countDocuments({
            status: { $in: ['pending', 'in_progress', 'assigned'] }
        });
        const completedTasks = await Task.countDocuments({ status: 'completed' });
        const overdueTasks = await Task.countDocuments({
            status: { $in: ['pending', 'in_progress', 'assigned'] },
            deadline: { $lt: new Date() }
        });

        // Get department-wise statistics
        const departmentStats = await Promise.all(departments.map(async (department) => {
            const deptUsers = await User.countDocuments({
                department: department._id,
                isActive: true
            });
            
            const deptTasks = await Task.countDocuments({
                department: department._id
            });
            
            const deptActiveTasks = await Task.countDocuments({
                department: department._id,
                status: { $in: ['pending', 'in_progress', 'assigned'] }
            });
            
            const deptCompletedTasks = await Task.countDocuments({
                department: department._id,
                status: { $in: ['completed', 'approved'] }
            });
            
            const deptOverdueTasks = await Task.countDocuments({
                department: department._id,
                status: { $in: ['pending', 'in_progress', 'assigned'] },
                deadline: { $lt: new Date() }
            });

            return {
                department: {
                    _id: department._id,
                    name: department.name,
                    description: department.description
                },
                stats: {
                    totalUsers: deptUsers,
                    totalTasks: deptTasks,
                    activeTasks: deptActiveTasks,
                    completedTasks: deptCompletedTasks,
                    overdueTasks: deptOverdueTasks,
                    completionRate: deptTasks > 0 ? ((deptCompletedTasks / deptTasks) * 100).toFixed(2) : 0
                }
            };
        }));

        // Get recent activities across all departments
        const recentTasks = await Task.find()
            .populate('department', 'name')
            .populate('createdBy', 'name email')
            .populate('assignedTo.user', 'name email')
            .sort({ createdAt: -1 })
            .limit(10)
            .select('title status priority createdAt department createdBy assignedTo');

        res.json({
            success: true,
            data: {
                overallStats: {
                    totalUsers,
                    totalDepartments,
                    totalTasks,
                    activeTasks,
                    completedTasks,
                    overdueTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                },
                departmentStats,
                recentTasks
            }
        });
    } catch (error) {
        logger.error('Error getting admin dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching dashboard data'
        });
    }
};

/**
 * Get all departments
 */
const getAllDepartments = async (req, res) => {
    try {
        logger.info('Admin departments request received', {
            userId: req.user?.id,
            userRole: req.user?.role
        });

        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            logger.warn('Unauthorized admin access attempt', {
                userId: req.user?.id,
                userRole: adminUser?.role
            });
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        logger.info('Fetching departments from database');
        const departments = await Department.find()
            .populate('hod', 'name email')
            .sort({ name: 1 });

        logger.info(`Found ${departments.length} departments`);

        // Get statistics for each department
        const departmentsWithStats = await Promise.all(departments.map(async (department) => {
            try {
                logger.debug(`Processing stats for department: ${department.name}`);
                
                const [totalUsers, activeUsers, totalTasks, activeTasks, completedTasks] = await Promise.all([
                    User.countDocuments({ department: department._id }),
                    User.countDocuments({ department: department._id, isActive: true }),
                    Task.countDocuments({ department: department._id }),
                    Task.countDocuments({ 
                        department: department._id,
                        status: { $in: ['pending', 'in_progress', 'assigned', 'created'] }
                    }),
                    Task.countDocuments({ 
                        department: department._id,
                        status: { $in: ['completed', 'approved'] }
                    })
                ]);

                return {
                    ...department.toObject(),
                    stats: {
                        totalUsers,
                        activeUsers,
                        totalTasks,
                        activeTasks,
                        completedTasks,
                        completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : '0.00'
                    }
                };
            } catch (statsError) {
                logger.error(`Error getting stats for department ${department.name}:`, statsError);
                return {
                    ...department.toObject(),
                    stats: {
                        totalUsers: 0,
                        activeUsers: 0,
                        totalTasks: 0,
                        activeTasks: 0,
                        completedTasks: 0,
                        completionRate: '0.00'
                    }
                };
            }
        }));

        logger.info(`Successfully processed ${departmentsWithStats.length} departments with stats`);

        res.json({
            success: true,
            data: departmentsWithStats
        });
    } catch (error) {
        logger.error('Error getting departments:', error);
        logger.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching departments'
        });
    }
};

/**
 * Get specific department details
 */
const getDepartmentDetail = async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        const { departmentId } = req.params;
        
        const department = await Department.findById(departmentId)
            .populate('hod', 'name email');
        
        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found'
            });
        }

        // Get department statistics
        const totalUsers = await User.countDocuments({
            department: departmentId
        });
        
        const activeUsers = await User.countDocuments({
            department: departmentId,
            isActive: true
        });
        
        const totalTasks = await Task.countDocuments({
            department: departmentId
        });
        
        const activeTasks = await Task.countDocuments({ 
                        department: department._id,
                        status: { $in: ['completed', 'approved'] }
                    });
        
        const completedTasks = await Task.countDocuments({ 
                        department: department._id,
                        status: { $in: ['completed', 'approved'] }
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
                    totalUsers,
                    activeUsers,
                    totalTasks,
                    activeTasks,
                    completedTasks,
                    overdueTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                }
            }
        });
    } catch (error) {
        logger.error('Error getting department detail:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching department details'
        });
    }
};

/**
 * Get department tasks (same as HOD but admin can access any department)
 */
const getDepartmentTasks = async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        const { departmentId } = req.params;
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

        // Build filter query
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
            .populate('department', 'name')
            .populate('overviewers.user', 'name email')
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
 * Get department employees (same as HOD but admin can access any department)
 */
const getDepartmentEmployees = async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        const { departmentId } = req.params;
        const {
            page = 1,
            limit = 10,
            search,
            isActive,
            role,
            sortBy = 'name',
            sortOrder = 'asc'
        } = req.query;

        // Build filter query
        const filter = {
            department: departmentId
        };

        if (isActive !== undefined && isActive !== '') {
            filter.isActive = isActive === 'true';
        }

        if (role && role !== 'all') {
            filter.role = role;
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

        const employees = await User.find(filter)
            .populate('department', 'name')
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
 * Get comprehensive system report
 */
const getSystemReport = async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        const { startDate, endDate, departmentId } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Build department filter
        let deptFilter = {};
        if (departmentId && departmentId !== 'all') {
            deptFilter.department = mongoose.Types.ObjectId(departmentId);
        }

        // Task statistics by status
        const tasksByStatus = await Task.aggregate([
            {
                $match: {
                    ...deptFilter,
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

        // Task statistics by priority
        const tasksByPriority = await Task.aggregate([
            {
                $match: {
                    ...deptFilter,
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

        // Department-wise performance
        const departmentPerformance = await Task.aggregate([
            {
                $match: {
                    ...deptFilter,
                    ...dateFilter
                }
            },
            {
                $lookup: {
                    from: 'departments',
                    localField: 'department',
                    foreignField: '_id',
                    as: 'departmentInfo'
                }
            },
            {
                $unwind: '$departmentInfo'
            },
            {
                $group: {
                    _id: {
                        departmentId: '$department',
                        departmentName: '$departmentInfo.name',
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: {
                        departmentId: '$_id.departmentId',
                        departmentName: '$_id.departmentName'
                    },
                    statusBreakdown: {
                        $push: {
                            status: '$_id.status',
                            count: '$count'
                        }
                    },
                    totalTasks: { $sum: '$count' }
                }
            }
        ]);

        // User activity (task creation trends)
        const userActivity = await Task.aggregate([
            {
                $match: {
                    ...deptFilter,
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$createdAt"
                        }
                    },
                    tasksCreated: { $sum: 1 }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ]);

        res.json({
            success: true,
            data: {
                reportPeriod: {
                    startDate: startDate || 'All time',
                    endDate: endDate || 'Present',
                    department: departmentId || 'All departments'
                },
                tasksByStatus,
                tasksByPriority,
                departmentPerformance,
                userActivity
            }
        });
    } catch (error) {
        logger.error('Error getting system report:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while generating report'
        });
    }
};

/**
 * Toggle user access (activate/deactivate) - Admin can manage any user
 */
const toggleUserAccess = async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        const { userId } = req.params;
        const { isActive } = req.body;

        // Find the target user
        const targetUser = await User.findById(userId).populate('department', 'name');
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update user status
        targetUser.isActive = isActive;
        await targetUser.save();

        logger.info(`User ${targetUser.email} ${isActive ? 'activated' : 'deactivated'} by admin ${adminUser.email}`);

        res.json({
            success: true,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
            data: {
                user: {
                    id: targetUser._id,
                    name: targetUser.name,
                    email: targetUser.email,
                    isActive: targetUser.isActive,
                    department: targetUser.department
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
 * Get department performance report (same as HOD but for any department)
 */
const getDepartmentReport = async (req, res) => {
    try {
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        const { departmentId } = req.params;
        const { startDate, endDate } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Get department info
        const department = await Department.findById(departmentId);
        if (!department) {
            return res.status(404).json({
                success: false,
                message: 'Department not found'
            });
        }

        // Task statistics
        const totalTasks = await Task.countDocuments({
            department: departmentId,
            ...dateFilter
        });

        const tasksByStatus = await Task.aggregate([
            { $match: { department: mongoose.Types.ObjectId(departmentId), ...dateFilter } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const tasksByPriority = await Task.aggregate([
            { $match: { department: mongoose.Types.ObjectId(departmentId), ...dateFilter } },
            { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]);

        // Employee performance
        const employeePerformance = await Task.aggregate([
            { $match: { department: mongoose.Types.ObjectId(departmentId), ...dateFilter } },
            { $unwind: '$assignedTo' },
            { 
                $lookup: {
                    from: 'users',
                    localField: 'assignedTo.user',
                    foreignField: '_id',
                    as: 'userInfo'
                }
            },
            { $unwind: '$userInfo' },
            {
                $group: {
                    _id: {
                        userId: '$assignedTo.user',
                        userName: '$userInfo.name',
                        userEmail: '$userInfo.email'
                    },
                    totalTasks: { $sum: 1 },
                    completedTasks: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Task creation trends
        const taskTrends = await Task.aggregate([
            { $match: { department: mongoose.Types.ObjectId(departmentId), ...dateFilter } },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        res.json({
            success: true,
            data: {
                department: {
                    name: department.name,
                    description: department.description
                },
                reportPeriod: {
                    startDate: startDate || 'All time',
                    endDate: endDate || 'Present'
                },
                summary: {
                    totalTasks,
                    completedTasks: tasksByStatus.find(t => t._id === 'completed')?.count || 0,
                    activeTasks: tasksByStatus.filter(t => ['pending', 'in_progress', 'assigned'].includes(t._id)).reduce((sum, t) => sum + t.count, 0)
                },
                tasksByStatus,
                tasksByPriority,
                employeePerformance,
                taskTrends
            }
        });
    } catch (error) {
        logger.error('Error generating department report:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while generating report'
        });
    }
};

/**
 * Get reminder service status
 */
const getReminderServiceStatus = async (req, res) => {
    try {
        // Verify admin role
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        const status = reminderService.getStatus();

        res.json({
            success: true,
            data: {
                reminderService: status,
                message: `Reminder service is ${status.initialized ? 'running' : 'stopped'}`,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Error getting reminder service status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while getting reminder service status'
        });
    }
};

/**
 * Manually trigger approval reminders
 */
const triggerApprovalReminders = async (req, res) => {
    try {
        // Verify admin role
        const adminUser = await User.findById(req.user.id);
        
        if (!adminUser || adminUser.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin role required.'
            });
        }

        logger.info(`Manual approval reminder trigger requested by admin:`, {
            adminId: adminUser._id,
            adminEmail: adminUser.email,
            timestamp: new Date().toISOString()
        });

        // Trigger the reminder check
        await reminderService.triggerApprovalReminders();

        res.json({
            success: true,
            message: 'Approval reminder check triggered successfully',
            triggeredBy: adminUser.email,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error triggering approval reminders:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while triggering approval reminders'
        });
    }
};

module.exports = {
    getAdminDashboard,
    getAllDepartments,
    getDepartmentDetail,
    getDepartmentTasks,
    getDepartmentEmployees,
    getSystemReport,
    toggleUserAccess,
    getDepartmentReport,
    getReminderServiceStatus,
    triggerApprovalReminders
};