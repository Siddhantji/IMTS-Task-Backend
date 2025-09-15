const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Recipient is required']
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    type: {
        type: String,
        required: [true, 'Notification type is required'],
        enum: {
            values: [
                'task_assigned',
                'task_completed',
                'task_approved',
                'task_rejected',
                'task_transferred',
                'task_deadline_reminder',
                'task_overdue',
                'remark_added',
                'status_changed',
                'stage_changed',
                'system_announcement'
            ],
            message: 'Invalid notification type'
        }
    },
    title: {
        type: String,
        required: [true, 'Notification title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    message: {
        type: String,
        required: [true, 'Notification message is required'],
        trim: true,
        maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    
    // Related entities
    relatedTask: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task'
    },
    relatedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Notification channels
    channels: {
        inApp: {
            sent: {
                type: Boolean,
                default: true
            },
            read: {
                type: Boolean,
                default: false
            },
            readAt: Date
        },
        email: {
            enabled: {
                type: Boolean,
                default: true
            },
            sent: {
                type: Boolean,
                default: false
            },
            sentAt: Date,
            error: String
        },
        whatsapp: {
            enabled: {
                type: Boolean,
                default: false
            },
            sent: {
                type: Boolean,
                default: false
            },
            sentAt: Date,
            error: String
        }
    },
    
    // Priority and scheduling
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    scheduledFor: {
        type: Date,
        default: Date.now
    },
    
    // Metadata
    data: {
        type: mongoose.Schema.Types.Mixed // Additional data for the notification
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
notificationSchema.index({ recipient: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ 'channels.inApp.read': 1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ createdAt: 1 });

// Compound indexes
notificationSchema.index({ recipient: 1, 'channels.inApp.read': 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

// Virtual for checking if notification is read
notificationSchema.virtual('isRead').get(function() {
    return this.channels.inApp.read;
});

// Virtual for checking if notification is due
notificationSchema.virtual('isDue').get(function() {
    return new Date() >= this.scheduledFor;
});

// Pre-save middleware
notificationSchema.pre('save', function(next) {
    // Auto-set readAt when marking as read
    if (this.isModified('channels.inApp.read') && this.channels.inApp.read && !this.channels.inApp.readAt) {
        this.channels.inApp.readAt = new Date();
    }
    next();
});

// Instance methods
notificationSchema.methods.markAsRead = function() {
    this.channels.inApp.read = true;
    this.channels.inApp.readAt = new Date();
    return this.save();
};

notificationSchema.methods.markEmailAsSent = function(error = null) {
    this.channels.email.sent = !error;
    this.channels.email.sentAt = new Date();
    if (error) {
        this.channels.email.error = error;
    }
    return this.save();
};

notificationSchema.methods.markWhatsAppAsSent = function(error = null) {
    this.channels.whatsapp.sent = !error;
    this.channels.whatsapp.sentAt = new Date();
    if (error) {
        this.channels.whatsapp.error = error;
    }
    return this.save();
};

// Static methods
notificationSchema.statics.createNotification = async function(data) {
    const notification = new this(data);
    return await notification.save();
};

notificationSchema.statics.getUnreadForUser = function(userId) {
    return this.find({
        recipient: userId,
        'channels.inApp.read': false,
        isActive: true
    }).sort({ createdAt: -1 });
};

notificationSchema.statics.getRecentForUser = function(userId, limit = 50) {
    return this.find({
        recipient: userId,
        isActive: true
    })
    .populate('sender', 'name email')
    .populate('relatedTask', 'title priority status')
    .populate('relatedUser', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit);
};

notificationSchema.statics.markAllAsReadForUser = function(userId) {
    return this.updateMany(
        {
            recipient: userId,
            'channels.inApp.read': false
        },
        {
            'channels.inApp.read': true,
            'channels.inApp.readAt': new Date()
        }
    );
};

notificationSchema.statics.getPendingEmailNotifications = function() {
    return this.find({
        'channels.email.enabled': true,
        'channels.email.sent': false,
        scheduledFor: { $lte: new Date() },
        isActive: true
    }).populate('recipient', 'name email');
};

notificationSchema.statics.getPendingWhatsAppNotifications = function() {
    return this.find({
        'channels.whatsapp.enabled': true,
        'channels.whatsapp.sent': false,
        scheduledFor: { $lte: new Date() },
        isActive: true
    }).populate('recipient', 'name phone');
};

notificationSchema.statics.getNotificationStats = function(userId) {
    return this.aggregate([
        {
            $match: { recipient: mongoose.Types.ObjectId(userId), isActive: true }
        },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                unread: {
                    $sum: {
                        $cond: [{ $eq: ['$channels.inApp.read', false] }, 1, 0]
                    }
                },
                byType: {
                    $push: {
                        type: '$type',
                        read: '$channels.inApp.read'
                    }
                }
            }
        }
    ]);
};

// Helper function to create task-related notifications
notificationSchema.statics.createTaskNotification = async function(type, taskId, recipientId, senderId = null, additionalData = {}) {
    const Task = mongoose.model('Task');
    const task = await Task.findById(taskId).populate('giver', 'name');
    
    if (!task) {
        throw new Error('Task not found');
    }
    
    const notificationTemplates = {
        task_assigned: {
            title: `New Task Assigned: ${task.title}`,
            message: `You have been assigned a new task "${task.title}" by ${task.giver.name}. Priority: ${task.priority.toUpperCase()}`
        },
        task_completed: {
            title: `Task Completed: ${task.title}`,
            message: `Task "${task.title}" has been marked as completed and is awaiting your approval.`
        },
        task_approved: {
            title: `Task Approved: ${task.title}`,
            message: `Your task "${task.title}" has been approved. Great work!`
        },
        task_rejected: {
            title: `Task Rejected: ${task.title}`,
            message: `Task "${task.title}" has been rejected. Please check the remarks and resubmit.`
        },
        task_deadline_reminder: {
            title: `Deadline Reminder: ${task.title}`,
            message: `Task "${task.title}" is due soon. Deadline: ${new Date(task.deadline).toLocaleDateString()}`
        },
        task_overdue: {
            title: `Task Overdue: ${task.title}`,
            message: `Task "${task.title}" is now overdue. Please complete it as soon as possible.`
        }
    };
    
    const template = notificationTemplates[type];
    if (!template) {
        throw new Error('Invalid notification type');
    }
    
    const notificationData = {
        recipient: recipientId,
        sender: senderId,
        type,
        title: template.title,
        message: template.message,
        relatedTask: taskId,
        data: additionalData
    };
    
    return await this.createNotification(notificationData);
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
