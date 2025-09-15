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
        enum: ['employee', 'hod', 'admin']
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
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
        type: String,
        required: [true, 'Task description is required'],
        trim: true,
        maxlength: [2000, 'Description cannot exceed 2000 characters']
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
            values: ['created', 'approved', 'rejected', 'transferred'],
            message: 'Invalid status value'
        },
        default: 'created'
    },
    stage: {
        type: String,
        required: true,
        enum: {
            values: ['planning', 'pending', 'done'],
            message: 'Invalid stage value'
        },
        default: 'planning'
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
    const stageOrder = ['planning', 'development', 'testing', 'review', 'deployment', 'completed'];
    const currentIndex = stageOrder.indexOf(this.stage);
    const newIndex = stageOrder.indexOf(newStage);
    
    if (newIndex > currentIndex || newStage === 'completed') {
        this.stage = newStage;
        
        if (newStage === 'completed') {
            this.status = 'completed';
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

// Static methods
taskSchema.statics.findByUser = function(userId, role = 'assignedTo') {
    if (role === 'assignedTo') {
        return this.find({ 'assignedTo.user': userId });
    } else if (role === 'creator') {
        return this.find({ createdBy: userId });
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
