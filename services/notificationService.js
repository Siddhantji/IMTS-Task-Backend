const Notification = require('../models/Notification');
const TaskHistory = require('../models/TaskHistory');
const Task = require('../models/Task');
const User = require('../models/User');

class NotificationService {
    /**
     * Create notifications based on task history changes
     * Filters out remark_added actions as they're shown separately
     */
    static async createNotificationFromHistory(historyEntry) {
        try {
            // Skip remark_added actions as they're shown separately
            if (historyEntry.action === 'remark_added') {
                return null;
            }

            // Get task with populated data
            const task = await Task.findById(historyEntry.task)
                .populate('createdBy', 'name email')
                .populate('assignedTo.user', 'name email');

            if (!task) {
                console.warn(`Task not found for history entry: ${historyEntry._id}`);
                return null;
            }

            // Determine recipients based on action type
            const recipients = await this.determineRecipients(historyEntry, task);
            
            if (recipients.length === 0) {
                return null;
            }

            // Generate notification content
            const notificationContent = this.generateNotificationContent(historyEntry, task);
            
            // Create notifications for each recipient
            const notifications = [];
            for (const recipientId of recipients) {
                // Don't notify the person who performed the action
                if (recipientId.toString() === historyEntry.performedBy.toString()) {
                    continue;
                }

                const notification = await Notification.createNotification({
                    recipient: recipientId,
                    sender: historyEntry.performedBy,
                    type: this.mapHistoryActionToNotificationType(historyEntry.action),
                    title: notificationContent.title,
                    message: notificationContent.message,
                    relatedTask: task._id,
                    priority: this.determinePriority(historyEntry.action, task.priority),
                    data: {
                        historyId: historyEntry._id,
                        action: historyEntry.action,
                        changes: historyEntry.changes,
                        taskTitle: task.title,
                        taskPriority: task.priority
                    }
                });

                notifications.push(notification);
            }

            return notifications;
        } catch (error) {
            console.error('Error creating notification from history:', error);
            throw error;
        }
    }

    /**
     * Determine who should receive notifications based on the action
     */
    static async determineRecipients(historyEntry, task) {
        const recipients = new Set();

        switch (historyEntry.action) {
            case 'created':
                // Notify assigned users when task is created
                if (task.assignedTo && task.assignedTo.length > 0) {
                    task.assignedTo.forEach(assignment => {
                        recipients.add(assignment.user._id.toString());
                    });
                }
                break;

            case 'assigned':
                // Notify newly assigned users
                if (task.assignedTo && task.assignedTo.length > 0) {
                    task.assignedTo.forEach(assignment => {
                        recipients.add(assignment.user._id.toString());
                    });
                }
                break;

            case 'status_changed':
                // Notify creator when status changes
                recipients.add(task.createdBy._id.toString());
                // Also notify assigned users
                if (task.assignedTo && task.assignedTo.length > 0) {
                    task.assignedTo.forEach(assignment => {
                        recipients.add(assignment.user._id.toString());
                    });
                }
                break;

            case 'stage_changed':
                // Notify creator when stage changes (especially when marked as done)
                recipients.add(task.createdBy._id.toString());
                break;

            case 'transferred':
                // Notify the user receiving the transfer
                if (historyEntry.transferDetails && historyEntry.transferDetails.toUser) {
                    recipients.add(historyEntry.transferDetails.toUser.toString());
                }
                // Notify the user losing the task
                if (historyEntry.transferDetails && historyEntry.transferDetails.fromUser) {
                    recipients.add(historyEntry.transferDetails.fromUser.toString());
                }
                break;

            case 'completed':
            case 'approved':
            case 'rejected':
                // Notify assigned users and creator
                recipients.add(task.createdBy._id.toString());
                if (task.assignedTo && task.assignedTo.length > 0) {
                    task.assignedTo.forEach(assignment => {
                        recipients.add(assignment.user._id.toString());
                    });
                }
                break;

            case 'deadline_changed':
            case 'priority_changed':
                // Notify assigned users when deadline or priority changes
                if (task.assignedTo && task.assignedTo.length > 0) {
                    task.assignedTo.forEach(assignment => {
                        recipients.add(assignment.user._id.toString());
                    });
                }
                break;

            case 'attachment_added':
            case 'attachment_removed':
                // Notify creator and assigned users about attachment changes
                recipients.add(task.createdBy._id.toString());
                if (task.assignedTo && task.assignedTo.length > 0) {
                    task.assignedTo.forEach(assignment => {
                        recipients.add(assignment.user._id.toString());
                    });
                }
                break;
        }

        return Array.from(recipients);
    }

    /**
     * Generate notification content based on history entry
     */
    static generateNotificationContent(historyEntry, task) {
        const performedByName = historyEntry.performedBy?.name || 'Someone';
        const taskTitle = task.title || 'Untitled Task';

        const templates = {
            created: {
                title: `New Task Created: ${taskTitle}`,
                message: `${performedByName} created a new task "${taskTitle}". Priority: ${task.priority?.toUpperCase() || 'Not set'}`
            },
            assigned: {
                title: `Task Assigned: ${taskTitle}`,
                message: `You have been assigned to task "${taskTitle}" by ${performedByName}`
            },
            status_changed: {
                title: `Task Status Changed: ${taskTitle}`,
                message: this.generateStatusChangeMessage(historyEntry, taskTitle, performedByName)
            },
            stage_changed: {
                title: `Task Stage Updated: ${taskTitle}`,
                message: this.generateStageChangeMessage(historyEntry, taskTitle, performedByName)
            },
            transferred: {
                title: `Task Transferred: ${taskTitle}`,
                message: `Task "${taskTitle}" has been transferred by ${performedByName}`
            },
            completed: {
                title: `Task Completed: ${taskTitle}`,
                message: `${performedByName} marked task "${taskTitle}" as completed`
            },
            approved: {
                title: `Task Approved: ${taskTitle}`,
                message: `Task "${taskTitle}" has been approved by ${performedByName}. Great work!`
            },
            rejected: {
                title: `Task Rejected: ${taskTitle}`,
                message: `Task "${taskTitle}" has been rejected by ${performedByName}. Please check and resubmit.`
            },
            deadline_changed: {
                title: `Deadline Changed: ${taskTitle}`,
                message: this.generateDeadlineChangeMessage(historyEntry, taskTitle, performedByName)
            },
            priority_changed: {
                title: `Priority Changed: ${taskTitle}`,
                message: this.generatePriorityChangeMessage(historyEntry, taskTitle, performedByName)
            },
            attachment_added: {
                title: `Attachment Added: ${taskTitle}`,
                message: `${performedByName} added an attachment to task "${taskTitle}"`
            },
            attachment_removed: {
                title: `Attachment Removed: ${taskTitle}`,
                message: `${performedByName} removed an attachment from task "${taskTitle}"`
            }
        };

        return templates[historyEntry.action] || {
            title: `Task Updated: ${taskTitle}`,
            message: `${performedByName} updated task "${taskTitle}"`
        };
    }

    /**
     * Generate specific message for status changes
     */
    static generateStatusChangeMessage(historyEntry, taskTitle, performedByName) {
        if (historyEntry.statusChange) {
            const { from, to } = historyEntry.statusChange;
            return `${performedByName} changed status of "${taskTitle}" from ${from?.toUpperCase() || 'Unknown'} to ${to?.toUpperCase() || 'Unknown'}`;
        }
        return `${performedByName} updated the status of task "${taskTitle}"`;
    }

    /**
     * Generate specific message for stage changes
     */
    static generateStageChangeMessage(historyEntry, taskTitle, performedByName) {
        if (historyEntry.changes && historyEntry.changes.newValue) {
            const newStage = historyEntry.changes.newValue;
            if (newStage === 'done') {
                return `${performedByName} marked task "${taskTitle}" as completed and ready for review`;
            }
            return `${performedByName} changed stage of "${taskTitle}" to ${newStage?.replace('_', ' ')?.toUpperCase()}`;
        }
        return `${performedByName} updated the stage of task "${taskTitle}"`;
    }

    /**
     * Generate specific message for deadline changes
     */
    static generateDeadlineChangeMessage(historyEntry, taskTitle, performedByName) {
        if (historyEntry.changes && historyEntry.changes.newValue) {
            const newDeadline = new Date(historyEntry.changes.newValue).toLocaleDateString();
            return `${performedByName} changed deadline of "${taskTitle}" to ${newDeadline}`;
        }
        return `${performedByName} updated the deadline of task "${taskTitle}"`;
    }

    /**
     * Generate specific message for priority changes
     */
    static generatePriorityChangeMessage(historyEntry, taskTitle, performedByName) {
        if (historyEntry.changes && historyEntry.changes.newValue) {
            const newPriority = historyEntry.changes.newValue.toUpperCase();
            return `${performedByName} changed priority of "${taskTitle}" to ${newPriority}`;
        }
        return `${performedByName} updated the priority of task "${taskTitle}"`;
    }

    /**
     * Map history actions to notification types
     */
    static mapHistoryActionToNotificationType(action) {
        const mapping = {
            created: 'task_assigned',
            assigned: 'task_assigned',
            status_changed: 'status_changed',
            stage_changed: 'stage_changed',
            transferred: 'task_transferred',
            completed: 'task_completed',
            approved: 'task_approved',
            rejected: 'task_rejected',
            deadline_changed: 'status_changed',
            priority_changed: 'status_changed',
            attachment_added: 'status_changed',
            attachment_removed: 'status_changed'
        };

        return mapping[action] || 'status_changed';
    }

    /**
     * Determine notification priority based on action and task priority
     */
    static determinePriority(action, taskPriority) {
        // High priority actions
        if (['completed', 'approved', 'rejected', 'transferred'].includes(action)) {
            return 'high';
        }

        // Urgent if task priority is urgent
        if (taskPriority === 'urgent') {
            return 'urgent';
        }

        // High if task priority is high
        if (taskPriority === 'high') {
            return 'high';
        }

        return 'medium';
    }

    /**
     * Get notifications for a user with filtering and pagination
     */
    static async getNotificationsForUser(userId, options = {}) {
        const {
            page = 1,
            limit = 20,
            unreadOnly = false,
            type = null
        } = options;

        const query = {
            recipient: userId,
            isActive: true
        };

        if (unreadOnly) {
            query['channels.inApp.read'] = false;
        }

        if (type) {
            query.type = type;
        }

        const skip = (page - 1) * limit;

        const notifications = await Notification.find(query)
            .populate('sender', 'name email')
            .populate('relatedTask', 'title priority status stage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments(query);

        return {
            notifications,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get unread count for a user
     */
    static async getUnreadCount(userId) {
        return await Notification.countDocuments({
            recipient: userId,
            'channels.inApp.read': false,
            isActive: true
        });
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(notificationId, userId) {
        const notification = await Notification.findOne({
            _id: notificationId,
            recipient: userId
        });

        if (!notification) {
            throw new Error('Notification not found or unauthorized');
        }

        return await notification.markAsRead();
    }

    /**
     * Mark all notifications as read for a user
     */
    static async markAllAsRead(userId) {
        return await Notification.markAllAsReadForUser(userId);
    }

    /**
     * Create deadline reminder notifications
     */
    static async createDeadlineReminders() {
        try {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(23, 59, 59, 999);

            // Find tasks with deadlines approaching (within 24 hours)
            const upcomingTasks = await Task.find({
                deadline: {
                    $gte: now,
                    $lte: tomorrow
                },
                stage: { $ne: 'done' },
                status: { $nin: ['approved', 'rejected'] }
            }).populate('assignedTo.user', 'name email');

            const notifications = [];

            for (const task of upcomingTasks) {
                if (task.assignedTo && task.assignedTo.length > 0) {
                    for (const assignment of task.assignedTo) {
                        // Check if reminder already sent today
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const existingReminder = await Notification.findOne({
                            recipient: assignment.user._id,
                            type: 'task_deadline_reminder',
                            relatedTask: task._id,
                            createdAt: { $gte: today }
                        });

                        if (!existingReminder) {
                            const notification = await Notification.createTaskNotification(
                                'task_deadline_reminder',
                                task._id,
                                assignment.user._id
                            );
                            notifications.push(notification);
                        }
                    }
                }
            }

            return notifications;
        } catch (error) {
            console.error('Error creating deadline reminders:', error);
            throw error;
        }
    }

    /**
     * Create overdue task notifications
     */
    static async createOverdueNotifications() {
        try {
            const now = new Date();

            // Find overdue tasks
            const overdueTasks = await Task.find({
                deadline: { $lt: now },
                stage: { $ne: 'done' },
                status: { $nin: ['approved', 'rejected'] }
            }).populate('assignedTo.user', 'name email');

            const notifications = [];

            for (const task of overdueTasks) {
                if (task.assignedTo && task.assignedTo.length > 0) {
                    for (const assignment of task.assignedTo) {
                        // Check if overdue notification already sent today
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        const existingOverdue = await Notification.findOne({
                            recipient: assignment.user._id,
                            type: 'task_overdue',
                            relatedTask: task._id,
                            createdAt: { $gte: today }
                        });

                        if (!existingOverdue) {
                            const notification = await Notification.createTaskNotification(
                                'task_overdue',
                                task._id,
                                assignment.user._id
                            );
                            notifications.push(notification);
                        }
                    }
                }
            }

            return notifications;
        } catch (error) {
            console.error('Error creating overdue notifications:', error);
            throw error;
        }
    }
}

module.exports = NotificationService;