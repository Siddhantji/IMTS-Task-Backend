const mongoose = require('mongoose');

// Embedded schema for remarks
const remarkSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
        trim: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    authorRole: {
        type: String,
        required: true,
        enum: ['employee', 'hod', 'admin', 'super_admin']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Embedded schema for attachments
const attachmentSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    path: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    mimetype: {
        type: String,
        required: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
});

// Main task schema
const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Task title is required'],
        trim: true,
    },
    description: {
        type: String,
        required: [true, 'Task description is required'],
        trim: true,
    },
    startDate: {
        type: Date,
        required: [true, 'Start date is required'],
        default: Date.now
    },
    deadline: {
        type: Date,
        required: [true, 'Deadline is required'],
        validate: {
            validator: function(value) {
                return value > this.startDate;
            },
            message: 'Deadline must be after start date'
        }
    },
    priority: {
        type: String,
        required: [true, 'Priority is required'],
        enum: {
            values: ['low', 'medium', 'high', 'urgent'],
            message: 'Priority must be low, medium, high, or urgent'
        },
        default: 'medium'
    },
    status: {
        type: String,
        required: true,
        enum: {
            values: ['created', 'assigned', 'in_progress', 'completed', 'approved', 'rejected', 'transferred', 'pending'],
            message: 'Invalid status value'
        },
        default: 'created'
    },
    stage: {
        type: String,
        required: true,
        enum: {
            values: ['not_started', 'pending', 'done'],
            message: 'Invalid stage value'
        },
        default: 'not_started'
    },
    timeToComplete: {
        type: Number, // in milliseconds - calculated when task is completed
        min: [0, 'Time to complete cannot be negative']
    },
    
    // User references
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Task creator is required']
    },
    assignedTo: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        assignedAt: {
            type: Date,
            default: Date.now
        },
        individualStage: {
            type: String,
            enum: {
                values: ['not_started', 'pending', 'done'],
                message: 'Invalid individual stage value'
            },
            default: 'not_started'
        },
        status: {
            type: String,
            enum: {
                values: ['assigned', 'in_progress', 'completed', 'blocked'],
                message: 'Invalid assignment status value'
            },
            default: 'assigned'
        },
        // Individual approval workflow
        approval: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        approvalAt: Date,
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        rejectionReason: String,
        completedAt: Date,
        notes: String // For individual notes/remarks specific to this assignee
    }],
    
    // Overviewers - users who can view and monitor task progress but not modify
    overviewers: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        addedAt: {
            type: Date,
            default: Date.now
        },
        permissions: {
            canViewDetails: {
                type: Boolean,
                default: true
            },
            canViewAttachments: {
                type: Boolean,
                default: true
            },
            canViewRemarks: {
                type: Boolean,
                default: true
            },
            canViewProgress: {
                type: Boolean,
                default: true
            }
        }
    }],
    
    // Department and cross-department handling
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: [true, 'Department is required']
    },
    crossDepartmentInvolvement: [{
        department: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Department'
        },
        role: {
            type: String,
            enum: ['collaborator', 'approver', 'observer']
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        }
    }],
    
    // Task content
    attachments: [attachmentSchema],
    remarks: {
        creator: [remarkSchema],
        assignee: [remarkSchema],
        general: [remarkSchema]
    },
    
    // Task type and grouping
    isGroupTask: {
        type: Boolean,
        default: false
    },
    parentTask: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task'
    },
    subTasks: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task'
    }],
    
    // Approval and completion
    completedAt: Date,
    approvedAt: Date,
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Email-based approval system
    approvalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        // No default - will be undefined until set
    },
    approvalDate: Date,
    approvalTokens: [{
        token: String,
        action: {
            type: String,
            enum: ['approve', 'reject']
        },
        generatedAt: {
            type: Date,
            default: Date.now
        },
        expiresAt: Date,
        used: {
            type: Boolean,
            default: false
        }
    }],
    
    // Transfer history
    transferHistory: [{
        from: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        to: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String,
        transferredAt: {
            type: Date,
            default: Date.now
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    
    // Reminder tracking
    lastReminderSent: {
        type: Date
    },
    
    // Metadata
    isActive: {
        type: Boolean,
        default: true
    },
    tags: [String]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
taskSchema.index({ createdBy: 1 });
taskSchema.index({ 'assignedTo.user': 1 });
taskSchema.index({ department: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ deadline: 1 });
taskSchema.index({ createdAt: 1 });

// Compound indexes
taskSchema.index({ status: 1, priority: 1 });
taskSchema.index({ department: 1, status: 1 });

// Virtual for days remaining
taskSchema.virtual('daysRemaining').get(function() {
    if (!this.deadline) return null;
    const now = new Date();
    const deadline = new Date(this.deadline);
    const diffTime = deadline - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for overdue status
taskSchema.virtual('isOverdue').get(function() {
    if (!this.deadline || this.status === 'completed' || this.status === 'approved') return false;
    return new Date() > new Date(this.deadline);
});

// Virtual for formatted time to complete
taskSchema.virtual('formattedTimeToComplete').get(function() {
    if (!this.timeToComplete) return null;
    
    const milliseconds = this.timeToComplete;
    const days = Math.floor(milliseconds / (1000 * 60 * 60 * 24));
    const hours = Math.floor((milliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 || result === '') result += `${minutes}m`;
    
    return result.trim();
});

// Pre-save middleware
taskSchema.pre('save', async function(next) {
    // Auto-update completedAt and calculate timeToComplete if task is completed
    if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
        this.completedAt = new Date();
        // Calculate time to complete in milliseconds from startDate to completedAt
        if (this.startDate) {
            this.timeToComplete = this.completedAt.getTime() - this.startDate.getTime();
        }
    }
    
    // Auto-update approvedAt if task is approved
    if (this.isModified('status') && this.status === 'approved' && !this.approvedAt) {
        this.approvedAt = new Date();
    }
    
    next();
});

// Instance methods
taskSchema.methods.addRemark = function(text, authorId, authorRole, category = 'general') {
    const remark = {
        text,
        author: authorId,
        authorRole,
        createdAt: new Date()
    };
    
    if (!this.remarks[category]) {
        this.remarks[category] = [];
    }
    
    this.remarks[category].push(remark);
    return this.save();
};

taskSchema.methods.assignToUser = function(userId) {
    const existingAssignment = this.assignedTo.find(
        assignment => assignment.user.toString() === userId.toString()
    );
    
    if (!existingAssignment) {
        this.assignedTo.push({
            user: userId,
            assignedAt: new Date(),
            status: 'assigned'
        });
    }
    
    return this.save();
};

taskSchema.methods.transferTo = function(fromUserId, toUserId, reason, approvedBy) {
    // Remove from current assignment
    this.assignedTo = this.assignedTo.filter(
        assignment => assignment.user.toString() !== fromUserId.toString()
    );
    
    // Add to new assignment
    this.assignedTo.push({
        user: toUserId,
        assignedAt: new Date(),
        status: 'assigned'
    });
    
    // Add to transfer history
    this.transferHistory.push({
        from: fromUserId,
        to: toUserId,
        reason,
        transferredAt: new Date(),
        approvedBy
    });
    
    this.status = 'transferred';
    return this.save();
};

taskSchema.methods.updateStage = function(newStage) {
    const stageOrder = ['not_started', 'pending', 'done'];
    const currentIndex = stageOrder.indexOf(this.stage);
    const newIndex = stageOrder.indexOf(newStage);
    
    if (newIndex > currentIndex || newStage === 'done') {
        this.stage = newStage;
        
        if (newStage === 'done') {
            // Remove automatic status change - let creator decide via approve/reject
            this.completedAt = new Date();
            // Calculate time to complete in milliseconds from startDate to completedAt
            if (this.startDate) {
                this.timeToComplete = this.completedAt.getTime() - this.startDate.getTime();
            }
        }
        
        return this.save();
    } else {
        throw new Error('Cannot move to a previous stage');
    }
};

// Overviewer management methods
taskSchema.methods.addOverviewer = function(userId, addedBy, permissions = {}) {
    // Check if user is already an overviewer
    const existingOverviewer = this.overviewers.find(
        ov => ov.user.toString() === userId.toString()
    );
    
    if (existingOverviewer) {
        throw new Error('User is already an overviewer for this task');
    }
    
    // Check if user is already assigned to the task
    const isAssigned = this.assignedTo.some(
        assignment => assignment.user.toString() === userId.toString()
    );
    
    if (isAssigned) {
        throw new Error('Cannot add assigned user as overviewer');
    }
    
    // Check if user is the task creator
    if (this.createdBy.toString() === userId.toString()) {
        throw new Error('Task creator already has full access');
    }
    
    const defaultPermissions = {
        canViewDetails: true,
        canViewAttachments: true,
        canViewRemarks: true,
        canViewProgress: true
    };
    
    this.overviewers.push({
        user: userId,
        addedBy: addedBy,
        addedAt: new Date(),
        permissions: { ...defaultPermissions, ...permissions }
    });
    
    return this.save();
};

taskSchema.methods.removeOverviewer = function(userId, removedBy) {
    const overviewerIndex = this.overviewers.findIndex(
        ov => ov.user.toString() === userId.toString()
    );
    
    if (overviewerIndex === -1) {
        throw new Error('User is not an overviewer for this task');
    }
    
    // Only assignees or the one who added the overviewer can remove them
    const overviewer = this.overviewers[overviewerIndex];
    const isAssignee = this.assignedTo.some(
        assignment => assignment.user.toString() === removedBy.toString()
    );
    const isCreator = this.createdBy.toString() === removedBy.toString();
    const wasAddedByRemover = overviewer.addedBy.toString() === removedBy.toString();
    
    if (!isAssignee && !isCreator && !wasAddedByRemover) {
        throw new Error('Only assignees or the user who added the overviewer can remove them');
    }
    
    this.overviewers.splice(overviewerIndex, 1);
    return this.save();
};

taskSchema.methods.updateOverviewerPermissions = function(userId, permissions, updatedBy) {
    const overviewer = this.overviewers.find(
        ov => ov.user.toString() === userId.toString()
    );
    
    if (!overviewer) {
        throw new Error('User is not an overviewer for this task');
    }
    
    // Only assignees or the one who added the overviewer can update permissions
    const isAssignee = this.assignedTo.some(
        assignment => assignment.user.toString() === updatedBy.toString()
    );
    const isCreator = this.createdBy.toString() === updatedBy.toString();
    const wasAddedByUpdater = overviewer.addedBy.toString() === updatedBy.toString();
    
    if (!isAssignee && !isCreator && !wasAddedByUpdater) {
        throw new Error('Only assignees or the user who added the overviewer can update permissions');
    }
    
    overviewer.permissions = { ...overviewer.permissions, ...permissions };
    return this.save();
};

// Static methods
taskSchema.statics.findByUser = function(userId, role = 'assignedTo') {
    if (role === 'assignedTo') {
        return this.find({ 'assignedTo.user': userId });
    } else if (role === 'creator') {
        return this.find({ createdBy: userId });
    } else if (role === 'overviewer') {
        return this.find({ 'overviewers.user': userId });
    }
};

taskSchema.statics.findByDepartment = function(departmentId) {
    return this.find({ department: departmentId });
};

taskSchema.statics.findByStatus = function(status) {
    return this.find({ status });
};

taskSchema.statics.findOverdue = function() {
    return this.find({
        deadline: { $lt: new Date() },
        status: { $nin: ['completed', 'approved'] }
    });
};

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
