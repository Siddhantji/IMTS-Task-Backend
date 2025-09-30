const { Task, TaskHistory, User, Notification } = require('../models');
const NotificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const { logger } = require('../utils/logger');
const upload = require('../config/upload');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

/**
 * Create a new task
 */
const createTask = async (req, res) => {
    try {
        const {
            title,
            description,
            deadline,
            priority,
            assignedTo,
            tags,
            isGroupTask
        } = req.body;

        // Parse assignedTo, tags, and isGroupTask if they come as JSON strings (from FormData)
        let parsedAssignedTo = assignedTo;
        let parsedTags = tags;
        let parsedIsGroupTask = isGroupTask;

        // Handle assignedTo parsing
        if (typeof assignedTo === 'string') {
            try {
                parsedAssignedTo = JSON.parse(assignedTo);
            } catch (e) {
                parsedAssignedTo = [];
            }
        } else if (Array.isArray(assignedTo)) {
            parsedAssignedTo = assignedTo;
        } else {
            parsedAssignedTo = [];
        }

        // Handle tags parsing (though tags validation is removed)
        if (typeof tags === 'string') {
            try {
                parsedTags = JSON.parse(tags);
            } catch (e) {
                parsedTags = [];
            }
        } else if (Array.isArray(tags)) {
            parsedTags = tags;
        } else {
            parsedTags = [];
        }

        if (typeof isGroupTask === 'string') {
            try {
                parsedIsGroupTask = JSON.parse(isGroupTask);
            } catch (e) {
                parsedIsGroupTask = false;
            }
        } else if (typeof isGroupTask === 'boolean') {
            parsedIsGroupTask = isGroupTask;
        } else {
            parsedIsGroupTask = false;
        }

    console.log('Task creation debug:');
    console.log('Raw isGroupTask:', isGroupTask);
    console.log('Parsed isGroupTask:', parsedIsGroupTask);
    console.log('Assigned users count:', parsedAssignedTo ? parsedAssignedTo.length : 0);
    const inferredIsGroup = Array.isArray(parsedAssignedTo) && parsedAssignedTo.length > 1;
    const computedIsGroupTask = (parsedIsGroupTask === true) || inferredIsGroup;
    console.log('Will be group task:', computedIsGroupTask);

        // Process file attachments
        const attachments = req.files ? req.files.map(file => ({
            filename: file.filename,
            originalName: file.originalname,
            path: path.relative(path.join(__dirname, '../'), file.path),
            size: file.size,
            mimetype: file.mimetype,
            uploadedBy: req.user._id
        })) : [];

        // Create new task
        const task = new Task({
            title,
            description,
            deadline: new Date(deadline),
            priority,
            createdBy: req.user._id,
            department: req.user.department._id,
            assignedTo: parsedAssignedTo ? parsedAssignedTo.map(userId => ({ user: userId })) : [],
            tags: parsedTags || [],
            attachments,
            // Force group task if multiple assignees, or if explicitly true
            isGroupTask: computedIsGroupTask
        });

        await task.save();

        // Create task history entry
        await TaskHistory.createEntry(
            task._id,
            'created',
            req.user._id,
            { 
                description: 'Task created',
                attachmentCount: attachments.length
            }
        );

        // Send notifications to assigned users
        if (parsedAssignedTo && parsedAssignedTo.length > 0) {
            for (const userId of parsedAssignedTo) {
                await Notification.createTaskNotification(
                    'task_assigned',
                    task._id,
                    userId,
                    req.user._id
                );
            }
        }

        // Populate the task before sending emails
        const populatedTask = await Task.findById(task._id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

        // Send assignment emails to assigned users
        try {
            if (parsedAssignedTo && parsedAssignedTo.length > 0) {
                console.log('📧 Sending task assignment emails');
                const assignees = populatedTask.assignedTo.map(assigned => assigned.user);
                await emailService.sendTaskAssignmentEmail(populatedTask, assignees, req.user);
            }
        } catch (emailError) {
            console.error('Error sending task assignment emails:', emailError);
            // Don't fail the whole operation if email fails
        }

        logger.info(`New task created: ${task.title} by ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: 'Task created successfully',
            data: { task: populatedTask }
        });

    } catch (error) {
        logger.error('Create task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create task',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get all tasks with filtering and pagination
 */
const getTasks = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            priority,
            stage,
            assignedTo,
            createdBy,
            department,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        // Build filter query
        const filter = { isActive: true };

        // Department-based filtering
        if (req.user.role !== 'hod' && req.user.role !== 'admin') {
            filter.department = req.user.department._id;
        } else if (department) {
            filter.department = department;
        }

        // Status filter
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        if (stage) filter.stage = stage;
        if (createdBy) filter.createdBy = createdBy;
        if (assignedTo) filter['assignedTo.user'] = assignedTo;

        // Search functionality
        if (search) {
            filter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Role-based filtering
        if (req.user.role === 'employee') {
            // Employees can see tasks assigned to them or created by them
            filter.$or = [
                { 'assignedTo.user': req.user._id },
                { createdBy: req.user._id }
            ];
        }
        // HODs and admins can see all tasks in their scope (already handled above)

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const tasks = await Task.find(filter)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Task.countDocuments(filter);

        res.json({
            success: true,
            data: {
                tasks,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalTasks: total,
                    hasNextPage: page * limit < total,
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        logger.error('Get tasks error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get tasks',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get single task by ID
 */
const getTask = async (req, res) => {
    try {
        const { id } = req.params;

        const task = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name')
            .populate('remarks.creator.author', 'name email role')
            .populate('remarks.assignee.author', 'name email role')
            .populate('remarks.general.author', 'name email role');

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Get task history
        const history = await TaskHistory.getTaskHistory(id, 20);

        res.json({
            success: true,
            data: {
                task,
                history
            }
        });

    } catch (error) {
        logger.error('Get task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get task',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update task status
 */
const updateTaskStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reason } = req.body;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const oldStatus = task.status;
        task.status = status;

        // Don't allow setting approvalStatus to null via this endpoint
        // This field should only be set by the email approval system
        if (req.body.approvalStatus === null || req.body.approvalStatus === 'null') {
            delete req.body.approvalStatus;
        }
        
        // Prevent approvalStatus from being set to null accidentally
        if (task.approvalStatus === null) {
            task.approvalStatus = undefined;
        }

        // Handle status-specific logic
        if (status === 'completed') {
            task.completedAt = new Date();
        } else if (status === 'approved') {
            task.approvedAt = new Date();
            task.approvedBy = req.user._id;
        } else if (status === 'in_progress' && oldStatus === 'rejected') {
            // Allow rejected tasks to be moved back to in_progress for rework
            task.completedAt = undefined;
            task.approvedAt = undefined;
            task.approvedBy = undefined;
            // Also reset stage to pending if it was done
            if (task.stage === 'done') {
                task.stage = 'pending';
            }
        } else if (status === 'rejected') {
            // When rejecting, clear completion/approval data and reset stage to pending
            task.completedAt = undefined;
            task.approvedAt = undefined;
            task.approvedBy = undefined;
            task.stage = 'pending'; // Auto-reset stage to pending when rejected
        }

        await task.save();

        // Create history entry
        await TaskHistory.createEntry(
            task._id,
            'status_changed',
            req.user._id,
            {
                field: 'status',
                oldValue: oldStatus,
                newValue: status,
                description: reason || `Status changed from ${oldStatus} to ${status}`
            }
        );

        // Send notifications based on status change
        if (status === 'completed') {
            await Notification.createTaskNotification(
                'task_completed',
                task._id,
                task.createdBy,
                req.user._id
            );
        } else if (status === 'approved') {
            // Notify all assigned users
            for (const assignment of task.assignedTo) {
                await Notification.createTaskNotification(
                    'task_approved',
                    task._id,
                    assignment.user,
                    req.user._id
                );
            }
        } else if (status === 'rejected') {
            // Notify all assigned users
            for (const assignment of task.assignedTo) {
                await Notification.createTaskNotification(
                    'task_rejected',
                    task._id,
                    assignment.user,
                    req.user._id
                );
            }
        }

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

        logger.info(`Task status updated: ${task.title} from ${oldStatus} to ${status} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Task status updated successfully',
            data: { task: updatedTask }
        });

    } catch (error) {
        logger.error('Update task status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update task status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update task stage
 */
const updateTaskStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { stage, reason } = req.body;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const oldStage = task.stage;
        
        try {
            await task.updateStage(stage);
        } catch (stageError) {
            return res.status(400).json({
                success: false,
                message: stageError.message
            });
        }

        // When stage is set to 'done', automatically set status to 'pending' for approval
        if (stage === 'done' && oldStage !== 'done') {
            task.status = 'pending';
            await task.save();
            console.log(`📋 Task stage updated to 'done', status automatically set to 'pending' for approval: ${task.title}`);
        }

        // Create history entry
        await TaskHistory.createEntry(
            task._id,
            'stage_changed',
            req.user._id,
            {
                field: 'stage',
                oldValue: oldStage,
                newValue: stage,
                description: reason || `Stage changed from ${oldStage} to ${stage}`
            }
        );

        // Send notifications for stage changes
        const notificationRecipients = new Set();
        
        // Notify task creator if they didn't make the change
        if (task.createdBy.toString() !== req.user._id.toString()) {
            notificationRecipients.add(task.createdBy.toString());
        }
        
        // Notify all assigned users if they didn't make the change
        task.assignedTo.forEach(assignment => {
            if (assignment.user.toString() !== req.user._id.toString()) {
                notificationRecipients.add(assignment.user.toString());
            }
        });
        
        // Send notifications to all recipients
        for (const recipientId of notificationRecipients) {
            try {
                await Notification.createNotification({
                    type: 'status_changed',
                    recipient: recipientId,
                    title: `Task stage updated: ${task.title}`,
                    message: `Task stage changed from "${oldStage}" to "${stage}"${reason ? ` - ${reason}` : ''}`,
                    priority: 'medium',
                    relatedTask: task._id,
                    createdBy: req.user._id,
                    channels: {
                        inApp: { enabled: true },
                        email: { enabled: false }
                    }
                });
            } catch (notificationError) {
                console.error('Error creating stage change notification:', notificationError);
                // Don't fail the whole operation if notification fails
            }
        }

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

        // Send email notifications for stage changes
        try {
            // If stage changed to "done", send approval email to task creator
            if (stage === 'done' && oldStage !== 'done') {
                console.log('📧 Sending task completion email for stage change to "done"');
                
                // Generate approval tokens
                const { generateApprovalToken } = require('../routes/emailApproval');
                const approveToken = generateApprovalToken(updatedTask._id, updatedTask.createdBy._id, 'approve', '7d');
                const rejectToken = generateApprovalToken(updatedTask._id, updatedTask.createdBy._id, 'reject', '7d');
                
                const approvalTokens = {
                    approve: approveToken,
                    reject: rejectToken
                };
                
                // Save tokens to task for tracking (optional)
                updatedTask.approvalTokens = updatedTask.approvalTokens || [];
                updatedTask.approvalTokens.push(
                    {
                        token: approveToken,
                        action: 'approve',
                        generatedAt: new Date(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        used: false
                    },
                    {
                        token: rejectToken,
                        action: 'reject',
                        generatedAt: new Date(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        used: false
                    }
                );
                await updatedTask.save();
                
                // Send email with approval tokens
                await emailService.sendTaskCompletionEmail(updatedTask, req.user, approvalTokens);
            }
        } catch (emailError) {
            console.error('Error sending stage change email:', emailError);
            // Don't fail the whole operation if email fails
        }

        logger.info(`Task stage updated: ${task.title} from ${oldStage} to ${stage} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Task stage updated successfully',
            data: { task: updatedTask }
        });

    } catch (error) {
        logger.error('Update task stage error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update task stage',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Add remark to task
 */
const addRemark = async (req, res) => {
    try {
        const { id } = req.params;
        const { text, category = 'general' } = req.body;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Determine category based on user role if not specified
        let remarkCategory = category;
        if (category === 'auto') {
            if (req.user._id.toString() === task.createdBy.toString() || req.user.role === 'hod' || req.user.role === 'admin') {
                remarkCategory = 'creator';
            } else if (task.assignedTo.some(assignment => assignment.user.toString() === req.user._id.toString())) {
                remarkCategory = 'assignee';
            } else {
                remarkCategory = 'general';
            }
        }

        await task.addRemark(text, req.user._id, req.user.role, remarkCategory);

        // Create history entry
        await TaskHistory.createEntry(
            task._id,
            'remark_added',
            req.user._id,
            {
                description: `${remarkCategory} remark added: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`
            }
        );

        // Send notification to relevant users
        const notificationRecipients = [];
        if (task.assignedTo.some(assignment => assignment.user.toString() === req.user._id.toString())) {
            // If assignee added remark, notify creator
            notificationRecipients.push(task.createdBy);
        } else if (req.user._id.toString() === task.createdBy.toString() || req.user.role === 'hod' || req.user.role === 'admin') {
            // If creator/hod/admin added remark, notify assigned users
            task.assignedTo.forEach(assignment => {
                notificationRecipients.push(assignment.user);
            });
        }

        for (const recipientId of notificationRecipients) {
            await Notification.createNotification({
                recipient: recipientId,
                sender: req.user._id,
                type: 'remark_added',
                title: `New remark on task: ${task.title}`,
                message: `${req.user.name} added a remark: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`,
                relatedTask: task._id
            });
        }

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name')
            .populate('remarks.creator.author', 'name email role')
            .populate('remarks.assignee.author', 'name email role')
            .populate('remarks.general.author', 'name email role');

        // Send remark notification emails
        try {
            console.log('📧 Sending remark notification emails');
            const remark = { text, createdBy: req.user._id, createdAt: new Date() };
            await emailService.sendRemarkAddedEmail(updatedTask, remark, req.user);
        } catch (emailError) {
            console.error('Error sending remark notification emails:', emailError);
            // Don't fail the whole operation if email fails
        }

        logger.info(`Remark added to task: ${task.title} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Remark added successfully',
            data: { task: updatedTask }
        });

    } catch (error) {
        logger.error('Add remark error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add remark',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Assign task to users
 */
const assignTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { userIds, reason } = req.body;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Verify all users exist and are active
        const users = await User.find({
            _id: { $in: userIds },
            role: { $in: ['employee', 'hod', 'admin'] },
            isActive: true
        });

        if (users.length !== userIds.length) {
            return res.status(400).json({
                success: false,
                message: 'Some users are not valid workers'
            });
        }

        // Clear existing assignments and add new ones
        task.assignedTo = userIds.map(userId => ({
            user: userId,
            assignedAt: new Date(),
            status: 'assigned'
        }));

        // Recompute group flag based on count regardless of previous value
        const willBeGroup = Array.isArray(userIds) && userIds.length > 1;
        task.isGroupTask = willBeGroup || task.isGroupTask === true;

        console.log('Assign task debug:', {
            taskId: task._id.toString(),
            assigneeCount: userIds.length,
            willBeGroup
        });

        await task.save();

        // Create history entry
        await TaskHistory.createEntry(
            task._id,
            'assigned',
            req.user._id,
            {
                description: reason || `Task assigned to ${users.map(u => u.name).join(', ')}`
            }
        );

        // Send notifications to assigned users
        for (const userId of userIds) {
            await Notification.createTaskNotification(
                'task_assigned',
                task._id,
                userId,
                req.user._id
            );
        }

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

        logger.info(`Task assigned: ${task.title} to ${users.map(u => u.name).join(', ')} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Task assigned successfully',
            data: { task: updatedTask }
        });

    } catch (error) {
        logger.error('Assign task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign task',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update task details
 */
const updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            deadline,
            priority,
            tags
        } = req.body;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Store old values for history
        const changes = [];
        if (title && title !== task.title) {
            changes.push({ field: 'title', oldValue: task.title, newValue: title });
            task.title = title;
        }
        if (description && description !== task.description) {
            changes.push({ field: 'description', oldValue: task.description, newValue: description });
            task.description = description;
        }
        if (deadline && new Date(deadline).getTime() !== new Date(task.deadline).getTime()) {
            changes.push({ field: 'deadline', oldValue: task.deadline, newValue: new Date(deadline) });
            task.deadline = new Date(deadline);
        }
        if (priority && priority !== task.priority) {
            changes.push({ field: 'priority', oldValue: task.priority, newValue: priority });
            task.priority = priority;
        }
        if (tags) {
            task.tags = tags;
        }

        // Process new file attachments
        if (req.files && req.files.length > 0) {
            const newAttachments = req.files.map(file => ({
                filename: file.filename,
                originalName: file.originalname,
                path: path.relative(path.join(__dirname, '../'), file.path),
                size: file.size,
                mimetype: file.mimetype,
                uploadedBy: req.user._id
            }));
            
            task.attachments.push(...newAttachments);
            changes.push({
                field: 'attachments_added',
                newValue: newAttachments.length,
                attachments: newAttachments.map(att => att.originalName)
            });
        }

        // Handle attachment removal
        const { removeAttachments } = req.body;
        if (removeAttachments && removeAttachments.length > 0) {
            const removedAttachments = [];
            
            for (const attachmentId of removeAttachments) {
                const attachmentIndex = task.attachments.findIndex(
                    att => att._id.toString() === attachmentId
                );
                
                if (attachmentIndex !== -1) {
                    const attachment = task.attachments[attachmentIndex];
                    
                    // Check permissions - only uploader, task creator, HOD, or admin can delete
                    if (attachment.uploadedBy.toString() === req.user._id.toString() ||
                        task.createdBy.toString() === req.user._id.toString() ||
                        req.user.role === 'hod' || req.user.role === 'admin') {
                        
                        // Delete file from filesystem
                        const filePath = path.join(__dirname, '../', attachment.path);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                        
                        removedAttachments.push(attachment.originalName);
                        task.attachments.splice(attachmentIndex, 1);
                    }
                }
            }
            
            if (removedAttachments.length > 0) {
                changes.push({
                    field: 'attachments_removed',
                    newValue: removedAttachments.length,
                    attachments: removedAttachments
                });
            }
        }

        await task.save();

        // Create history entries for each change
        for (const change of changes) {
            await TaskHistory.createEntry(
                task._id,
                change.field === 'deadline' ? 'deadline_changed' : 
                change.field === 'priority' ? 'priority_changed' : 
                change.field === 'attachments_added' ? 'attachments_added' : 
                change.field === 'attachments_removed' ? 'attachments_removed' : 'updated',
                req.user._id,
                change
            );
        }

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

        logger.info(`Task updated: ${task.title} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Task updated successfully',
            data: { task: updatedTask }
        });

    } catch (error) {
        logger.error('Update task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update task',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update individual stage for group task member
 */
const updateIndividualStage = async (req, res) => {
    try {
        const { id } = req.params;
        const { stage, status, notes } = req.body;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Find the user's assignment in the task
        const assignmentIndex = task.assignedTo.findIndex(
            assignment => assignment.user.toString() === req.user._id.toString()
        );

        if (assignmentIndex === -1) {
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to this task'
            });
        }

        const assignment = task.assignedTo[assignmentIndex];
        const oldStage = assignment.individualStage;
        const oldStatus = assignment.status;

        // Update the individual stage and status
        if (stage) assignment.individualStage = stage;
        if (status) assignment.status = status;
        if (notes !== undefined) assignment.notes = notes;

        // When individual stage is set to 'done', set status to 'completed' and approval to 'pending'
        if (stage === 'done' && oldStage !== 'done') {
            assignment.status = 'completed'; // Valid status value
            assignment.approval = 'pending'; // Set approval status for workflow
            assignment.completedAt = new Date(); // Set completion time
            console.log(`📋 Individual stage updated to 'done':
                Task: ${task.title}
                User: ${req.user.name}
                Old Stage: ${oldStage} → New Stage: done
                Old Status: ${oldStatus} → New Status: completed
                Approval: pending`);
        }

        // Set completion time if marking as completed (redundant now but keeping for other cases)
        if (status === 'completed') {
            assignment.completedAt = new Date();
        }

        await task.save();

        // Create history entry for individual stage change
        if (stage && stage !== oldStage) {
            await TaskHistory.createEntry(
                task._id,
                'stage_changed',
                req.user._id,
                {
                    field: 'individual_stage',
                    oldValue: oldStage,
                    newValue: stage,
                    description: `Individual stage changed from ${oldStage} to ${stage}`,
                    assigneeId: req.user._id
                }
            );
        }

        // Create history entry for individual status change
        if (status && status !== oldStatus) {
            await TaskHistory.createEntry(
                task._id,
                'status_changed',
                req.user._id,
                {
                    field: 'individual_status',
                    oldValue: oldStatus,
                    newValue: status,
                    description: `Individual status changed from ${oldStatus} to ${status}`,
                    assigneeId: req.user._id
                }
            );
        }

        // Send notification to task creator and HOD about individual progress
        if (stage === 'done' || status === 'completed') {
            await Notification.createTaskNotification(
                'individual_task_completed',
                task._id,
                task.createdBy,
                req.user._id
            );
        }

        // For group tasks: notify other group members about stage changes
        if (task.isGroupTask && (stage && stage !== oldStage)) {
            const otherGroupMembers = task.assignedTo
                .filter(assignment => assignment.user.toString() !== req.user._id.toString())
                .map(assignment => assignment.user.toString());
            
            for (const memberId of otherGroupMembers) {
                try {
                    await Notification.createNotification({
                        type: 'status_changed',
                        recipient: memberId,
                        title: `Group task update: ${task.title}`,
                        message: `Team member updated their stage from "${oldStage}" to "${stage}"`,
                        priority: 'medium',
                        relatedTask: task._id,
                        createdBy: req.user._id,
                        channels: {
                            inApp: { enabled: true },
                            email: { enabled: false }
                        }
                    });
                } catch (notificationError) {
                    console.error('Error creating group task notification:', notificationError);
                }
            }
        }

        // Send email approval notification for individual task completion in group tasks
        if (stage === 'done' && oldStage !== 'done') {
            try {
                console.log('📧 Sending individual task completion email for approval');
                
                // Generate approval tokens for individual task completion
                const { generateApprovalToken } = require('../routes/emailApproval');
                const approveToken = generateApprovalToken(task._id, task.createdBy._id, 'approve', '7d', req.user._id);
                const rejectToken = generateApprovalToken(task._id, task.createdBy._id, 'reject', '7d', req.user._id);
                
                const approvalTokens = {
                    approve: approveToken,
                    reject: rejectToken
                };
                
                // Save tokens to task for tracking
                task.approvalTokens = task.approvalTokens || [];
                task.approvalTokens.push(
                    {
                        token: approveToken,
                        action: 'approve',
                        generatedAt: new Date(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        used: false
                    },
                    {
                        token: rejectToken,
                        action: 'reject',
                        generatedAt: new Date(),
                        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        used: false
                    }
                );
                await task.save();
                
                // Send email with approval tokens (will be populated in updatedTask query)
                const tempTask = await Task.findById(task._id)
                    .populate('createdBy', 'name email role')
                    .populate('assignedTo.user', 'name email role')
                    .populate('department', 'name');
                
                await emailService.sendGroupTaskIndividualCompletionEmail(tempTask, req.user, approvalTokens);
                console.log(`📧 Group task individual completion email sent for: ${task.title} (User: ${req.user.name})`);
            } catch (emailError) {
                console.error('Error sending individual task completion email:', emailError);
                // Don't fail the whole operation if email fails
            }
        }

        // For group tasks: reaching 'done' for all members is a milestone, not auto-closure.
        // Overall closure happens when all individual approvals are 'approved'.

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

        logger.info(`Individual stage updated: ${task.title} - ${req.user.email} set stage to ${stage || assignment.individualStage}`);

        res.json({
            success: true,
            message: 'Individual stage updated successfully',
            data: { 
                task: updatedTask,
                individualAssignment: updatedTask.assignedTo.find(
                    a => a.user._id.toString() === req.user._id.toString()
                )
            }
        });

    } catch (error) {
        logger.error('Update individual stage error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update individual stage',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Approve or reject an individual assignee's work on a group task
 */
const updateIndividualApproval = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, decision, reason } = req.body; // decision: 'approve' | 'reject'

        const task = await Task.findById(id).populate('assignedTo.user', 'name email role');
        if (!task) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        // Authorization: creator, HOD, or admin can approve/reject
        const isPrivileged = (
            task.createdBy.toString() === req.user._id.toString() ||
            req.user.role === 'hod' ||
            req.user.role === 'admin'
        );
        if (!isPrivileged) {
            return res.status(403).json({ success: false, message: 'Not authorized to approve/reject' });
        }

        const idx = task.assignedTo.findIndex(a => a.user._id.toString() === userId);
        if (idx === -1) {
            return res.status(400).json({ success: false, message: 'User is not assigned to this task' });
        }

        const assn = task.assignedTo[idx];
        const prevApproval = assn.approval || 'pending';

        if (decision === 'approve') {
            assn.approval = 'approved';
            assn.approvalAt = new Date();
            assn.approvedBy = req.user._id;
            assn.rejectionReason = undefined;
        } else if (decision === 'reject') {
            assn.approval = 'rejected';
            assn.approvalAt = new Date();
            assn.approvedBy = req.user._id;
            assn.rejectionReason = reason || '';
            // On rejection, move the assignee back to in_progress/pending
            assn.status = 'in_progress';
            assn.individualStage = 'pending';
            assn.completedAt = undefined;
        } else {
            return res.status(400).json({ success: false, message: 'Invalid decision' });
        }

        await task.save();

        // History entry using existing enums
        await TaskHistory.createEntry(
            task._id,
            decision === 'approve' ? 'approved' : 'rejected',
            req.user._id,
            {
                field: 'individual_approval',
                oldValue: prevApproval,
                newValue: assn.approval,
                description: `${decision === 'approve' ? 'Approved' : 'Rejected'} work of ${assn.user.name}${reason ? ` (Reason: ${reason})` : ''}`,
                assigneeId: assn.user._id
            }
        );

        // Auto-close when all approved; if any rejected, keep task open/in_progress
        if (task.isGroupTask) {
            const allCompleted = task.assignedTo.length > 0 && task.assignedTo.every(a => a.status === 'completed' || a.individualStage === 'done');
            const allApproved = task.assignedTo.length > 0 && task.assignedTo.every(a => a.approval === 'approved');
            const anyRejected = task.assignedTo.some(a => a.approval === 'rejected');

            if (allCompleted && allApproved) {
                task.status = 'completed';
                task.stage = 'done'; // Set stage to 'done' to indicate the group task is finished
                task.approvedAt = new Date();
                task.approvedBy = req.user._id;
                await task.save();
            } else if (anyRejected) {
                // Ensure task remains not approved/completed
                if (task.status === 'approved' || task.status === 'completed') {
                    task.status = 'in_progress';
                    task.stage = 'pending';
                    task.approvedAt = undefined;
                    task.approvedBy = undefined;
                    await task.save();
                }
            }
        }

        const updated = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

        return res.json({ success: true, message: 'Individual approval updated', data: { task: updated } });
    } catch (error) {
        logger.error('Update individual approval error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update individual approval', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
    }
};

/**
 * Delete task (soft delete)
 */
const deleteTask = async (req, res) => {
    try {
        const { id } = req.params;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        task.isActive = false;
        await task.save();

        logger.info(`Task deleted: ${task.title} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Task deleted successfully'
        });

    } catch (error) {
        logger.error('Delete task error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete task',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get task statistics
 */
const getTaskStats = async (req, res) => {
    try {
        const filter = { isActive: true };

        // Department-based filtering
        // Admins can see all departments; HODs and Employees limited to own department
        if (req.user.role === 'hod' || req.user.role === 'employee') {
            if (req.user.department && req.user.department._id) {
                filter.department = req.user.department._id;
            }
        }

        // Role-based filtering
        if (req.user.role === 'employee') {
            // Employees see tasks assigned to them or created by them
            filter.$or = [
                { 'assignedTo.user': req.user._id },
                { createdBy: req.user._id }
            ];
        }
        // HODs and admins see all tasks in their scope (already handled above)

        const stats = await Task.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    created: { $sum: { $cond: [{ $eq: ['$status', 'created'] }, 1, 0] } },
                    assigned: { $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] } },
                    in_progress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
                    completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
                    rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
                    high_priority: { $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] } },
                    urgent_priority: { $sum: { $cond: [{ $eq: ['$priority', 'urgent'] }, 1, 0] } },
                    overdue: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $lt: ['$deadline', new Date()] },
                                        { $nin: ['$status', ['completed', 'approved']] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: stats.length > 0 ? stats[0] : {
                total: 0,
                created: 0,
                assigned: 0,
                in_progress: 0,
                completed: 0,
                approved: 0,
                rejected: 0,
                high_priority: 0,
                urgent_priority: 0,
                overdue: 0
            }
        });

    } catch (error) {
        logger.error('Get task stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get task statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Add attachments to existing task
 */
const addAttachments = async (req, res) => {
    try {
        const { id } = req.params;
        
        logger.info(`Adding attachments to task ${id}. Files received:`, req.files?.length || 0);

        if (!req.files || req.files.length === 0) {
            logger.warn('No files provided in attachment request');
            return res.status(400).json({
                success: false,
                message: 'No files provided'
            });
        }

        const task = await Task.findById(id);
        if (!task) {
            logger.warn(`Task not found: ${id}`);
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        logger.info(`Processing ${req.files.length} files for task ${id}`);

        // Process attachments
        const newAttachments = req.files.map(file => {
            logger.info(`Processing file: ${file.originalname}, size: ${file.size}, path: ${file.path}`);
            return {
                filename: file.filename,
                originalName: file.originalname,
                path: path.relative(path.join(__dirname, '../'), file.path),
                size: file.size,
                mimetype: file.mimetype,
                uploadedBy: req.user._id,
                uploadedAt: new Date()
            };
        });

        task.attachments.push(...newAttachments);
        await task.save();
        
        logger.info(`Successfully saved ${newAttachments.length} attachments to task ${id}`);

        // Create task history entry
        await TaskHistory.createEntry(
            task._id,
            'attachments_added',
            req.user._id,
            {
                description: `Added ${newAttachments.length} attachment(s)`,
                attachments: newAttachments.map(att => att.originalName)
            }
        );

        logger.info(`Task history entry created for attachment addition to task ${id}`);

        res.status(201).json({
            success: true,
            message: 'Attachments added successfully',
            data: {
                attachments: newAttachments,
                count: newAttachments.length
            }
        });

    } catch (error) {
        logger.error('Add attachments error:', error);
        logger.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to add attachments',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Remove attachment from task
 */
const removeAttachment = async (req, res) => {
    try {
        const { id, attachmentId } = req.params;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const attachmentIndex = task.attachments.findIndex(
            att => att._id.toString() === attachmentId
        );

        if (attachmentIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Attachment not found'
            });
        }

        const attachment = task.attachments[attachmentIndex];

        // Check permissions - only uploader, task giver, or HOD can delete
        if (attachment.uploadedBy.toString() !== req.user._id.toString() &&
            task.giver.toString() !== req.user._id.toString() &&
            req.user.role !== 'hod') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this attachment'
            });
        }

        // Delete file from filesystem
        const filePath = path.join(__dirname, '../', attachment.path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove from task
        task.attachments.splice(attachmentIndex, 1);
        await task.save();

        // Create task history entry
        await TaskHistory.createEntry(
            task._id,
            'attachment_removed',
            req.user._id,
            {
                description: `Removed attachment: ${attachment.originalName}`,
                attachmentName: attachment.originalName
            }
        );

        res.json({
            success: true,
            message: 'Attachment removed successfully'
        });

    } catch (error) {
        logger.error('Remove attachment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove attachment',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Download task attachment
 */
const downloadAttachment = async (req, res) => {
    try {
        const { id, attachmentId } = req.params;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const attachment = task.attachments.find(
            att => att._id.toString() === attachmentId
        );

        if (!attachment) {
            return res.status(404).json({
                success: false,
                message: 'Attachment not found'
            });
        }

        const filePath = path.join(__dirname, '../', attachment.path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        // Set appropriate headers
        res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
        res.setHeader('Content-Type', attachment.mimetype);
        res.setHeader('Content-Length', attachment.size);

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        logger.error('Download attachment error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download attachment',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * View task attachment in browser (for PDFs) - PUBLIC ROUTE
 */
const viewAttachmentPublic = async (req, res) => {
    try {
        const { id, attachmentId } = req.params;

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const attachment = task.attachments.find(
            att => att._id.toString() === attachmentId
        );

        if (!attachment) {
            return res.status(404).json({
                success: false,
                message: 'Attachment not found'
            });
        }

        const filePath = path.join(__dirname, '../', attachment.path);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        // Set headers for inline viewing (especially for PDFs)
        res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName}"`);
        res.setHeader('Content-Type', attachment.mimetype);
        res.setHeader('Content-Length', attachment.size);
        
        // Add CORS headers to allow browser access
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Stream the file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

    } catch (error) {
        logger.error('View attachment public error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to view attachment',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get dashboard statistics for progress cards
 */
const getDashboardStats = async (req, res) => {
    try {
        const filter = { isActive: true };

        // Department-based filtering
        if (req.user.role !== 'admin') {
            filter.department = req.user.department._id;
        }

        // Role-based filtering for different stats
        let createdByMeFilter = { ...filter, createdBy: req.user._id };
        let assignedToMeFilter = { ...filter, 'assignedTo.user': req.user._id };
        let allAccessibleFilter = { ...filter };

        // For employees, they can only see tasks assigned to them or created by them
        if (req.user.role === 'employee') {
            allAccessibleFilter.$or = [
                { 'assignedTo.user': req.user._id },
                { createdBy: req.user._id }
            ];
        }

        // Get dashboard-specific statistics
        const [
            // Tasks assigned to me that are not started
            notStartedTasks,
            // Tasks assigned to me that are in progress or completed but not approved
            pendingTasks,
            // Tasks assigned to me that are completed and approved
            doneTasks
        ] = await Promise.all([
            // Not started (assigned to me but status is created or assigned)
            Task.countDocuments({
                ...assignedToMeFilter,
                status: { $in: ['created', 'assigned'] }
            }),
            
            // Pending (assigned to me and in progress or completed but not approved)
            Task.countDocuments({
                ...assignedToMeFilter,
                status: { $in: ['in_progress', 'completed'] }
            }),
            
            // Done (assigned to me and approved)
            Task.countDocuments({
                ...assignedToMeFilter,
                status: 'approved'
            })
        ]);

        // Calculate percentages for progress cards
        const totalAssignedToMe = notStartedTasks + pendingTasks + doneTasks;
        
        const stats = {
            notStarted: {
                count: notStartedTasks,
                label: 'Not Started',
                percentage: totalAssignedToMe > 0 ? Math.round((notStartedTasks / totalAssignedToMe) * 100) : 0
            },
            pending: {
                count: pendingTasks,
                label: 'Pending',
                percentage: totalAssignedToMe > 0 ? Math.round((pendingTasks / totalAssignedToMe) * 100) : 0
            },
            done: {
                count: doneTasks,
                label: 'Done',
                percentage: totalAssignedToMe > 0 ? Math.round((doneTasks / totalAssignedToMe) * 100) : 0
            },
            totalAssigned: totalAssignedToMe
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get dashboard statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Helper function to create task history and corresponding notifications
 */
const createTaskHistoryWithNotification = async (taskId, action, performedBy, changes = {}, metadata = {}) => {
    try {
        // Create task history entry
        const historyEntry = await TaskHistory.createEntry(
            taskId,
            action,
            performedBy,
            changes,
            metadata
        );

        // Populate the history entry for notification service
        await historyEntry.populate('performedBy', 'name email');

        // Create notifications based on the history entry (excluding remarks)
        if (action !== 'remark_added') {
            await NotificationService.createNotificationFromHistory(historyEntry);
        }

        return historyEntry;
    } catch (error) {
        logger.error('Error creating task history with notification:', error);
        throw error;
    }
};

/**
 * Add overviewer to a task
 */
const addOverviewer = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, permissions } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Check if current user is assignee or creator
        const isAssignee = task.assignedTo.some(
            assignment => assignment.user.toString() === req.user._id.toString()
        );
        const isCreator = task.createdBy.toString() === req.user._id.toString();

        if (!isAssignee && !isCreator) {
            return res.status(403).json({
                success: false,
                message: 'Only assignees can add overviewers to tasks'
            });
        }

        // Verify the user exists
        const userToAdd = await User.findById(userId);
        if (!userToAdd) {
            return res.status(404).json({
                success: false,
                message: 'User to add as overviewer not found'
            });
        }

        await task.addOverviewer(userId, req.user._id, permissions);

        // Create history entry
        await TaskHistory.createEntry(
            task._id,
            'overviewer_added',
            req.user._id,
            {
                field: 'overviewers',
                description: `Added ${userToAdd.name} as overviewer`,
                overviewerId: userId
            }
        );

        // Send notification to the new overviewer
        try {
            await Notification.createNotification({
                type: 'task_overviewer_added',
                recipient: userId,
                title: `Added as overviewer: ${task.title}`,
                message: `You have been added as an overviewer for task "${task.title}" by ${req.user.name}`,
                priority: 'medium',
                relatedTask: task._id,
                createdBy: req.user._id,
                channels: {
                    inApp: { enabled: true },
                    email: { enabled: false }
                }
            });
        } catch (notificationError) {
            console.error('Error creating overviewer notification:', notificationError);
        }

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('overviewers.user', 'name email role')
            .populate('overviewers.addedBy', 'name email role')
            .populate('department', 'name');

        logger.info(`Overviewer added: ${userToAdd.name} to task ${task.title} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Overviewer added successfully',
            data: { task: updatedTask }
        });

    } catch (error) {
        logger.error('Add overviewer error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to add overviewer',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Remove overviewer from a task
 */
const removeOverviewer = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const userToRemove = await User.findById(userId);
        if (!userToRemove) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await task.removeOverviewer(userId, req.user._id);

        // Create history entry
        await TaskHistory.createEntry(
            task._id,
            'overviewer_removed',
            req.user._id,
            {
                field: 'overviewers',
                description: `Removed ${userToRemove.name} as overviewer`,
                overviewerId: userId
            }
        );

        // Send notification to the removed overviewer
        try {
            await Notification.createNotification({
                type: 'task_overviewer_removed',
                recipient: userId,
                title: `Removed as overviewer: ${task.title}`,
                message: `You have been removed as an overviewer for task "${task.title}" by ${req.user.name}`,
                priority: 'low',
                relatedTask: task._id,
                createdBy: req.user._id,
                channels: {
                    inApp: { enabled: true },
                    email: { enabled: false }
                }
            });
        } catch (notificationError) {
            console.error('Error creating overviewer removal notification:', notificationError);
        }

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('overviewers.user', 'name email role')
            .populate('overviewers.addedBy', 'name email role')
            .populate('department', 'name');

        logger.info(`Overviewer removed: ${userToRemove.name} from task ${task.title} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Overviewer removed successfully',
            data: { task: updatedTask }
        });

    } catch (error) {
        logger.error('Remove overviewer error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to remove overviewer',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Update overviewer permissions
 */
const updateOverviewerPermissions = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, permissions } = req.body;

        if (!userId || !permissions) {
            return res.status(400).json({
                success: false,
                message: 'User ID and permissions are required'
            });
        }

        const task = await Task.findById(id);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const userToUpdate = await User.findById(userId);
        if (!userToUpdate) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await task.updateOverviewerPermissions(userId, permissions, req.user._id);

        // Create history entry
        await TaskHistory.createEntry(
            task._id,
            'overviewer_permissions_updated',
            req.user._id,
            {
                field: 'overviewer_permissions',
                description: `Updated permissions for overviewer ${userToUpdate.name}`,
                overviewerId: userId,
                newPermissions: permissions
            }
        );

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('overviewers.user', 'name email role')
            .populate('overviewers.addedBy', 'name email role')
            .populate('department', 'name');

        logger.info(`Overviewer permissions updated: ${userToUpdate.name} for task ${task.title} by ${req.user.email}`);

        res.json({
            success: true,
            message: 'Overviewer permissions updated successfully',
            data: { task: updatedTask }
        });

    } catch (error) {
        logger.error('Update overviewer permissions error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update overviewer permissions',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get tasks where user is an overviewer
 */
const getOverviewTasks = async (req, res) => {
    try {
        const tasks = await Task.findByUser(req.user._id, 'overviewer')
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('overviewers.user', 'name email role')
            .populate('overviewers.addedBy', 'name email role')
            .populate('department', 'name')
            .sort({ createdAt: -1 });

        // Filter tasks based on overviewer permissions
        const filteredTasks = tasks.map(task => {
            const overviewer = task.overviewers.find(
                ov => ov.user._id.toString() === req.user._id.toString()
            );

            if (!overviewer) return null;

            const taskObj = task.toObject();

            // Apply permission filters
            if (!overviewer.permissions.canViewDetails) {
                delete taskObj.description;
            }
            if (!overviewer.permissions.canViewAttachments) {
                delete taskObj.attachments;
            }
            if (!overviewer.permissions.canViewRemarks) {
                delete taskObj.remarks;
            }
            if (!overviewer.permissions.canViewProgress) {
                // Hide detailed progress info
                taskObj.assignedTo = taskObj.assignedTo.map(assignment => ({
                    user: assignment.user,
                    assignedAt: assignment.assignedAt
                }));
            }

            return taskObj;
        }).filter(Boolean);

        res.json({
            success: true,
            message: 'Overview tasks retrieved successfully',
            data: { 
                tasks: filteredTasks,
                count: filteredTasks.length
            }
        });

    } catch (error) {
        logger.error('Get overview tasks error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve overview tasks',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createTask,
    getTasks,
    getTask,
    updateTaskStatus,
    updateTaskStage,
    addRemark,
    assignTask,
    updateTask,
    updateIndividualStage,
    updateIndividualApproval,
    deleteTask,
    getTaskStats,
    getDashboardStats,
    addAttachments,
    removeAttachment,
    downloadAttachment,
    viewAttachmentPublic,
    createTaskHistoryWithNotification,
    addOverviewer,
    removeOverviewer,
    updateOverviewerPermissions,
    getOverviewTasks
};
