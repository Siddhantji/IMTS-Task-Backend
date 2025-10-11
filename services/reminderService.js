const cron = require('node-cron');
const Task = require('../models/Task');
const emailService = require('./emailService');
const { logger } = require('../utils/logger');

class ReminderService {
    constructor() {
        this.isInitialized = false;
        this.jobs = new Map();
    }

    /**
     * Initialize the reminder service
     */
    init() {
        if (this.isInitialized) {
            console.log('⏰ Reminder service already initialized');
            return;
        }

        console.log('⏰ Initializing reminder service...');

        // Schedule job to run every hour to check for tasks needing reminders
        const reminderJob = cron.schedule('0 * * * *', async () => {
            console.log('⏰ Running 24-hour approval reminder check...');
            await this.checkAndSendApprovalReminders();
        }, {
            scheduled: false,
            timezone: "Asia/Kolkata" // Adjust timezone as needed
        });

        this.jobs.set('approval-reminders', reminderJob);

        // Start the job
        reminderJob.start();

        this.isInitialized = true;
        console.log('⏰ Reminder service initialized successfully');
        console.log('⏰ Approval reminder job scheduled to run every hour');
    }

    /**
     * Stop all scheduled jobs
     */
    stop() {
        this.jobs.forEach((job, name) => {
            job.destroy();
            console.log(`⏰ Stopped reminder job: ${name}`);
        });
        this.jobs.clear();
        this.isInitialized = false;
        console.log('⏰ Reminder service stopped');
    }

    /**
     * Check for tasks that are completed but not approved for 24+ hours and send reminder emails
     */
    async checkAndSendApprovalReminders() {
        try {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            
            console.log(`⏰ Checking for tasks completed before: ${twentyFourHoursAgo.toISOString()}`);

            // Find tasks that are:
            // 1. Stage is 'done' (completed by assignee)
            // 2. Status is not 'approved' or 'rejected'
            // 3. Completed more than 24 hours ago
            // 4. Don't have a recent reminder sent
            const tasksNeedingReminder = await Task.find({
                stage: 'done',
                status: { $nin: ['approved', 'rejected'] },
                completedAt: { $lte: twentyFourHoursAgo },
                isActive: true,
                // Check if reminder was not sent in the last 23 hours to avoid spam
                $or: [
                    { lastReminderSent: { $exists: false } },
                    { lastReminderSent: { $lte: new Date(Date.now() - 23 * 60 * 60 * 1000) } }
                ]
            })
            .populate('createdBy', 'name email')
            .populate('assignedTo.user', 'name email')
            .populate('department', 'name')
            .lean();

            console.log(`⏰ Found ${tasksNeedingReminder.length} tasks needing approval reminders`);

            if (tasksNeedingReminder.length === 0) {
                return;
            }

            let remindersSent = 0;
            let remindersSkipped = 0;

            for (const task of tasksNeedingReminder) {
                try {
                    // Send reminder to task creator
                    const creator = task.createdBy;
                    if (!creator || !creator.email) {
                        console.warn(`⏰ Skipping task ${task._id}: Creator email not found`);
                        remindersSkipped++;
                        continue;
                    }

                    // Get the assignee who completed the task
                    let completedByUser = null;
                    if (task.assignedTo && task.assignedTo.length > 0) {
                        // For individual tasks or group tasks, find who completed it
                        if (task.assignedTo.length === 1) {
                            completedByUser = task.assignedTo[0].user;
                        } else {
                            // For group tasks, this is a general reminder
                            completedByUser = { name: 'Team', email: 'team@example.com' };
                        }
                    }

                    if (!completedByUser) {
                        console.warn(`⏰ Skipping task ${task._id}: No assignee found`);
                        remindersSkipped++;
                        continue;
                    }

                    // Send the reminder email
                    await this.sendApprovalReminderEmail(task, creator, completedByUser);

                    // Update the task to mark reminder as sent
                    await Task.findByIdAndUpdate(task._id, {
                        lastReminderSent: new Date()
                    });

                    remindersSent++;
                    console.log(`⏰ Sent approval reminder for task: ${task.title} to ${creator.email}`);

                    // Add small delay to avoid overwhelming email service
                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (error) {
                    console.error(`⏰ Failed to send reminder for task ${task._id}:`, error.message);
                    remindersSkipped++;
                }
            }

            console.log(`⏰ Approval reminder check completed: ${remindersSent} sent, ${remindersSkipped} skipped`);
            
            if (remindersSent > 0) {
                logger.info(`Sent ${remindersSent} approval reminder emails`);
            }

        } catch (error) {
            console.error('⏰ Error in checkAndSendApprovalReminders:', error);
            logger.error('Failed to check and send approval reminders:', error);
        }
    }

    /**
     * Send approval reminder email
     */
    async sendApprovalReminderEmail(task, creator, completedByUser) {
        try {
            const subject = `⏰ Reminder: Task Approval Pending - ${task.title}`;
            
            // Calculate how long ago the task was completed
            const completedAt = new Date(task.completedAt);
            const now = new Date();
            const hoursAgo = Math.floor((now - completedAt) / (1000 * 60 * 60));
            const daysAgo = Math.floor(hoursAgo / 24);
            
            let timeAgoText = '';
            if (daysAgo > 0) {
                timeAgoText = `${daysAgo} day${daysAgo > 1 ? 's' : ''} ago`;
            } else {
                timeAgoText = `${hoursAgo} hour${hoursAgo > 1 ? 's' : ''} ago`;
            }

            const htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
                    <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px;">⏰ Approval Reminder</h1>
                        <p style="color: #fef3c7; margin: 10px 0 0 0; font-size: 16px;">Task Pending Your Approval</p>
                    </div>
                    
                    <div style="padding: 30px;">
                        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 20px; margin: 20px 0;">
                            <div style="display: flex; align-items: center; margin-bottom: 15px;">
                                <span style="font-size: 24px; margin-right: 10px;">⚠️</span>
                                <h3 style="margin: 0; color: #9a3412;">Task Awaiting Your Approval</h3>
                            </div>
                            <p style="margin: 0; color: #9a3412; line-height: 1.5;">
                                A task was marked as completed <strong>${timeAgoText}</strong> and is still waiting for your approval or rejection.
                            </p>
                        </div>

                        <div style="background: #f8fafc; padding: 25px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                            <h3 style="margin-top: 0; color: #1f2937; font-size: 20px;">📋 Task Details</h3>
                            <p style="margin: 10px 0;"><strong>Title:</strong> ${task.title}</p>
                            <p style="margin: 10px 0;"><strong>Description:</strong> ${task.description || 'No description'}</p>
                            <p style="margin: 10px 0;"><strong>Priority:</strong> <span style="color: ${this.getPriorityColor(task.priority)}; font-weight: bold;">${task.priority?.toUpperCase()}</span></p>
                            <p style="margin: 10px 0;"><strong>Department:</strong> ${task.department?.name || 'N/A'}</p>
                            <p style="margin: 10px 0;"><strong>Completed by:</strong> ${completedByUser.name}</p>
                            <p style="margin: 10px 0;"><strong>Completed on:</strong> ${completedAt.toLocaleDateString('en-US', { 
                                weekday: 'long', 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}</p>
                            <p style="margin: 10px 0;"><strong>Time since completion:</strong> <span style="color: #dc2626; font-weight: bold;">${timeAgoText}</span></p>
                        </div>

                        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 20px; margin: 25px 0;">
                            <div style="display: flex; align-items: center; margin-bottom: 10px;">
                                <span style="font-size: 24px; margin-right: 10px;">🚨</span>
                                <h3 style="margin: 0; color: #991b1b;">Urgent Action Required</h3>
                            </div>
                            <p style="margin: 0; color: #991b1b; line-height: 1.5;">
                                This task has been waiting for your approval for more than <strong>24 hours</strong>. 
                                Please review and approve or reject the completed work to keep the workflow moving.
                            </p>
                        </div>

                        <div style="text-align: center; margin: 35px 0;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/tasks/${task._id}" 
                               style="background: linear-gradient(135deg, #f59e0b, #d97706); 
                                      color: white; 
                                      padding: 18px 36px; 
                                      text-decoration: none; 
                                      border-radius: 8px; 
                                      font-weight: bold;
                                      font-size: 18px;
                                      display: inline-block;
                                      box-shadow: 0 4px 6px rgba(245, 158, 11, 0.3);
                                      transition: all 0.3s ease;">
                                📋 REVIEW & APPROVE TASK NOW
                            </a>
                        </div>

                        <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 15px; margin: 25px 0;">
                            <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
                                <strong>💡 Quick Actions:</strong> You can approve or reject tasks directly from the dashboard. 
                                Timely approvals help maintain team productivity and project momentum.
                            </p>
                        </div>

                        <div style="text-align: center; margin-top: 30px;">
                            <p style="color: #6b7280; font-size: 14px; margin: 0; line-height: 1.4;">
                                This is an automated reminder from <strong>IMTS Task Management System</strong>.<br>
                                You will receive this reminder daily until the task is approved or rejected.
                            </p>
                        </div>
                    </div>

                    <div style="background: #f9fafb; padding: 20px; text-align: center; border-radius: 0 0 12px 12px;">
                        <p style="color: #6b7280; font-size: 12px; margin: 0; line-height: 1.4;">
                            IMTS Task Management System - Automated Reminder<br>
                            Please do not reply to this email. For support, contact your system administrator.
                        </p>
                    </div>
                </div>
            `;

            if (!emailService.isReady()) {
                throw new Error('Email service not ready');
            }

            const mailOptions = {
                from: `"IMTS Task Management - Reminder" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
                to: creator.email,
                subject: subject,
                html: htmlContent
            };

            await emailService.transporter.sendMail(mailOptions);
            logger.info(`Approval reminder email sent to ${creator.email} for task: ${task.title}`);

        } catch (error) {
            logger.error('Failed to send approval reminder email:', error);
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
     * Manually trigger approval reminders (for testing or admin use)
     */
    async triggerApprovalReminders() {
        console.log('⏰ Manually triggering approval reminder check...');
        await this.checkAndSendApprovalReminders();
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            jobsCount: this.jobs.size,
            jobs: Array.from(this.jobs.keys())
        };
    }
}

module.exports = new ReminderService();