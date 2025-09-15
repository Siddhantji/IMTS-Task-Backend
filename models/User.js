const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please enter a valid email address'
        ]
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false // Don't include password in queries by default
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number']
    },
    role: {
        type: String,
        required: [true, 'Role is required'],
        enum: {
            values: ['worker', 'giver', 'hod', 'observer'],
            message: 'Role must be either worker, giver, hod, or observer'
        }
    },
    department: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
        required: [true, 'Department is required']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    refreshTokens: [{
        token: String,
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 2592000 // 30 days
        }
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ department: 1 });
userSchema.index({ role: 1 });

// Virtual for full name formatting
userSchema.virtual('displayName').get(function() {
    return this.name;
});

// Virtual for role permissions
userSchema.virtual('permissions').get(function() {
    const rolePermissions = {
        worker: ['view_assigned_tasks', 'update_task_status', 'add_remarks'],
        giver: ['create_tasks', 'assign_tasks', 'approve_tasks', 'view_department_tasks'],
        hod: ['approve_transfers', 'view_all_department_tasks', 'manage_department'],
        observer: ['view_tasks']
    };
    return rolePermissions[this.role] || [];
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return next();
    
    try {
        // Hash password with cost of 12
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};

// Instance method to generate JWT token
userSchema.methods.generateJWT = function() {
    const payload = {
        id: this._id,
        email: this.email,
        role: this.role,
        department: this.department
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
};

// Instance method to generate refresh token
userSchema.methods.generateRefreshToken = function() {
    const payload = {
        id: this._id,
        type: 'refresh'
    };
    
    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
    });
};

// Instance method to check role permissions
userSchema.methods.hasPermission = function(permission) {
    return this.permissions.includes(permission);
};

// Instance method to check if user can access department
userSchema.methods.canAccessDepartment = function(departmentId) {
    // HODs can access their own department
    // Givers can access their own department
    // Workers can access their own department
    // Observers can access their own department
    return this.department.toString() === departmentId.toString();
};

// Static method to find by email
userSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() });
};

// Static method to find by role
userSchema.statics.findByRole = function(role) {
    return this.find({ role });
};

// Static method to find by department
userSchema.statics.findByDepartment = function(departmentId) {
    return this.find({ department: departmentId });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
