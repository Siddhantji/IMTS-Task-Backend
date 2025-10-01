const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import Task model
const Task = require('../models/Task');

async function cleanupOrphanedAttachments() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all tasks with attachments
        const tasks = await Task.find({ 'attachments.0': { $exists: true } });
        console.log(`Found ${tasks.length} tasks with attachments`);

        let orphanedCount = 0;
        let cleanedCount = 0;

        for (const task of tasks) {
            const validAttachments = [];
            
            for (const attachment of task.attachments) {
                // Normalize path separators
                const normalizedPath = attachment.path.replace(/\\/g, '/');
                const filePath = path.resolve(__dirname, '../', normalizedPath);
                
                if (fs.existsSync(filePath)) {
                    validAttachments.push(attachment);
                    console.log(`✓ Valid: ${attachment.originalName}`);
                } else {
                    orphanedCount++;
                    console.log(`✗ Orphaned: ${attachment.originalName} (${attachment._id})`);
                    console.log(`  Path: ${filePath}`);
                }
            }

            // Update task if there were orphaned attachments
            if (validAttachments.length !== task.attachments.length) {
                task.attachments = validAttachments;
                await task.save();
                cleanedCount++;
                console.log(`Updated task: ${task.title}`);
            }
        }

        console.log(`\n--- Cleanup Summary ---`);
        console.log(`Total orphaned attachments found: ${orphanedCount}`);
        console.log(`Tasks cleaned: ${cleanedCount}`);
        
        mongoose.connection.close();
        
    } catch (error) {
        console.error('Error cleaning up orphaned attachments:', error);
        mongoose.connection.close();
        process.exit(1);
    }
}

// Run only if called directly
if (require.main === module) {
    cleanupOrphanedAttachments();
}

module.exports = cleanupOrphanedAttachments;