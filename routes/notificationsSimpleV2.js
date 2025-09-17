const express = require('express');
const router = express.Router();
const { Task, TaskHistory, User, Notification } = require('../models');
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

// Test actual Notification data without auth
router.get('/test-data', async (req, res) => {
    try {
        const notificationCount = await Notification.countDocuments();
        const recentNotifications = await Notification.find()
            .populate('sender', 'name')
            .populate('recipient', 'name')
            .populate('relatedTask', 'title')
            .sort({ createdAt: -1 })
            .limit(5);
        
        res.json({
            success: true,
            message: 'Notification data test',
            count: notificationCount,
            recentEntries: recentNotifications.map(n => ({
                _id: n._id,
                type: n.type,
                title: n.title,
                message: n.message,
                recipient: n.recipient?.name || 'Unknown',
                sender: n.sender?.name || 'Unknown',
                relatedTask: n.relatedTask?.title || 'No task',
                channels: n.channels, // Show full channels structure
                isRead: n.channels?.inApp?.read || false,
                createdAt: n.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error testing notification data',
            error: error.message
        });
    }
});

/**
 * Get notifications for user from actual Notification collection
 */
router.get('/', authenticateToken, async (req, res) => {
    console.log('🔔 GET /api/notifications called by user:', req.user?.id);
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        console.log('📊 Query params:', { userId, page, limit, skip });

        // Get notifications for the user
        const notifications = await Notification.find({
            recipient: userId,
            isActive: true
        })
        .populate('sender', 'name email role')
        .populate('relatedTask', 'title priority status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

        console.log('📜 Found notifications:', notifications.length);

        // Transform to frontend format
        const transformedNotifications = notifications.map(notification => ({
            _id: notification._id,
            type: notification.type,
            title: notification.title,
            message: notification.message, // Use the actual message from database
            createdAt: notification.createdAt,
            relatedTask: notification.relatedTask ? {
                _id: notification.relatedTask._id,
                title: notification.relatedTask.title
            } : null,
            createdBy: notification.sender,
            priority: notification.priority,
            isRead: notification.channels?.inApp?.read || false // Check if read in inApp channel
        }));

        // Get total count for pagination
        const totalCount = await Notification.countDocuments({
            recipient: userId,
            isActive: true
        });

        console.log('✅ Sending response with', transformedNotifications.length, 'notifications');

        res.json({
            success: true,
            data: transformedNotifications,
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
 * Get unread count for user from actual Notification collection
 */
router.get('/unread-count', authenticateToken, async (req, res) => {
    console.log('🔔 /unread-count endpoint called by user:', req.user?.id);
    try {
        const userId = req.user.id;

        // Count unread notifications in the inApp channel
        const unreadCount = await Notification.countDocuments({
            recipient: userId,
            isActive: true,
            $or: [
                { 'channels.inApp.read': false },
                { 'channels.inApp.read': { $exists: false } }
            ]
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

// Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        // Update the notification to mark inApp channel as read
        const notification = await Notification.findOneAndUpdate(
            { 
                _id: notificationId, 
                recipient: userId 
            },
            { 
                'channels.inApp.read': true,
                'channels.inApp.readAt': new Date()
            },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking notification as read',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Mark all notifications as read
router.patch('/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Update all unread notifications for the user
        const result = await Notification.updateMany(
            { 
                recipient: userId,
                isActive: true,
                $or: [
                    { 'channels.inApp.read': false },
                    { 'channels.inApp.read': { $exists: false } }
                ]
            },
            { 
                'channels.inApp.read': true,
                'channels.inApp.readAt': new Date()
            }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} notifications marked as read`
        });

    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking all notifications as read',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Test marking a notification as read (for debugging)
router.get('/test-mark-read/:id', async (req, res) => {
    try {
        const notificationId = req.params.id;
        
        // First, show current state
        const beforeUpdate = await Notification.findById(notificationId);
        
        // Update the notification
        const afterUpdate = await Notification.findByIdAndUpdate(
            notificationId,
            { 
                'channels.inApp.read': true,
                'channels.inApp.readAt': new Date()
            },
            { new: true }
        );
        
        res.json({
            success: true,
            message: 'Test mark as read',
            before: {
                id: beforeUpdate._id,
                read: beforeUpdate.channels?.inApp?.read,
                readAt: beforeUpdate.channels?.inApp?.readAt
            },
            after: {
                id: afterUpdate._id,
                read: afterUpdate.channels?.inApp?.read,
                readAt: afterUpdate.channels?.inApp?.readAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error testing mark as read',
            error: error.message
        });
    }
});

module.exports = router;