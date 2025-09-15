const mongoose = require('mongoose');
const { logger } = require('../utils/logger');
const { seedDepartments, checkDepartmentsExist } = require('../utils/seedDepartments');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        logger.info(`MongoDB Connected: ${conn.connection.host}`);
        
        // Seed default departments if they don't exist
        try {
            const departmentsExist = await checkDepartmentsExist();
            if (!departmentsExist) {
                logger.info('No departments found. Seeding default departments...');
                await seedDepartments();
            } else {
                logger.info('Default departments already exist');
            }
        } catch (seedError) {
            logger.error('Error seeding departments:', seedError);
            // Don't exit the process if seeding fails, just log the error
        }
        
        // Handle connection events
        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            try {
                await mongoose.connection.close();
                logger.info('MongoDB connection closed through app termination');
                process.exit(0);
            } catch (err) {
                logger.error('Error during MongoDB disconnection:', err);
                process.exit(1);
            }
        });

        return conn;
    } catch (error) {
        logger.error('Database connection failed:', error);
        process.exit(1);
    }
};

module.exports = connectDB;
