const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
    return nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    });
};

const emailConfig = {
    transporter: createTransporter(),
    
    // Verify connection configuration
    verifyConnection: async () => {
        try {
            await emailConfig.transporter.verify();
            logger.info('Email server connection verified');
            return true;
        } catch (error) {
            logger.error('Email server connection failed:', error);
            return false;
        }
    },

    // Send email function
    sendEmail: async ({ to, subject, text, html, attachments = [] }) => {
        try {
            const mailOptions = {
                from: `"IMTS Task Management" <${process.env.EMAIL_USER}>`,
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                text,
                html,
                attachments
            };

            const result = await emailConfig.transporter.sendMail(mailOptions);
            logger.info(`Email sent successfully to ${to}`);
            return result;
        } catch (error) {
            logger.error('Error sending email:', error);
            throw error;
        }
    },

    // Email templates
    templates: {
        taskAssigned: (taskData, userEmail) => ({
            to: userEmail,
            subject: `New Task Assigned: ${taskData.title}`,
            html: `
                <h2>New Task Assigned</h2>
                <p>Hello,</p>
                <p>You have been assigned a new task:</p>
                <div style="border: 1px solid #ddd; padding: 15px; margin: 10px 0;">
                    <h3>${taskData.title}</h3>
                    <p><strong>Description:</strong> ${taskData.description}</p>
                    <p><strong>Priority:</strong> ${taskData.priority}</p>
                    <p><strong>Deadline:</strong> ${new Date(taskData.deadline).toLocaleDateString()}</p>
                </div>
                <p>Please log in to the system to view more details and start working on this task.</p>
                <p>Best regards,<br>IMTS Task Management System</p>
            `
        }),

        taskStatusUpdate: (taskData, userEmail, status) => ({
            to: userEmail,
            subject: `Task Status Updated: ${taskData.title}`,
            html: `
                <h2>Task Status Update</h2>
                <p>Hello,</p>
                <p>The status of task "${taskData.title}" has been updated to: <strong>${status}</strong></p>
                <p>Please log in to the system to view more details.</p>
                <p>Best regards,<br>IMTS Task Management System</p>
            `
        }),

        welcomeEmail: (userData) => ({
            to: userData.email,
            subject: 'Welcome to IMTS Task Management System',
            html: `
                <h2>Welcome to IMTS Task Management System</h2>
                <p>Hello ${userData.name},</p>
                <p>Your account has been successfully created with the following details:</p>
                <ul>
                    <li><strong>Email:</strong> ${userData.email}</li>
                    <li><strong>Role:</strong> ${userData.role}</li>
                    <li><strong>Department:</strong> ${userData.department}</li>
                </ul>
                <p>You can now log in to the system and start managing your tasks.</p>
                <p>Best regards,<br>IMTS Task Management System</p>
            `
        })
    }
};

module.exports = emailConfig;
