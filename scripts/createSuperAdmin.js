require('dotenv').config();
const mongoose = require('mongoose');
const { User, Department } = require('../models');
const connectDB = require('../config/database');

const createSuperAdmin = async () => {
    try {
        // Connect to database
        await connectDB();
        
        // Check if super admin already exists
        const existingSuperAdmin = await User.findOne({ role: 'super_admin' });
        if (existingSuperAdmin) {
            console.log('✅ Super Admin already exists:', existingSuperAdmin.email);
            process.exit(0);
        }

        // Get or create a default department for super admin
        let adminDepartment = await Department.findOne({ name: 'Administration' });
        if (!adminDepartment) {
            adminDepartment = await Department.create({
                name: 'Administration',
                description: 'Administrative Department for System Management'
            });
            console.log('✅ Created Administration department');
        }

        // Create super admin user
        const superAdmin = await User.create({
            name: 'Super Administrator',
            email: 'superadmin@imts.com',
            password: 'SuperAdmin@123',
            phone: '9999999999',
            role: 'super_admin',
            department: adminDepartment._id,
            isActive: true
        });

        console.log('🎉 Super Admin created successfully!');
        console.log('📧 Email:', superAdmin.email);
        console.log('🔑 Password: SuperAdmin@123');
        console.log('🏢 Department:', adminDepartment.name);
        console.log('⚠️  Please change the password after first login!');
        
        // Also create a sample HOD for testing
        let csDepartment = await Department.findOne({ name: 'Computer Science' });
        if (!csDepartment) {
            csDepartment = await Department.create({
                name: 'Computer Science',
                description: 'Computer Science Department'
            });
            console.log('✅ Created Computer Science department');
        }

        const existingHOD = await User.findOne({ role: 'hod', department: csDepartment._id });
        if (!existingHOD) {
            const hod = await User.create({
                name: 'CS HOD',
                email: 'hod.cs@imts.com',
                password: 'HOD@123',
                phone: '8888888888',
                role: 'hod',
                department: csDepartment._id,
                isActive: true
            });
            
            console.log('🎉 Sample HOD created successfully!');
            console.log('📧 HOD Email:', hod.email);
            console.log('🔑 HOD Password: HOD@123');
            console.log('🏢 HOD Department:', csDepartment.name);
        }

    } catch (error) {
        console.error('❌ Error creating users:', error.message);
        if (error.code === 11000) {
            console.error('📧 Email already exists in the system');
        }
    } finally {
        mongoose.connection.close();
    }
};

// Run the script
createSuperAdmin();