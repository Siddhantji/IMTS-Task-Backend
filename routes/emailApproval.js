const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Task, User } = require('../models');
const emailService = require('../services/emailService');

/**
 * Generate a secure approval token for email-based actions
 */
function generateApprovalToken(taskId, userId, action, expiresIn = '7d') {
    const payload = {
        taskId,
        userId,
        action, // 'approve' or 'reject'
        type: 'email_approval',
        timestamp: Date.now()
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

/**
 * Verify approval token and extract data
 */
function verifyApprovalToken(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.type !== 'email_approval') {
            throw new Error('Invalid token type');
        }
        return decoded;
    } catch (error) {
        throw new Error('Invalid or expired approval token');
    }
}

/**
 * Handle task approval from email link
 * GET /api/email-approval/approve/:token
 */
router.get('/approve/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Verify and decode the token
        const tokenData = verifyApprovalToken(token);
        const { taskId, userId, action } = tokenData;
        
        if (action !== 'approve') {
            return res.status(400).send(`
                <html>
                    <head><title>Invalid Action</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #e74c3c;">❌ Invalid Action</h2>
                        <p>This link is not for approval. Please check your email for the correct link.</p>
                    </body>
                </html>
            `);
        }
        
        // Find the task
        const task = await Task.findById(taskId)
            .populate('createdBy', 'name email')
            .populate('assignedTo.user', 'name email');
            
        if (!task) {
            return res.status(404).send(`
                <html>
                    <head><title>Task Not Found</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #e74c3c;">❌ Task Not Found</h2>
                        <p>The task you're trying to approve was not found or may have been deleted.</p>
                    </body>
                </html>
            `);
        }
        
        // Check if user is authorized to approve (must be task creator)
        if (task.createdBy._id.toString() !== userId) {
            return res.status(403).send(`
                <html>
                    <head><title>Unauthorized</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #e74c3c;">🚫 Unauthorized</h2>
                        <p>You are not authorized to approve this task.</p>
                    </body>
                </html>
            `);
        }
        
        // Check if task is already approved or rejected
        if (task.approvalStatus) {
            return res.status(400).send(`
                <html>
                    <head><title>Already Processed</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #f39c12;">⚠️ Already Processed</h2>
                        <p>This task has already been ${task.approvalStatus}.</p>
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3>${task.title}</h3>
                            <p><strong>Status:</strong> ${task.approvalStatus}</p>
                            <p><strong>Processed on:</strong> ${task.approvalDate ? new Date(task.approvalDate).toLocaleString() : 'N/A'}</p>
                        </div>
                    </body>
                </html>
            `);
        }
        
        // Check if token has been used (for approval)
        const approveTokenRecord = task.approvalTokens?.find(t => t.token === token);
        if (approveTokenRecord && approveTokenRecord.used) {
            return res.status(400).send(`
                <html>
                    <head><title>Token Already Used</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #e74c3c;">🔒 Token Already Used</h2>
                        <p>This approval link has already been used and cannot be used again.</p>
                        <p>Please check if the task has already been processed.</p>
                    </body>
                </html>
            `);
        }
        
        // Update task with approval
        task.approvalStatus = 'approved';
        task.approvalDate = new Date();
        task.approvedBy = userId;
        task.stage = 'completed'; // Move to completed stage
        
        // Mark token as used
        if (approveTokenRecord) {
            approveTokenRecord.used = true;
        }
        
        await task.save();
        
        // Send notification email to assignees about approval
        try {
            const assignees = task.assignedTo.map(assigned => assigned.user);
            await emailService.sendTaskApprovalNotification(task, assignees, 'approved');
        } catch (emailError) {
            console.error('Failed to send approval notification email:', emailError);
        }
        
        // Return success page
        res.send(`
            <html>
                <head>
                    <title>Task Approved</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa; }
                        .success-container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }
                        .success-icon { font-size: 48px; margin-bottom: 20px; }
                        .task-details { background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left; }
                    </style>
                </head>
                <body>
                    <div class="success-container">
                        <div class="success-icon">✅</div>
                        <h2 style="color: #27ae60;">Task Approved Successfully!</h2>
                        <p>The task has been approved and marked as completed.</p>
                        
                        <div class="task-details">
                            <h3>${task.title}</h3>
                            <p><strong>Description:</strong> ${task.description}</p>
                            <p><strong>Approved on:</strong> ${new Date().toLocaleString()}</p>
                            <p><strong>Stage:</strong> Completed</p>
                        </div>
                        
                        <p>The assignees have been notified about the approval.</p>
                        <small style="color: #666;">You can now close this window.</small>
                    </div>
                </body>
            </html>
        `);
        
    } catch (error) {
        console.error('Approval error:', error);
        res.status(500).send(`
            <html>
                <head><title>Error</title></head>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h2 style="color: #e74c3c;">❌ Error</h2>
                    <p>An error occurred while processing your approval: ${error.message}</p>
                </body>
            </html>
        `);
    }
});

/**
 * Handle task rejection from email link
 * GET /api/email-approval/reject/:token
 */
router.get('/reject/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        // Verify and decode the token
        const tokenData = verifyApprovalToken(token);
        const { taskId, userId, action } = tokenData;
        
        if (action !== 'reject') {
            return res.status(400).send(`
                <html>
                    <head><title>Invalid Action</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #e74c3c;">❌ Invalid Action</h2>
                        <p>This link is not for rejection. Please check your email for the correct link.</p>
                    </body>
                </html>
            `);
        }
        
        // Find the task
        const task = await Task.findById(taskId)
            .populate('createdBy', 'name email')
            .populate('assignedTo.user', 'name email');
            
        if (!task) {
            return res.status(404).send(`
                <html>
                    <head><title>Task Not Found</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #e74c3c;">❌ Task Not Found</h2>
                        <p>The task you're trying to reject was not found or may have been deleted.</p>
                    </body>
                </html>
            `);
        }
        
        // Check if user is authorized to reject (must be task creator)
        if (task.createdBy._id.toString() !== userId) {
            return res.status(403).send(`
                <html>
                    <head><title>Unauthorized</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #e74c3c;">🚫 Unauthorized</h2>
                        <p>You are not authorized to reject this task.</p>
                    </body>
                </html>
            `);
        }
        
        // Check if task is already approved or rejected
        if (task.approvalStatus) {
            return res.status(400).send(`
                <html>
                    <head><title>Already Processed</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #f39c12;">⚠️ Already Processed</h2>
                        <p>This task has already been ${task.approvalStatus}.</p>
                        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3>${task.title}</h3>
                            <p><strong>Status:</strong> ${task.approvalStatus}</p>
                            <p><strong>Processed on:</strong> ${task.approvalDate ? new Date(task.approvalDate).toLocaleString() : 'N/A'}</p>
                        </div>
                    </body>
                </html>
            `);
        }
        
        // Check if token has been used (for rejection)
        const rejectTokenRecord = task.approvalTokens?.find(t => t.token === token);
        if (rejectTokenRecord && rejectTokenRecord.used) {
            return res.status(400).send(`
                <html>
                    <head><title>Token Already Used</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h2 style="color: #e74c3c;">🔒 Token Already Used</h2>
                        <p>This rejection link has already been used and cannot be used again.</p>
                        <p>Please check if the task has already been processed.</p>
                    </body>
                </html>
            `);
        }
        
        // Update task with rejection
        task.approvalStatus = 'rejected';
        task.approvalDate = new Date();
        task.approvedBy = userId;
        task.stage = 'in-progress'; // Move back to in-progress for revision
        
        // Mark token as used
        if (rejectTokenRecord) {
            rejectTokenRecord.used = true;
        }
        
        await task.save();
        
        // Send notification email to assignees about rejection
        try {
            const assignees = task.assignedTo.map(assigned => assigned.user);
            await emailService.sendTaskApprovalNotification(task, assignees, 'rejected');
        } catch (emailError) {
            console.error('Failed to send rejection notification email:', emailError);
        }
        
        // Return rejection page
        res.send(`
            <html>
                <head>
                    <title>Task Rejected</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f8f9fa; }
                        .rejection-container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }
                        .rejection-icon { font-size: 48px; margin-bottom: 20px; }
                        .task-details { background: #fdeaea; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: left; }
                    </style>
                </head>
                <body>
                    <div class="rejection-container">
                        <div class="rejection-icon">❌</div>
                        <h2 style="color: #e74c3c;">Task Rejected</h2>
                        <p>The task has been rejected and moved back to in-progress for revision.</p>
                        
                        <div class="task-details">
                            <h3>${task.title}</h3>
                            <p><strong>Description:</strong> ${task.description}</p>
                            <p><strong>Rejected on:</strong> ${new Date().toLocaleString()}</p>
                            <p><strong>Stage:</strong> In Progress (for revision)</p>
                        </div>
                        
                        <p>The assignees have been notified about the rejection and can now revise the task.</p>
                        <small style="color: #666;">You can now close this window.</small>
                    </div>
                </body>
            </html>
        `);
        
    } catch (error) {
        console.error('Rejection error:', error);
        res.status(500).send(`
            <html>
                <head><title>Error</title></head>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h2 style="color: #e74c3c;">❌ Error</h2>
                    <p>An error occurred while processing your rejection: ${error.message}</p>
                </body>
            </html>
        `);
    }
});

/**
 * Get approval status for a task (API endpoint)
 * GET /api/email-approval/status/:taskId
 */
router.get('/status/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        
        const task = await Task.findById(taskId)
            .select('approvalStatus approvalDate approvedBy stage')
            .populate('approvedBy', 'name email');
            
        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }
        
        res.json({
            success: true,
            approvalStatus: task.approvalStatus,
            approvalDate: task.approvalDate,
            approvedBy: task.approvedBy,
            stage: task.stage
        });
        
    } catch (error) {
        console.error('Error getting approval status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get approval status',
            error: error.message
        });
    }
});

module.exports = { router, generateApprovalToken };