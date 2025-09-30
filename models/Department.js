const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Department name is required'],
        unique: true,
        trim: true,
        maxlength: [100, 'Department name cannot exceed 100 characters']
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
