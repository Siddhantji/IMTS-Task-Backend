const mongoose = require('mongoose');
const Department = require('../models/Department');
const { logger } = require('./logger');

const defaultDepartments = [
    'Admission Department',
    'Service Department',
    'Exam Department',
    'IT Department',
    'HR Department',
    'Account Department',
    'Backend Department'
];

/**
 * Seed default departments into the database
 */
const seedDepartments = async () => {
    try {
        logger.info('Starting department seeding...');

        for (const deptName of defaultDepartments) {
            const existingDept = await Department.findOne({ name: deptName });

            if (!existingDept) {
                const department = new Department({
                    name: deptName,
                    isActive: true
                });

                await department.save();
                logger.info(`Created department: ${deptName}`);
            } else {
                logger.info(`Department already exists: ${deptName}`);
            }
        }

        logger.info('Department seeding completed successfully');
        return { success: true, message: 'Default departments seeded successfully' };

    } catch (error) {
        logger.error('Error seeding departments:', error);
        throw error;
    }
};

/**
 * Get all active departments
 */
const getActiveDepartments = async () => {
    try {
        const departments = await Department.find({ isActive: true })
            .select('name _id')
            .sort({ name: 1 });

        return departments;
    } catch (error) {
        logger.error('Error fetching departments:', error);
        throw error;
    }
};

/**
 * Check if departments exist
 */
const checkDepartmentsExist = async () => {
    try {
        const count = await Department.countDocuments({ isActive: true });
        return count > 0;
    } catch (error) {
        logger.error('Error checking departments:', error);
        return false;
    }
};

module.exports = {
    seedDepartments,
    getActiveDepartments,
    checkDepartmentsExist,
    defaultDepartments
};
