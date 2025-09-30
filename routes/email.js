const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const emailService = require('../services/emailService');
const { authenticateToken } = require('../middleware');
const { Task, User } = require('../models');

/**
 * Check email service status
 */
router.get('/status', (req, res) => {
    try {
        const isReady = emailService.isReady();
        res.json({
            status: 'success',
            emailServiceReady: isReady,
            message: isReady ? 'Email service is ready' : 'Email service not initialized',
            config: {
                EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'Not set',
                EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Not set', 
                EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set',
                EMAIL_FROM: process.env.EMAIL_FROM || 'Not set'
            }
        });
    } catch (error) {
        console.error('❌ Error checking email service status:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

/**
 * Reinitialize email service
 */
router.post('/reinitialize', async (req, res) => {
    try {
        await emailService.reinitialize();
        const isReady = emailService.isReady();
        
        res.json({
            status: 'success',
            emailServiceReady: isReady,
            message: isReady ? 'Email service reinitialized successfully' : 'Email service reinitialization failed'
        });
    } catch (error) {
        console.error('❌ Error reinitializing email service:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

/**
 * Debug email configuration
 */
router.get('/debug', (req, res) => {
    try {
        const config = {
            EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'gmail',
            EMAIL_USER: process.env.EMAIL_USER,
            EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? '***HIDDEN***' : 'NOT_SET',
            EMAIL_FROM: process.env.EMAIL_FROM,
            EMAIL_SECURE: process.env.EMAIL_SECURE,
            EMAIL_PORT: process.env.EMAIL_PORT || 587,
            transporterExists: !!emailService.transporter,
            isReady: emailService.isReady()
        };

        res.json({
            status: 'success',
            config: config
        });
    } catch (error) {
        console.error('❌ Error getting debug info:', error);
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

/**
 * Create transporter manually for testing
 */
router.post('/test-transporter', async (req, res) => {
    try {
        // Try different ways to access nodemailer
        console.log('📧 Nodemailer type:', typeof nodemailer);
        console.log('📧 Nodemailer keys:', Object.keys(nodemailer || {}));
        console.log('📧 Nodemailer.createTransporter type:', typeof nodemailer.createTransporter);
        console.log('📧 Nodemailer.createTransport type:', typeof nodemailer.createTransport);
        
        // Try the correct method name (it's createTransport, not createTransporter)
        const testTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        console.log('📧 Testing transporter verification...');
        await testTransporter.verify();
        console.log('✅ Test transporter verified successfully');

        res.json({
            status: 'success',
            message: 'Test transporter created and verified successfully'
        });
    } catch (error) {
        console.error('❌ Test transporter failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Test transporter failed',
            error: error.message
        });
    }
});

/**
 * Test email endpoint
 */
router.post('/test', authenticateToken, async (req, res) => {
    try {
        const { email } = req.body;
        const testEmail = email || req.user.email;

        if (!testEmail) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required'
            });
        }

        // Check if email service is configured
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
            return res.json({
                success: false,
                message: 'Email service not configured. Please set EMAIL_USER and EMAIL_PASSWORD in environment variables.',
                config: {
                    EMAIL_SERVICE: process.env.EMAIL_SERVICE || 'Not set',
                    EMAIL_USER: process.env.EMAIL_USER ? 'Set' : 'Not set',
                    EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'Set' : 'Not set',
                    EMAIL_FROM: process.env.EMAIL_FROM || 'Not set'
                }
            });
        }

        await emailService.sendTestEmail(testEmail);

        res.json({
            success: true,
            message: `Test email sent to ${testEmail}`
        });
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send test email',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Test email endpoint without auth (for testing purposes)
 */
router.post('/test-simple', async (req, res) => {
    try {
        const { email } = req.body;
        const testEmail = email || 'siddhant.teotia@imtsinstitute.com';

        await emailService.sendTestEmail(testEmail);

        res.json({
            success: true,
            message: `Test email sent to ${testEmail}`
        });
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send test email',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Test task completion email
 */
router.post('/test-completion', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.body;

        const task = await Task.findById(taskId)
            .populate('createdBy', 'name email')
            .populate('assignedTo.user', 'name email');

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        // Get the assignee (for demo, use first assignee)
        const assignee = task.assignedTo && task.assignedTo.length > 0 
            ? task.assignedTo[0].user 
            : req.user;

        await emailService.sendTaskCompletionEmail(task, assignee);

        res.json({
            success: true,
            message: `Task completion email sent to ${task.createdBy.email}`
        });
    } catch (error) {
        console.error('Task completion email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send task completion email',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Test task assignment email
 */
router.post('/test-assignment', authenticateToken, async (req, res) => {
    try {
        const { taskId } = req.body;

        const task = await Task.findById(taskId)
            .populate('createdBy', 'name email')
            .populate('assignedTo.user', 'name email');

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const assignees = task.assignedTo.map(assigned => assigned.user);
        const assignedBy = task.createdBy;

        await emailService.sendTaskAssignmentEmail(task, assignees, assignedBy);

        res.json({
            success: true,
            message: `Task assignment emails sent to ${assignees.length} recipients`
        });
    } catch (error) {
        console.error('Task assignment email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send task assignment emails',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Test remark notification email
 */
router.post('/test-remark', authenticateToken, async (req, res) => {
    try {
        const { taskId, remarkText } = req.body;

        const task = await Task.findById(taskId)
            .populate('createdBy', 'name email')
            .populate('assignedTo.user', 'name email');

        if (!task) {
            return res.status(404).json({
                success: false,
                message: 'Task not found'
            });
        }

        const remark = {
            text: remarkText || 'This is a test remark for email notification.',
            createdBy: req.user._id,
            createdAt: new Date()
        };

        await emailService.sendRemarkAddedEmail(task, remark, req.user);

        res.json({
            success: true,
            message: 'Remark notification emails sent'
        });
    } catch (error) {
        console.error('Remark notification email error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send remark notification emails',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;