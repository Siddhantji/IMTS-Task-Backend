const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Department = require('../models/Department');
require('dotenv').config();

/**
 * Script to create a default admin account
 * This script will create an admin user with predefined credentials
 */

// Default admin credentials
const DEFAULT_ADMIN = {
    name: 'System Administrator',
    email: 'admin@imts.com',
    password: 'Admin@123',
    role: 'admin',
    employeeId: 'ADMIN001',
    isActive: true
};

async function createDefaultAdmin() {
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/imts-task-management');
        console.log('Connected to MongoDB successfully');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ 
            $or: [
                { email: DEFAULT_ADMIN.email },
                { role: 'admin' }
            ]
        });

        if (existingAdmin) {
            console.log('Admin account already exists:');
            console.log(`Name: ${existingAdmin.name}`);
            console.log(`Email: ${existingAdmin.email}`);
            console.log(`Role: ${existingAdmin.role}`);
            console.log('Skipping admin creation...');
            
            // Ask if user wants to reset password
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            rl.question('Do you want to reset the admin password? (y/N): ', async (answer) => {
                if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                    try {
                        const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 10);
                        await User.findByIdAndUpdate(existingAdmin._id, {
                            password: hashedPassword,
                            isActive: true
                        });
                        console.log('✅ Admin password reset successfully!');
                        console.log(`New Password: ${DEFAULT_ADMIN.password}`);
                    } catch (error) {
                        console.error('❌ Error resetting admin password:', error.message);
                    }
                } else {
                    console.log('Admin password not changed.');
                }
                rl.close();
                await mongoose.disconnect();
                console.log('Disconnected from MongoDB');
            });
            return;
        }

        // Create default department if it doesn't exist
        let adminDepartment = await Department.findOne({ name: 'Administration' });
        if (!adminDepartment) {
            console.log('Creating Administration department...');
            adminDepartment = new Department({
                name: 'Administration',
                description: 'System Administration Department',
                isActive: true
            });
            await adminDepartment.save();
            console.log('✅ Administration department created');
        }

        // Hash the password
        console.log('Hashing password...');
        const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, 10);

        // Create admin user
        console.log('Creating admin user...');
        const adminUser = new User({
            name: DEFAULT_ADMIN.name,
            email: DEFAULT_ADMIN.email,
            password: hashedPassword,
            role: DEFAULT_ADMIN.role,
            employeeId: DEFAULT_ADMIN.employeeId,
            department: adminDepartment._id,
            isActive: DEFAULT_ADMIN.isActive,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await adminUser.save();

        console.log('\n🎉 Default admin account created successfully!');
        console.log('='.repeat(50));
        console.log('📧 Email:', DEFAULT_ADMIN.email);
        console.log('🔑 Password:', DEFAULT_ADMIN.password);
        console.log('👤 Name:', DEFAULT_ADMIN.name);
        console.log('🏷️ Role:', DEFAULT_ADMIN.role);
        console.log('🆔 Employee ID:', DEFAULT_ADMIN.employeeId);
        console.log('🏢 Department:', adminDepartment.name);
        console.log('='.repeat(50));
        console.log('\n⚠️  IMPORTANT: Please change the default password after first login!');
        console.log('💡 You can now login to the system using these credentials.');

    } catch (error) {
        console.error('❌ Error creating default admin:', error.message);
        if (error.code === 11000) {
            console.error('Admin with this email or employee ID already exists!');
        }
    } finally {
        // Disconnect from MongoDB
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    }
}

async function showAdminInfo() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/imts-task-management');
        
        const admin = await User.findOne({ role: 'admin' }).populate('department', 'name');
        
        if (!admin) {
            console.log('❌ No admin account found in the system');
            return;
        }

        console.log('\n👨‍💼 Current Admin Account Info:');
        console.log('='.repeat(40));
        console.log(`📧 Email: ${admin.email}`);
        console.log(`👤 Name: ${admin.name}`);
        console.log(`🆔 Employee ID: ${admin.employeeId}`);
        console.log(`🏢 Department: ${admin.department?.name || 'N/A'}`);
        console.log(`✅ Active: ${admin.isActive ? 'Yes' : 'No'}`);
        console.log(`📅 Created: ${admin.createdAt.toLocaleDateString()}`);
        console.log('='.repeat(40));

    } catch (error) {
        console.error('❌ Error fetching admin info:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
    case 'create':
        console.log('🚀 Creating default admin account...\n');
        createDefaultAdmin();
        break;
    case 'info':
        console.log('📋 Fetching admin account information...\n');
        showAdminInfo();
        break;
    case 'help':
    case '--help':
    case '-h':
        console.log('\n📖 Default Admin Script Usage:');
        console.log('================================');
        console.log('npm run create-admin create  - Create default admin account');
        console.log('npm run create-admin info    - Show current admin account info');
        console.log('npm run create-admin help    - Show this help message');
        console.log('\nDefault Admin Credentials:');
        console.log(`Email: ${DEFAULT_ADMIN.email}`);
        console.log(`Password: ${DEFAULT_ADMIN.password}`);
        console.log(`Role: ${DEFAULT_ADMIN.role}`);
        process.exit(0);
        break;
    default:
        console.log('🚀 Creating default admin account...\n');
        createDefaultAdmin();
        break;
}