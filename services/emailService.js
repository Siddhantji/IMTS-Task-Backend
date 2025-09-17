const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

class EmailService {
    constructor() {
        this.transporter = null;
        this.initialized = false;
        this.initializeTransporter().catch(error => {
            console.error('📧 Email service initialization failed during construction:', error.message);
        });
    }

    /**
     * Reinitialize the email transporter (useful for config changes)
     */
    async reinitialize() {
        console.log('📧 Reinitializing email service...');
        this.transporter = null;
        this.initialized = false;
        try {
            await this.initializeTransporter();
        } catch (error) {
            console.error('📧 Failed to reinitialize email service:', error.message);
        }
    }

    /**
     * Check if email service is ready
     */
    isReady() {
        return this.transporter !== null && this.initialized === true;
    }

    async initializeTransporter() {
        try {
            // Log the configuration being used
            console.log('📧 Initializing email transporter with config:');
            console.log('  - Service:', process.env.EMAIL_SERVICE || 'gmail');
            console.log('  - User:', process.env.EMAIL_USER || 'Not set');
            console.log('  - Password:', process.env.EMAIL_PASSWORD ? '***Hidden***' : 'Not set');
            console.log('  - From:', process.env.EMAIL_FROM || 'Not set');
            
            if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
                console.warn('📧 Email credentials not configured. Email service will not work.');
                this.transporter = null;
                this.initialized = false;
                return;
            }

            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASSWORD,
                },
            });

            console.log('📧 Transporter created, verifying connection...');

            // Verify connection properly with async/await
            try {
                await this.transporter.verify();
                logger.info('Email transporter ready');
                console.log('📧 Email transporter verified and ready!');
                this.initialized = true;
            } catch (verifyError) {
                logger.error('Email transporter verification failed:', verifyError);
                console.error('📧 Email verification failed:', verifyError.message);
                this.transporter = null;
                this.initialized = false;
                throw verifyError;
            }
        } catch (error) {
            logger.error('Failed to initialize email transporter:', error);
            console.error('📧 Failed to initialize email transporter:', error.message);
            this.transporter = null;
            this.initialized = false;
        }
    }

    /**
     * Send email for task completion (stage changed to "done")
     * Sends to task creator for approval/rejection
     */
    async sendTaskCompletionEmail(task, assignee) {
        try {
            const creator = task.createdBy;
            if (!creator || !creator.email) {
                throw new Error('Task creator email not found');
            }

            const subject = `Task Completed - Approval Required: ${task.title}`;
            
            const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2563eb;">Task Completed - Approval Required</h2>
                    
                    <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #1f2937;">Task Details</h3>
                        <p><strong>Title:</strong> ${task.title}</p>
                        <p><strong>Description:</strong> ${task.description || 'No description'}</p>
                        <p><strong>Priority:</strong> <span style="color: ${this.getPriorityColor(task.priority)}">${task.priority?.toUpperCase()}</span></p>
                        <p><strong>Completed by:</strong> ${assignee.name} (${assignee.email})</p>
                        <p><strong>Completion Date:</strong> ${new Date().toLocaleDateString()}</p>
                    </div>

                    <div style="background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0;">
                        <p style="margin: 0; color: #047857;">
                            <strong>Action Required:</strong> This task has been marked as completed and requires your approval.
                        </p>
                    </div>

                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL}/tasks/${task._id}?action=approve" 
                           style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; display: inline-block;">
                            ✅ Approve Task
                        </a>
                        <a href="${process.env.FRONTEND_URL}/tasks/${task._id}?action=reject" 
                           style="background: #ef4444; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; display: inline-block;">
                            ❌ Reject Task
                        </a>
                    </div>

                    <div style="text-align: center; margin: 20px 0;">
                        <a href="${process.env.FRONTEND_URL}/tasks/${task._id}" 
                           style="color: #2563eb; text-decoration: none;">
                            View Full Task Details →
                        </a>
                    </div>

                    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                    <p style="color: #6b7280; font-size: 12px; text-align: center;">
                        This is an automated email from IMTS Task Management System.<br>
                        Please do not reply to this email.
                    </p>
                </div>
            `;

            const mailOptions = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: creator.email,
                subject: subject,
                html: htmlContent
            };

            const result = await this.transporter.sendMail(mailOptions);
            logger.info(`Task completion email sent to ${creator.email} for task: ${task.title}`);
            return result;

        } catch (error) {
            logger.error('Failed to send task completion email:', error);
            throw error;
        }
    }

    /**
     * Send email for task assignment
     * Sends to assignee(s) - individual or group
     */
    async sendTaskAssignmentEmail(task, assignees, assignedBy) {
        try {
            const emailPromises = assignees.map(async (assignee) => {
                if (!assignee.email) {
                    logger.warn(`No email found for assignee: ${assignee.name}`);
                    return null;
                }

                const isGroup = assignees.length > 1;
                const subject = isGroup 
                    ? `New Group Task Assigned: ${task.title}`
                    : `New Task Assigned: ${task.title}`;

                const htmlContent = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #2563eb;">${isGroup ? 'New Group Task Assigned' : 'New Task Assigned'}</h2>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #1f2937;">Task Details</h3>
                            <p><strong>Title:</strong> ${task.title}</p>
                            <p><strong>Description:</strong> ${task.description || 'No description'}</p>
                            <p><strong>Priority:</strong> <span style="color: ${this.getPriorityColor(task.priority)}">${task.priority?.toUpperCase()}</span></p>
                            <p><strong>Assigned by:</strong> ${assignedBy.name} (${assignedBy.email})</p>
                            <p><strong>Due Date:</strong> ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Not specified'}</p>
                            ${isGroup ? `<p><strong>Team Members:</strong> ${assignees.map(a => a.name).join(', ')}</p>` : ''}
                        </div>

                        <div style="background: #dbeafe; border-left: 4px solid #2563eb; padding: 16px; margin: 20px 0;">
                            <p style="margin: 0; color: #1d4ed8;">
                                <strong>You have been assigned ${isGroup ? 'to a group task' : 'a new task'}.</strong> 
                                Please review the details and start working on it.
                            </p>
                        </div>

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL}/tasks/${task._id}" 
                               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                📋 View Task Details
                            </a>
                        </div>

                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                        <p style="color: #6b7280; font-size: 12px; text-align: center;">
                            This is an automated email from IMTS Task Management System.<br>
                            Please do not reply to this email.
                        </p>
                    </div>
                `;

                const mailOptions = {
                    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                    to: assignee.email,
                    subject: subject,
                    html: htmlContent
                };

                const result = await this.transporter.sendMail(mailOptions);
                logger.info(`Task assignment email sent to ${assignee.email} for task: ${task.title}`);
                return result;
            });

            const results = await Promise.allSettled(emailPromises);
            return results.filter(result => result.status === 'fulfilled');

        } catch (error) {
            logger.error('Failed to send task assignment emails:', error);
            throw error;
        }
    }

    /**
     * Send email for new remark added
     * Sends to relevant parties based on task type (individual/group)
     */
    async sendRemarkAddedEmail(task, remark, remarkCreator) {
        try {
            let recipients = [];

            // Determine recipients based on task type
            if (task.assignedTo && task.assignedTo.length > 1) {
                // Group task: send to all assignees except remark creator
                recipients = task.assignedTo
                    .filter(assigned => assigned.user._id.toString() !== remarkCreator._id.toString())
                    .map(assigned => assigned.user);
                
                // Also include task creator if different from remark creator
                if (task.createdBy._id.toString() !== remarkCreator._id.toString()) {
                    recipients.push(task.createdBy);
                }
            } else {
                // Individual task: send to the other person (assignee or creator)
                if (task.createdBy._id.toString() === remarkCreator._id.toString()) {
                    // Remark creator is task creator, send to assignee
                    if (task.assignedTo && task.assignedTo.length > 0) {
                        recipients.push(task.assignedTo[0].user);
                    }
                } else {
                    // Remark creator is assignee, send to task creator
                    recipients.push(task.createdBy);
                }
            }

            const emailPromises = recipients.map(async (recipient) => {
                if (!recipient.email) {
                    logger.warn(`No email found for recipient: ${recipient.name}`);
                    return null;
                }

                const subject = `New Remark Added: ${task.title}`;
                
                const htmlContent = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #2563eb;">New Remark Added</h2>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0; color: #1f2937;">Task Details</h3>
                            <p><strong>Title:</strong> ${task.title}</p>
                            <p><strong>Priority:</strong> <span style="color: ${this.getPriorityColor(task.priority)}">${task.priority?.toUpperCase()}</span></p>
                            <p><strong>Current Status:</strong> ${task.status}</p>
                        </div>

                        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0;">
                            <h4 style="margin-top: 0; color: #92400e;">New Remark by ${remarkCreator.name}</h4>
                            <p style="margin: 8px 0; color: #92400e;"><strong>Added on:</strong> ${new Date().toLocaleString()}</p>
                            <div style="background: white; padding: 12px; border-radius: 4px; margin-top: 8px;">
                                <p style="margin: 0; color: #1f2937;">${remark.text}</p>
                            </div>
                        </div>

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.FRONTEND_URL}/tasks/${task._id}" 
                               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                                💬 View Task & Reply
                            </a>
                        </div>

                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
                        <p style="color: #6b7280; font-size: 12px; text-align: center;">
                            This is an automated email from IMTS Task Management System.<br>
                            Please do not reply to this email.
                        </p>
                    </div>
                `;

                const mailOptions = {
                    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                    to: recipient.email,
                    subject: subject,
                    html: htmlContent
                };

                const result = await this.transporter.sendMail(mailOptions);
                logger.info(`Remark notification email sent to ${recipient.email} for task: ${task.title}`);
                return result;
            });

            const results = await Promise.allSettled(emailPromises);
            return results.filter(result => result.status === 'fulfilled');

        } catch (error) {
            logger.error('Failed to send remark notification emails:', error);
            throw error;
        }
    }

    /**
     * Get priority color for email styling
     */
    getPriorityColor(priority) {
        const colors = {
            low: '#10b981',
            medium: '#f59e0b', 
            high: '#ef4444',
            urgent: '#dc2626'
        };
        return colors[priority?.toLowerCase()] || '#6b7280';
    }

    /**
     * Test email functionality
     */
    async sendTestEmail(toEmail) {
        try {
            const mailOptions = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: toEmail,
                subject: 'IMTS Task Management - Email Test',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #2563eb;">Email Service Test</h2>
                        <p>This is a test email from IMTS Task Management System.</p>
                        <p>If you received this email, the email service is working correctly!</p>
                        <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                `
            };

            const result = await this.transporter.sendMail(mailOptions);
            logger.info(`Test email sent to ${toEmail}`);
            return result;
        } catch (error) {
            logger.error('Failed to send test email:', error);
            throw error;
        }
    }
}

module.exports = new EmailService();