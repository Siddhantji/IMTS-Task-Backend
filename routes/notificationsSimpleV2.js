const express = require('express');
const router = express.Router();
const { Task, TaskHistory, User } = require('../models');
const { authenticateToken } = require('../middleware');

console.log('🔔 NotificationsSimple v2 route loaded successfully!');

// Simple test route
router.get('/test', (req, res) => {
    console.log('🧪 Test route called');
    res.json({ 
        success: true, 
        message: 'NotificationSimple v2 route is working!',
        timestamp: new Date().toISOString()
    });
});

// Test TaskHistory data without auth
router.get('/test-data', async (req, res) => {
    try {
        const taskHistoryCount = await TaskHistory.countDocuments();
        const recentHistory = await TaskHistory.find()
            .populate('task', 'title')
            .populate('performedBy', 'name')
            .sort({ performedAt: -1 })
            .limit(5);
        
        res.json({
            success: true,
            message: 'TaskHistory data test',
            count: taskHistoryCount,
            recentEntries: recentHistory.map(h => ({
                action: h.action,
                task: h.task?.title || 'Unknown',
                performedBy: h.performedBy?.name || 'Unknown',
                performedAt: h.performedAt
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error testing data',
            error: error.message
        });
    }
});

/**
 * Get notifications for user based on TaskHistory (without read tracking for now)
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

        // Transform to notification format (all marked as unread for now)
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
            isRead: false // Simple approach - all unread for now
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

/**
 * Get unread count for user
 */
router.get('/unread-count', authenticateToken, async (req, res) => {
    console.log('🔔 /unread-count endpoint called by user:', req.user?.id);
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
        console.log('📋 User tasks found:', taskIds.length);

        // Count unread notifications (TaskHistory entries from last 30 days, excluding user's own actions)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const unreadCount = await TaskHistory.countDocuments({
            task: { $in: taskIds },
            performedBy: { $ne: userId },
            performedAt: { $gte: thirtyDaysAgo }
        });

        console.log('📊 Unread count calculated:', unreadCount);

        res.json({
            success: true,
            count: unreadCount
        });

    } catch (error) {
        console.error('❌ Error fetching unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching unread count',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Placeholder for mark as read (simple response for now)
router.patch('/:id/read', authenticateToken, async (req, res) => {
    res.json({
        success: true,
        message: 'Notification marked as read (placeholder)'
    });
});

// Placeholder for mark all as read
router.patch('/mark-all-read', authenticateToken, async (req, res) => {
    res.json({
        success: true,
        message: 'All notifications marked as read (placeholder)'
    });
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