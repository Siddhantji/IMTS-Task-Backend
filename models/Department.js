const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Department name is required'],
        unique: true,
        trim: true,
        maxlength: [100, 'Department name cannot exceed 100 characters']
    },
    code: {
        type: String,
        required: [true, 'Department code is required'],
        unique: true,
        uppercase: true,
        trim: true,
        maxlength: [10, 'Department code cannot exceed 10 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    hod: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
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

// Indexes
departmentSchema.index({ code: 1 });
departmentSchema.index({ name: 1 });

// Virtual to get all users in department
departmentSchema.virtual('users', {
    ref: 'User',
    localField: '_id',
    foreignField: 'department'
});

// Virtual to get department tasks
departmentSchema.virtual('tasks', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'department'
});

const Department = mongoose.model('Department', departmentSchema);

module.exports = Department;
