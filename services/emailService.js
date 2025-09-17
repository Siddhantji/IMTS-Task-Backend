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
    async sendTaskCompletionEmail(task, assignee, approvalTokens = null) {
        try {
            const creator = task.createdBy;
            if (!creator || !creator.email) {
                throw new Error('Task creator email not found');
            }

            const subject = `Task Completed - Approval Required: ${task.title}`;
            
            // Generate approval URLs
            const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
            const approveUrl = approvalTokens?.approve 
                ? `${baseUrl}/api/email-approval/approve/${approvalTokens.approve}`
                : '#';
            const rejectUrl = approvalTokens?.reject 
                ? `${baseUrl}/api/email-approval/reject/${approvalTokens.reject}`
                : '#';
            
            const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">✅ Task Completed</h1>
                        <p style="color: #f0f0f0; margin: 10px 0 0 0; font-size: 16px;">Approval Required</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <div style="background: #f8fafc; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #3b82f6;">
                            <h3 style="margin-top: 0; color: #1f2937; font-size: 20px;">📋 Task Details</h3>
                            <p style="margin: 10px 0;"><strong>Title:</strong> ${task.title}</p>
                            <p style="margin: 10px 0;"><strong>Description:</strong> ${task.description || 'No description'}</p>
                            <p style="margin: 10px 0;"><strong>Priority:</strong> <span style="color: ${this.getPriorityColor(task.priority)}; font-weight: bold;">${task.priority?.toUpperCase()}</span></p>
                            <p style="margin: 10px 0;"><strong>Completed by:</strong> ${assignee.name} (${assignee.email})</p>
                            <p style="margin: 10px 0;"><strong>Completion Date:</strong> ${new Date().toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</p>
                        </div>

                        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 20px; margin: 25px 0;">
                            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                <span style="font-size: 24px; margin-right: 10px;">⏰</span>
                                <h3 style="margin: 0; color: #065f46;">Action Required</h3>
                            </div>
                            <p style="margin: 0; color: #047857; line-height: 1.5;">
                                This task has been marked as <strong>completed</strong> and requires your approval. 
                                Please review the work and either approve or reject the task using the buttons below.
                            </p>
                        </div>

                        <div style="text-align: center; margin: 35px 0;">
                            <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="padding-right: 15px;">
                                        <a href="${approveUrl}" 
                                           style="background: linear-gradient(135deg, #10b981, #059669); 
                                                  color: white; 
                                                  padding: 15px 30px; 
                                                  text-decoration: none; 
                                                  border-radius: 8px; 
                                                  font-weight: bold;
                                                  font-size: 16px;
                                                  display: inline-block;
                                                  box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);
                                                  transition: all 0.3s ease;">
                                            ✅ APPROVE TASK
                                        </a>
                                    </td>
                                    <td style="padding-left: 15px;">
                                        <a href="${rejectUrl}" 
                                           style="background: linear-gradient(135deg, #ef4444, #dc2626); 
                                                  color: white; 
                                                  padding: 15px 30px; 
                                                  text-decoration: none; 
                                                  border-radius: 8px; 
                                                  font-weight: bold;
                                                  font-size: 16px;
                                                  display: inline-block;
                                                  box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);
                                                  transition: all 0.3s ease;">
                                            ❌ REJECT TASK
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 15px; margin: 25px 0;">
                            <p style="margin: 0; color: #9a3412; font-size: 14px;">
                                <strong>Note:</strong> These approval links are secure and will expire in 7 days. 
                                Click directly on the buttons above to approve or reject this task instantly.
                            </p>
                        </div>

                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tasks/${task._id}" 
                               style="color: #3b82f6; text-decoration: none; font-weight: 500;">
                                📖 View Full Task Details in Dashboard →
                            </a>
                        </div>
                    </div>

                    <div style="background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
                        <p style="color: #6b7280; font-size: 12px; margin: 0; line-height: 1.4;">
                            This is an automated email from <strong>IMTS Task Management System</strong>.<br>
                            Please do not reply to this email. For support, contact your system administrator.
                        </p>
                    </div>
                </div>
            `;

            const mailOptions = {
                from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                to: creator.email,
                subject: subject,
                html: htmlContent
            };

            await this.transporter.sendMail(mailOptions);
            logger.info(`Task completion email sent to ${creator.email} for task: ${task.title}`);
        } catch (error) {
            logger.error('Failed to send task completion email:', error);
            throw error;
        }
    }

    /**
     * Send task approval notification email (approved/rejected)
     * Sends to assignees after creator approves or rejects
     */
    async sendTaskApprovalNotification(task, assignees, approvalAction) {
        try {
            if (!this.transporter) {
                throw new Error('Email transporter not initialized');
            }

            const subject = `Task ${approvalAction.toUpperCase()}: ${task.title}`;
            const isApproved = approvalAction === 'approved';
            
            const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                    <div style="background: ${isApproved ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)'}; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">${isApproved ? '✅ Task Approved' : '❌ Task Rejected'}</h1>
                        <p style="color: #f0f0f0; margin: 10px 0 0 0; font-size: 16px;">${isApproved ? 'Congratulations!' : 'Revision Required'}</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <div style="background: #f8fafc; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${isApproved ? '#10b981' : '#ef4444'};">
                            <h3 style="margin-top: 0; color: #1f2937; font-size: 20px;">📋 Task Details</h3>
                            <p style="margin: 10px 0;"><strong>Title:</strong> ${task.title}</p>
                            <p style="margin: 10px 0;"><strong>Description:</strong> ${task.description || 'No description'}</p>
                            <p style="margin: 10px 0;"><strong>Priority:</strong> <span style="color: ${this.getPriorityColor(task.priority)}; font-weight: bold;">${task.priority?.toUpperCase()}</span></p>
                            <p style="margin: 10px 0;"><strong>Status:</strong> <span style="color: ${isApproved ? '#10b981' : '#ef4444'}; font-weight: bold;">${approvalAction.toUpperCase()}</span></p>
                            <p style="margin: 10px 0;"><strong>Decision Date:</strong> ${new Date().toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</p>
                        </div>

                        <div style="background: ${isApproved ? '#ecfdf5' : '#fef2f2'}; border: 1px solid ${isApproved ? '#a7f3d0' : '#fecaca'}; border-radius: 10px; padding: 20px; margin: 25px 0;">
                            <h3 style="margin: 0 0 10px 0; color: ${isApproved ? '#065f46' : '#991b1b'};">
                                ${isApproved ? '🎉 Task Approved!' : '📝 Task Rejected - Action Required'}
                            </h3>
                            <p style="margin: 0; color: ${isApproved ? '#047857' : '#991b1b'}; line-height: 1.5;">
                                ${isApproved 
                                    ? 'Great work! Your task has been approved and is now marked as completed.' 
                                    : 'Your task has been rejected and moved back to in-progress status. Please review and revise the work as needed.'}
                            </p>
                        </div>

                        <div style="text-align: center; margin: 25px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tasks/${task._id}" 
                               style="background: ${isApproved ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #2563eb)'}; 
                                      color: white; 
                                      padding: 15px 30px; 
                                      text-decoration: none; 
                                      border-radius: 8px; 
                                      font-weight: bold;
                                      font-size: 16px;
                                      display: inline-block;
                                      box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                                📖 View Task Details
                            </a>
                        </div>
                    </div>

                    <div style="background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
                        <p style="color: #6b7280; font-size: 12px; margin: 0; line-height: 1.4;">
                            This is an automated email from <strong>IMTS Task Management System</strong>.<br>
                            Please do not reply to this email. For support, contact your system administrator.
                        </p>
                    </div>
                </div>
            `;

            // Send to all assignees
            for (const assignee of assignees) {
                if (assignee.email) {
                    const mailOptions = {
                        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
                        to: assignee.email,
                        subject: subject,
                        html: htmlContent
                    };

                    await this.transporter.sendMail(mailOptions);
                    logger.info(`Task ${approvalAction} notification sent to ${assignee.email} for task: ${task.title}`);
                }
            }
        } catch (error) {
            logger.error(`Failed to send task ${approvalAction} notification emails:`, error);
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