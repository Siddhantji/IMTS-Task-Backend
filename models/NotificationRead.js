const mongoose = require('mongoose');

// Simple schema to track which TaskHistory entries have been read by which users
const notificationReadSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    taskHistory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TaskHistory',
        required: true
    },
    readAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index to ensure one read record per user per task history
notificationReadSchema.index({ user: 1, taskHistory: 1 }, { unique: true });

// Static methods
notificationReadSchema.statics.markAsRead = async function(userId, taskHistoryId) {
    try {
        await this.findOneAndUpdate(
            { user: userId, taskHistory: taskHistoryId },
            { readAt: new Date() },
            { upsert: true, new: true }
        );
        return true;
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return false;
    }
};

notificationReadSchema.statics.markAllAsRead = async function(userId, taskHistoryIds) {
    try {
        const readOperations = taskHistoryIds.map(historyId => ({
            updateOne: {
                filter: { user: userId, taskHistory: historyId },
                update: { readAt: new Date() },
                upsert: true
            }
        }));

        await this.bulkWrite(readOperations);
        return true;
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return false;
    }
};

notificationReadSchema.statics.getReadStatus = async function(userId, taskHistoryIds) {
    try {
        const readRecords = await this.find({
            user: userId,
            taskHistory: { $in: taskHistoryIds }
        }).select('taskHistory');

        const readHistoryIds = readRecords.map(record => record.taskHistory.toString());
        
        return taskHistoryIds.reduce((status, historyId) => {
            status[historyId.toString()] = readHistoryIds.includes(historyId.toString());
            return status;
        }, {});
    } catch (error) {
        console.error('Error getting read status:', error);
        return {};
    }
};

const NotificationRead = mongoose.model('NotificationRead', notificationReadSchema);

module.exports = NotificationRead;