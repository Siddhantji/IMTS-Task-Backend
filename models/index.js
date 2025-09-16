// Export all models for easy importing
const User = require('./User');
const Department = require('./Department');
const Task = require('./Task');
const TaskHistory = require('./TaskHistory');
const Notification = require('./Notification');
const NotificationRead = require('./NotificationRead');

module.exports = {
    User,
    Department,
    Task,
    TaskHistory,
    Notification,
    NotificationRead
};
