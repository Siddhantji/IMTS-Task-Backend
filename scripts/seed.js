require('dotenv').config();
const mongoose = require('mongoose');
const { seedDepartments } = require('../utils/seedDepartments');
const { logger } = require('../utils/logger');

const seedDatabase = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        logger.info('Connected to MongoDB for seeding');

        // Seed departments
        await seedDepartments();

        logger.info('Database seeding completed successfully');

    } catch (error) {
        logger.error('Database seeding failed:', error);
        process.exit(1);
    } finally {
        // Close connection
        await mongoose.connection.close();
        logger.info('Database connection closed');
        process.exit(0);
    }
};

// Run seeding if this script is executed directly
if (require.main === module) {
    seedDatabase();
}

module.exports = seedDatabase;
