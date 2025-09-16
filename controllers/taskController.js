const { Task, TaskHistory, User, Notification } = require('../models');
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

        if (typeof assignedTo === 'string') {
            try {
                parsedAssignedTo = JSON.parse(assignedTo);
            } catch (e) {
                parsedAssignedTo = [];
            }
        }

        if (typeof tags === 'string') {
            try {
                parsedTags = JSON.parse(tags);
            } catch (e) {
                parsedTags = [];
            }
        }

        if (typeof isGroupTask === 'string') {
            try {
                parsedIsGroupTask = JSON.parse(isGroupTask);
            } catch (e) {
                parsedIsGroupTask = false;
            }
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

        // Populate the task before sending response
        const populatedTask = await Task.findById(task._id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

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

        // Handle status-specific logic
        if (status === 'completed') {
            task.completedAt = new Date();
        } else if (status === 'approved') {
            task.approvedAt = new Date();
            task.approvedBy = req.user._id;
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

        const updatedTask = await Task.findById(id)
            .populate('createdBy', 'name email role')
            .populate('assignedTo.user', 'name email role')
            .populate('department', 'name');

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

        // Set completion time if marking as completed
        if (status === 'completed') {
            assignment.completedAt = new Date();
        }

        await task.save();

        // Create history entry for individual stage change
        if (stage && stage !== oldStage) {
            await TaskHistory.createEntry(
                task._id,
                'individual_stage_changed',
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
                'individual_status_changed',
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

        // Check if all assigned users have completed their individual tasks
        if (task.isGroupTask) {
            const allCompleted = task.assignedTo.every(
                assignment => assignment.status === 'completed' || assignment.individualStage === 'done'
            );
            
            if (allCompleted && task.stage !== 'done') {
                task.stage = 'done';
                task.status = 'completed';
                task.completedAt = new Date();
                await task.save();

                // Create history entry for overall task completion
                await TaskHistory.createEntry(
                    task._id,
                    'task_auto_completed',
                    req.user._id,
                    {
                        description: 'Task automatically completed as all individual assignments are done'
                    }
                );

                // Notify task creator about overall completion
                await Notification.createTaskNotification(
                    'task_completed',
                    task._id,
                    task.createdBy,
                    req.user._id
                );
            }
        }

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
    deleteTask,
    getTaskStats,
    getDashboardStats,
    addAttachments,
    removeAttachment,
    downloadAttachment,
    viewAttachmentPublic
};
