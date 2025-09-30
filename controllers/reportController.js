const { User, Department, Task, TaskHistory } = require('../models');
const { logger } = require('../utils/logger');
const mongoose = require('mongoose');

/**
 * Generate detailed analytics report
 * Can be filtered by department and date range
 */
const generateAnalyticsReport = async (req, res) => {
    try {
        const { startDate, endDate, departmentId } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Get users based on department filter
        let departmentFilter = {};
        if (departmentId) {
            departmentFilter = { department: departmentId };
        }

        const users = await User.find({
            ...departmentFilter,
            isActive: true
        }).populate('department');

        const userIds = users.map(user => user._id);

        // Task completion trends over time (monthly)
        const taskTrends = await Task.aggregate([
            {
                $match: {
                    'assignedTo.user': { $in: userIds },
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id.year': 1, '_id.month': 1 }
            }
        ]);

        // Priority distribution
        const priorityDistribution = await Task.aggregate([
            {
                $match: {
                    'assignedTo.user': { $in: userIds },
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 },
                    completed: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Average task completion time
        const completionTimes = await Task.aggregate([
            {
                $match: {
                    'assignedTo.user': { $in: userIds },
                    status: 'completed',
                    ...dateFilter
                }
            },
            {
                $project: {
                    completionTime: {
                        $subtract: ['$updatedAt', '$createdAt']
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    avgCompletionTime: { $avg: '$completionTime' },
                    minCompletionTime: { $min: '$completionTime' },
                    maxCompletionTime: { $max: '$completionTime' }
                }
            }
        ]);

        // Department-wise statistics (if not filtered by specific department)
        let departmentStats = [];
        if (!departmentId) {
            const departments = await Department.find();

            departmentStats = await Promise.all(departments.map(async (dept) => {
                const deptUsers = await User.find({ department: dept._id }).select('_id');
                const deptUserIds = deptUsers.map(u => u._id);

                const deptTasks = await Task.aggregate([
                    {
                        $match: {
                            'assignedTo.user': { $in: deptUserIds },
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

                const totalTasks = deptTasks.reduce((sum, task) => sum + task.count, 0);
                const completedTasks = deptTasks.find(task => task._id === 'completed')?.count || 0;

                return {
                    department: dept,
                    totalTasks,
                    completedTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0,
                    tasksByStatus: deptTasks
                };
            }));
        }

        // Task overdue analysis
        const overdueAnalysis = await Task.aggregate([
            {
                $match: {
                    'assignedTo.user': { $in: userIds },
                    status: { $in: ['pending', 'in_progress'] },
                    deadline: { $lt: new Date() }
                }
            },
            {
                $project: {
                    overdueDays: {
                        $divide: [
                            { $subtract: [new Date(), '$deadline'] },
                            1000 * 60 * 60 * 24
                        ]
                    },
                    priority: 1
                }
            },
            {
                $group: {
                    _id: '$priority',
                    count: { $sum: 1 },
                    avgOverdueDays: { $avg: '$overdueDays' }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                reportPeriod: {
                    startDate: startDate || 'All time',
                    endDate: endDate || 'Present'
                },
                taskTrends,
                priorityDistribution,
                completionTimes: completionTimes[0] || {
                    avgCompletionTime: 0,
                    minCompletionTime: 0,
                    maxCompletionTime: 0
                },
                departmentStats,
                overdueAnalysis
            }
        });
    } catch (error) {
        logger.error('Error generating analytics report:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while generating analytics report'
        });
    }
};

/**
 * Export report data in various formats
 */
const exportReport = async (req, res) => {
    try {
        const { format = 'json', reportType, startDate, endDate, departmentId } = req.query;

        // Build department filter
        let departmentFilter = {};
        if (departmentId) {
            departmentFilter = { department: departmentId };
        }

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        let exportData = {};

        if (reportType === 'tasks' || !reportType) {
            const users = await User.find(departmentFilter).select('_id');
            const userIds = users.map(user => user._id);

            const tasks = await Task.find({
                'assignedTo.user': { $in: userIds },
                ...dateFilter
            })
            .populate('assignedTo.user', 'name email')
            .populate({
                path: 'assignedTo.user',
                populate: {
                    path: 'department',
                    select: 'name'
                }
            })
            .populate('createdBy', 'name email')
            .select('title description status priority createdAt deadline');

            exportData.tasks = tasks;
        }

        if (reportType === 'users' || !reportType) {
            const users = await User.find({
                ...departmentFilter,
                isActive: true
            })
            .populate('department', 'name')
            .select('name email role createdAt lastLogin');

            // Add task statistics for each user
            const usersWithStats = await Promise.all(users.map(async (user) => {
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
                    ...user.toObject(),
                    taskStats: {
                        totalTasks,
                        completedTasks,
                        completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0
                    }
                };
            }));

            exportData.users = usersWithStats;
        }

        // Set appropriate headers for different formats
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=report_${Date.now()}.csv`);
            
            // Convert to CSV format (simplified)
            let csvData = '';
            if (exportData.tasks) {
                csvData += 'Task Title,Status,Priority,Assigned To,Department,Created Date,Deadline\n';
                exportData.tasks.forEach(task => {
                    const assignedUser = task.assignedTo[0]?.user || {};
                    csvData += `"${task.title}","${task.status}","${task.priority}","${assignedUser.name || ''}","${assignedUser.department?.name || ''}","${task.createdAt}","${task.deadline}"\n`;
                });
            }
            
            res.send(csvData);
        } else {
            // JSON format
            res.json({
                success: true,
                data: {
                    exportDate: new Date(),
                    reportPeriod: {
                        startDate: startDate || 'All time',
                        endDate: endDate || 'Present'
                    },
                    ...exportData
                }
            });
        }
    } catch (error) {
        logger.error('Error exporting report:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while exporting report'
        });
    }
};

/**
 * Get performance metrics for specific user or department
 */
const getPerformanceMetrics = async (req, res) => {
    try {
        const { userId: targetUserId, departmentId, timeframe = '30' } = req.query;

        // Calculate date range
        const daysAgo = parseInt(timeframe);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);

        let userFilter = {};
        if (targetUserId) {
            userFilter._id = targetUserId;
        }
        if (departmentId) {
            userFilter.department = departmentId;
        }

        const users = await User.find(userFilter).populate('department');
        const userIds = users.map(u => u._id);

        // Performance metrics
        const metrics = await Task.aggregate([
            {
                $match: {
                    'assignedTo.user': { $in: userIds },
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        user: '$assignedTo.user',
                        status: '$status'
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.user',
                    taskCounts: {
                        $push: {
                            status: '$_id.status',
                            count: '$count'
                        }
                    }
                }
            }
        ]);

        // Calculate completion rates and other metrics
        const performanceData = await Promise.all(users.map(async (user) => {
            const userMetrics = metrics.find(m => m._id.toString() === user._id.toString());
            
            let totalTasks = 0;
            let completedTasks = 0;
            let inProgressTasks = 0;
            let pendingTasks = 0;

            if (userMetrics) {
                userMetrics.taskCounts.forEach(tc => {
                    totalTasks += tc.count;
                    if (tc.status === 'completed') completedTasks = tc.count;
                    if (tc.status === 'in_progress') inProgressTasks = tc.count;
                    if (tc.status === 'pending') pendingTasks = tc.count;
                });
            }

            // Average completion time for completed tasks
            const avgCompletionTime = await Task.aggregate([
                {
                    $match: {
                        'assignedTo.user': user._id,
                        status: 'completed',
                        createdAt: { $gte: startDate }
                    }
                },
                {
                    $project: {
                        completionTime: {
                            $subtract: ['$updatedAt', '$createdAt']
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        avgTime: { $avg: '$completionTime' }
                    }
                }
            ]);

            return {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    department: user.department
                },
                metrics: {
                    totalTasks,
                    completedTasks,
                    inProgressTasks,
                    pendingTasks,
                    completionRate: totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(2) : 0,
                    avgCompletionTime: avgCompletionTime[0]?.avgTime || 0
                }
            };
        }));

        res.json({
            success: true,
            data: {
                timeframe: `${timeframe} days`,
                performanceData: performanceData.sort((a, b) => 
                    parseFloat(b.metrics.completionRate) - parseFloat(a.metrics.completionRate)
                )
            }
        });
    } catch (error) {
        logger.error('Error getting performance metrics:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching performance metrics'
        });
    }
};

/**
 * Get top performers across system or department
 */
const getTopPerformers = async (req, res) => {
    try {
        const { departmentId, limit = 10, timeframe = '30' } = req.query;

        // Calculate date range
        const daysAgo = parseInt(timeframe);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysAgo);

        let userFilter = { role: 'employee', isActive: true };
        if (departmentId) {
            userFilter.department = departmentId;
        }

        const users = await User.find(userFilter).populate('department');

        // Calculate performance for each user
        const userPerformance = await Promise.all(users.map(async (user) => {
            const totalTasks = await Task.countDocuments({
                'assignedTo.user': user._id,
                createdAt: { $gte: startDate }
            });

            const completedTasks = await Task.countDocuments({
                'assignedTo.user': user._id,
                status: 'completed',
                createdAt: { $gte: startDate }
            });

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

        // Sort by different criteria
        const topByCompletion = userPerformance
            .filter(up => up.stats.totalTasks > 0)
            .sort((a, b) => parseFloat(b.stats.completionRate) - parseFloat(a.stats.completionRate))
            .slice(0, parseInt(limit));

        const mostTasksAssigned = userPerformance
            .sort((a, b) => b.stats.totalTasks - a.stats.totalTasks)
            .slice(0, parseInt(limit));

        const mostTasksCompleted = userPerformance
            .sort((a, b) => b.stats.completedTasks - a.stats.completedTasks)
            .slice(0, parseInt(limit));

        res.json({
            success: true,
            data: {
                timeframe: `${timeframe} days`,
                topByCompletion,
                mostTasksAssigned,
                mostTasksCompleted
            }
        });
    } catch (error) {
        logger.error('Error getting top performers:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching top performers'
        });
    }
};

module.exports = {
    generateAnalyticsReport,
    exportReport,
    getPerformanceMetrics,
    getTopPerformers
};