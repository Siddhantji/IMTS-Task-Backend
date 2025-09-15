const mongoose = require('mongoose');

const taskHistorySchema = new mongoose.Schema({
    task: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
        required: [true, 'Task reference is required']
    },
    action: {
        type: String,
        required: [true, 'Action is required'],
        enum: {
            values: [
                'created',
                'assigned',
                'status_changed',
                'stage_changed',
                'transferred',
                'remark_added',
                'attachment_added',
                'attachment_removed',
                'deadline_changed',
                'priority_changed',
                'completed',
                'approved',
                'rejected'
            ],
            message: 'Invalid action type'
        }
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Performed by user is required']
    },
    performedAt: {
        type: Date,
        default: Date.now
    },
    
    // Store the changes made
    changes: {
        field: String, // Which field was changed
        oldValue: mongoose.Schema.Types.Mixed, // Previous value
        newValue: mongoose.Schema.Types.Mixed, // New value
        description: String // Human readable description
    },
    
    // Additional context
    metadata: {
        userAgent: String,
        ipAddress: String,
        reason: String, // Reason for change (especially for transfers)
        additionalInfo: mongoose.Schema.Types.Mixed
    },
    
    // For tracking transfers specifically
    transferDetails: {
        fromUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        toUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String
    },
    
    // For tracking status/stage changes
    statusChange: {
        from: String,
        to: String,
        reason: String
    }
}, {
    timestamps: false, // We're using performedAt instead
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
taskHistorySchema.index({ task: 1 });
taskHistorySchema.index({ performedBy: 1 });
taskHistorySchema.index({ performedAt: 1 });
taskHistorySchema.index({ action: 1 });

// Compound indexes
taskHistorySchema.index({ task: 1, performedAt: -1 });
taskHistorySchema.index({ task: 1, action: 1 });

// Virtual for formatted action description
taskHistorySchema.virtual('actionDescription').get(function() {
    const actionDescriptions = {
        'created': 'Task was created',
        'assigned': 'Task was assigned',
        'status_changed': 'Task status was changed',
        'stage_changed': 'Task stage was updated',
        'transferred': 'Task was transferred',
        'remark_added': 'Remark was added',
        'attachment_added': 'Attachment was added',
        'attachment_removed': 'Attachment was removed',
        'deadline_changed': 'Deadline was modified',
        'priority_changed': 'Priority was updated',
        'completed': 'Task was marked as completed',
        'approved': 'Task was approved',
        'rejected': 'Task was rejected'
    };
    
    return actionDescriptions[this.action] || 'Unknown action';
});

// Static methods
taskHistorySchema.statics.createEntry = async function(taskId, action, performedBy, changes = {}, metadata = {}) {
    const historyEntry = new this({
        task: taskId,
        action,
        performedBy,
        changes,
        metadata,
        performedAt: new Date()
    });
    
    return await historyEntry.save();
};

taskHistorySchema.statics.getTaskHistory = function(taskId, limit = 50) {
    return this.find({ task: taskId })
        .populate('performedBy', 'name email role')
        .populate('transferDetails.fromUser', 'name email')
        .populate('transferDetails.toUser', 'name email')
        .populate('transferDetails.approvedBy', 'name email')
        .sort({ performedAt: -1 })
        .limit(limit);
};

taskHistorySchema.statics.getUserActivity = function(userId, limit = 50) {
    return this.find({ performedBy: userId })
        .populate('task', 'title status priority')
        .sort({ performedAt: -1 })
        .limit(limit);
};

taskHistorySchema.statics.getRecentActivity = function(departmentId, limit = 100) {
    return this.aggregate([
        {
            $lookup: {
                from: 'tasks',
                localField: 'task',
                foreignField: '_id',
                as: 'taskDetails'
            }
        },
        {
            $unwind: '$taskDetails'
        },
        {
            $match: {
                'taskDetails.department': departmentId
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'performedBy',
                foreignField: '_id',
                as: 'userDetails'
            }
        },
        {
            $unwind: '$userDetails'
        },
        {
            $sort: { performedAt: -1 }
        },
        {
            $limit: limit
        },
        {
            $project: {
                action: 1,
                performedAt: 1,
                changes: 1,
                'taskDetails.title': 1,
                'taskDetails.priority': 1,
                'userDetails.name': 1,
                'userDetails.email': 1
            }
        }
    ]);
};

// Instance methods
taskHistorySchema.methods.getFormattedDescription = function() {
    let description = this.actionDescription;
    
    if (this.changes && this.changes.description) {
        description += `: ${this.changes.description}`;
    } else if (this.changes && this.changes.field) {
        if (this.changes.oldValue && this.changes.newValue) {
            description += ` from "${this.changes.oldValue}" to "${this.changes.newValue}"`;
        }
    }
    
    return description;
};

const TaskHistory = mongoose.model('TaskHistory', taskHistorySchema);

module.exports = TaskHistory;
