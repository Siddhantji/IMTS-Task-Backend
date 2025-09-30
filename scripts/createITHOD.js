require('dotenv').config();
const mongoose = require('mongoose');
const { User, Department } = require('../models');
const connectDB = require('../config/database');

const createITHOD = async () => {
    try {
        // Connect to database
        await connectDB();
        
        // Find the IT Department by the provided ID
        const itDepartment = await Department.findById('68c7b5b414fdde945e61d11c');
        
        if (!itDepartment) {
            console.log('❌ IT Department not found with ID: 68c7b5b414fdde945e61d11c');
            console.log('📋 Available departments:');
            const departments = await Department.find({});
            departments.forEach(dept => {
                console.log(`   - ${dept.name} (ID: ${dept._id})`);
            });
            process.exit(1);
        }

        console.log(`✅ Found IT Department: ${itDepartment.name}`);

        // Check if HOD already exists for this department
        const existingHOD = await User.findOne({ 
            role: 'hod', 
            department: itDepartment._id 
        });

        if (existingHOD) {
            console.log('⚠️  HOD already exists for IT Department:');
            console.log('📧 Email:', existingHOD.email);
            console.log('👤 Name:', existingHOD.name);
            console.log('🆔 User ID:', existingHOD._id);
            process.exit(0);
        }

        // Check if email already exists
        const emailExists = await User.findOne({ email: 'hod.it@imts.com' });
        if (emailExists) {
            console.log('❌ Email hod.it@imts.com already exists in the system');
            console.log('👤 Current user:', emailExists.name);
            console.log('🏢 Department:', emailExists.department);
            process.exit(1);
        }

        // Create HOD user for IT Department
        const itHOD = await User.create({
            name: 'IT Department HOD',
            email: 'hod.it@imts.com',
            password: 'HOD@123',
            phone: '7777777777',
            role: 'hod',
            department: itDepartment._id,
            isActive: true,
            hasAccess: true
        });

        console.log('🎉 IT Department HOD created successfully!');
        console.log('=====================================');
        console.log('👤 Name:', itHOD.name);
        console.log('📧 Email:', itHOD.email);
        console.log('🔑 Password: HOD@123');
        console.log('📱 Phone:', itHOD.phone);
        console.log('🏢 Department:', itDepartment.name);
        console.log('🆔 User ID:', itHOD._id);
        console.log('🆔 Department ID:', itDepartment._id);
        console.log('=====================================');
        console.log('⚠️  Please change the password after first login!');
        console.log('🔗 HOD Dashboard: http://localhost:5173/hod/dashboard');

    } catch (error) {
        console.error('❌ Error creating IT HOD:', error.message);
        if (error.code === 11000) {
            console.error('📧 Email already exists in the system');
        }
        if (error.name === 'ValidationError') {
            console.error('📝 Validation errors:');
            Object.keys(error.errors).forEach(key => {
                console.error(`   - ${key}: ${error.errors[key].message}`);
            });
        }
    } finally {
        mongoose.connection.close();
    }
};

// Run the script
createITHOD();