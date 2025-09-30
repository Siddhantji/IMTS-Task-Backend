const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');
const { authenticateToken } = require('../middleware');
const { check, validationResult } = require('express-validator');
const TaskHistory = require('../models/TaskHistory');

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for the authenticated user
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            unreadOnly = false,
            type = null
        } = req.query;

        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            unreadOnly: unreadOnly === 'true',
            type: type || null
        };

        const result = await NotificationService.getNotificationsForUser(
            req.user.id,
            options
        );

        res.json({
            success: true,
            data: result.notifications,
            pagination: result.pagination
        });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notifications',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count for the authenticated user
 * @access  Private
 */
router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
        const count = await NotificationService.getUnreadCount(req.user.id);

        res.json({
            success: true,
            data: {
                unreadCount: count
            }
        });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching unread count',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Private
 */
router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        const notification = await NotificationService.markAsRead(
            req.params.id,
            req.user.id
        );

        res.json({
            success: true,
            message: 'Notification marked as read',
            data: notification
        });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        
        if (error.message === 'Notification not found or unauthorized') {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error marking notification as read',
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/notifications/mark-all-read
 * @desc    Mark all notifications as read for the authenticated user
 * @access  Private
 */
router.put('/mark-all-read', authenticateToken, async (req, res) => {
    try {
        const result = await NotificationService.markAllAsRead(req.user.id);

        res.json({
            success: true,
            message: 'All notifications marked as read',
            data: {
                modifiedCount: result.modifiedCount
            }
        });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking all notifications as read',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/notifications/types
 * @desc    Get available notification types
 * @access  Private
 */
router.get('/types', authenticateToken, async (req, res) => {
    try {
        const types = [
            { value: 'task_assigned', label: 'Task Assigned' },
            { value: 'task_completed', label: 'Task Completed' },
            { value: 'task_approved', label: 'Task Approved' },
            { value: 'task_rejected', label: 'Task Rejected' },
            { value: 'task_transferred', label: 'Task Transferred' },
            { value: 'task_deadline_reminder', label: 'Deadline Reminder' },
            { value: 'task_overdue', label: 'Task Overdue' },
            { value: 'status_changed', label: 'Status Changed' },
            { value: 'stage_changed', label: 'Stage Changed' },
            { value: 'system_announcement', label: 'System Announcement' }
        ];

        res.json({
            success: true,
            data: types
        });
    } catch (error) {
        console.error('Error fetching notification types:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching notification types',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/test
 * @desc    Create test notifications (development only)
 * @access  Private
 */
router.post('/test', authenticateToken, async (req, res) => {
    try {
        // Only allow in development environment
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: 'Test notifications not allowed in production'
            });
        }

        const Notification = require('../models/Notification');
        
        const testNotification = await Notification.createNotification({
            recipient: req.user.id,
            type: 'system_announcement',
            title: 'Test Notification',
            message: 'This is a test notification to verify the system is working correctly.',
            priority: 'medium'
        });

        res.json({
            success: true,
            message: 'Test notification created',
            data: testNotification
        });
    } catch (error) {
        console.error('Error creating test notification:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating test notification',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/create-deadline-reminders
 * @desc    Manually trigger deadline reminder creation (admin only)
 * @access  Private
 */
router.post('/create-deadline-reminders', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can manually trigger deadline reminders'
            });
        }

        const notifications = await NotificationService.createDeadlineReminders();

        res.json({
            success: true,
            message: `Created ${notifications.length} deadline reminder notifications`,
            data: {
                count: notifications.length,
                notifications: notifications.map(n => ({
                    id: n._id,
                    recipient: n.recipient,
                    title: n.title
                }))
            }
        });
    } catch (error) {
        console.error('Error creating deadline reminders:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating deadline reminders',
            error: error.message
        });
    }
});

/**
 * @route   POST /api/notifications/create-overdue-notifications
 * @desc    Manually trigger overdue notification creation (admin only)
 * @access  Private
 */
router.post('/create-overdue-notifications', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only admins can manually trigger overdue notifications'
            });
        }

        const notifications = await NotificationService.createOverdueNotifications();

        res.json({
            success: true,
            message: `Created ${notifications.length} overdue notifications`,
            data: {
                count: notifications.length,
                notifications: notifications.map(n => ({
                    id: n._id,
                    recipient: n.recipient,
                    title: n.title
                }))
            }
        });
    } catch (error) {
        console.error('Error creating overdue notifications:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating overdue notifications',
            error: error.message
        });
    }
});

// Fetch notifications based on task history
router.get('/notifications', async (req, res) => {
    try {
        const notifications = await TaskHistory.find({}).select('-remark'); // Exclude remarks
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

module.exports = router;