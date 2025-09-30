const express = require('express');
const router = express.Router();
const { Task, TaskHistory, User } = require('../models');
const NotificationRead = require('../models/NotificationRead');
const { authenticateToken } = require('../middleware');

console.log('🔔 NotificationsSimple route loaded successfully!');
console.log('📦 Models loaded:', { 
    Task: !!Task, 
    TaskHistory: !!TaskHistory, 
    User: !!User, 
    NotificationRead: !!NotificationRead 
});
console.log('🔒 Middleware loaded:', { authenticateToken: !!authenticateToken });

// Simple test route
router.get('/test', (req, res) => {
    console.log('🧪 Test route called');
    res.json({ 
        success: true, 
        message: 'NotificationSimple route is working!',
        timestamp: new Date().toISOString()
    });
});

/**
 * Get notifications for user based on TaskHistory
 * Shows history of tasks where user is involved (creator or assignee)
 * Excludes actions performed by the user themselves
 */
router.get('/', authenticateToken, async (req, res) => {
    console.log('🔔 GET /api/notifications called by user:', req.user?.id);
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        console.log('📊 Query params:', { userId, page, limit, skip });

        // Find all tasks where user is involved (creator or assignee)
        const userTasks = await Task.find({
            $or: [
                { createdBy: userId },
                { 'assignedTo.user': userId }
            ]
        }).select('_id');

        console.log('📋 Found user tasks:', userTasks.length);

        const taskIds = userTasks.map(task => task._id);

        // Get TaskHistory for these tasks, excluding actions by the user themselves
        const taskHistories = await TaskHistory.find({
            task: { $in: taskIds },
            performedBy: { $ne: userId } // Exclude actions by the user themselves
        })
        .populate('task', 'title priority status')
        .populate('performedBy', 'name email role')
        .sort({ performedAt: -1 })
        .skip(skip)
        .limit(limit);

        console.log('📜 Found task histories:', taskHistories.length);

        // Transform to notification format
        const historyIds = taskHistories.map(h => h._id);
        
        // Get read status for these notifications
        const readStatus = await NotificationRead.getReadStatus(userId, historyIds);
        
        const notifications = taskHistories.map(history => ({
            _id: history._id,
            type: history.action,
            title: getNotificationTitle(history),
            message: getNotificationMessage(history),
            createdAt: history.performedAt,
            relatedTask: {
                _id: history.task._id,
                title: history.task.title
            },
            createdBy: history.performedBy,
            priority: getPriorityFromAction(history.action),
            isRead: readStatus[history._id.toString()] || false
        }));

        // Get total count for pagination
        const totalCount = await TaskHistory.countDocuments({
            task: { $in: taskIds },
            performedBy: { $ne: userId }
        });

        console.log('✅ Sending response with', notifications.length, 'notifications');

        res.json({
            success: true,
            data: notifications,
            pagination: {
                page,
                limit,
                total: totalCount,
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        console.error('❌ Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Add a simple POST route for debugging
router.post('/', authenticateToken, async (req, res) => {
    console.log('🔔 POST /api/notifications called - this should not happen normally');
    res.status(405).json({
        success: false,
        message: 'POST method not allowed on /api/notifications. Use GET instead.'
    });
});

/**
 * Get unread count for user
 */
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find all tasks where user is involved
        const userTasks = await Task.find({
            $or: [
                { createdBy: userId },
                { 'assignedTo.user': userId }
            ]
        }).select('_id');

        const taskIds = userTasks.map(task => task._id);

        // Count unread notifications (TaskHistory entries from last 30 days, excluding user's own actions, that haven't been read)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Get all TaskHistory IDs for user's tasks in the last 30 days
        const recentHistories = await TaskHistory.find({
            task: { $in: taskIds },
            performedBy: { $ne: userId },
            performedAt: { $gte: thirtyDaysAgo }
        }).select('_id');

        const recentHistoryIds = recentHistories.map(h => h._id);
        
        // Get read status for these
        const readStatus = await NotificationRead.getReadStatus(userId, recentHistoryIds);
        
        // Count unread ones
        const unreadCount = recentHistoryIds.filter(id => !readStatus[id.toString()]).length;

        res.json({
            success: true,
            count: unreadCount
        });

    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching unread count',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Mark a specific notification (TaskHistory entry) as read
 */
router.patch('/:id/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const taskHistoryId = req.params.id;

        const success = await NotificationRead.markAsRead(userId, taskHistoryId);

        if (success) {
            res.json({
                success: true,
                message: 'Notification marked as read'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to mark notification as read'
            });
        }

    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking notification as read',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Mark all notifications as read for the user
 */
router.patch('/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Find all tasks where user is involved
        const userTasks = await Task.find({
            $or: [
                { createdBy: userId },
                { 'assignedTo.user': userId }
            ]
        }).select('_id');

        const taskIds = userTasks.map(task => task._id);

        // Get all TaskHistory IDs for user's tasks
        const allHistories = await TaskHistory.find({
            task: { $in: taskIds },
            performedBy: { $ne: userId }
        }).select('_id');

        const allHistoryIds = allHistories.map(h => h._id);

        const success = await NotificationRead.markAllAsRead(userId, allHistoryIds);

        if (success) {
            res.json({
                success: true,
                message: 'All notifications marked as read'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to mark all notifications as read'
            });
        }

    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking all notifications as read',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Helper functions
function getNotificationTitle(history) {
    const actionTitles = {
        'created': `New Task Created: ${history.task.title}`,
        'assigned': `Task Assigned: ${history.task.title}`,
        'status_changed': `Task Status Updated: ${history.task.title}`,
        'stage_changed': `Task Stage Updated: ${history.task.title}`,
        'transferred': `Task Transferred: ${history.task.title}`,
        'remark_added': `New Remark Added: ${history.task.title}`,
        'attachment_added': `Attachment Added: ${history.task.title}`,
        'attachment_removed': `Attachment Removed: ${history.task.title}`,
        'deadline_changed': `Deadline Updated: ${history.task.title}`,
        'priority_changed': `Priority Updated: ${history.task.title}`,
        'completed': `Task Completed: ${history.task.title}`,
        'approved': `Task Approved: ${history.task.title}`,
        'rejected': `Task Rejected: ${history.task.title}`
    };

    return actionTitles[history.action] || `Task Updated: ${history.task.title}`;
}

function getNotificationMessage(history) {
    const performerName = history.performedBy.name;
    let baseMessage = `${performerName} ${history.actionDescription.toLowerCase()}`;
    
    if (history.changes && history.changes.description) {
        baseMessage += ` - ${history.changes.description}`;
    } else if (history.changes && history.changes.oldValue && history.changes.newValue) {
        baseMessage += ` from "${history.changes.oldValue}" to "${history.changes.newValue}"`;
    }

    return baseMessage;
}

function getPriorityFromAction(action) {
    const priorityMap = {
        'created': 'medium',
        'assigned': 'high',
        'completed': 'high',
        'approved': 'medium',
        'rejected': 'high',
        'transferred': 'medium',
        'deadline_changed': 'urgent',
        'priority_changed': 'medium'
    };

    return priorityMap[action] || 'low';
}

module.exports = router;