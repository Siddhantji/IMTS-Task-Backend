require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

// Import configurations and utilities
const connectDB = require('./config/database');
const { logger } = require('./utils/logger');
const { errorHandler, notFound, apiRateLimit } = require('./middleware');

// Import routes
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const userRoutes = require('./routes/users');

// Create Express app
const app = express();

// Connect to database
connectDB();

// Security middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// CORS configuration
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting (disabled for development)
// app.use('/api/', apiRateLimit);

// Static files middleware for file uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API documentation endpoint
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'IMTS Task Management API',
        version: '1.0.0',
        documentation: {
            authentication: '/api/auth',
            tasks: '/api/tasks',
            users: '/api/users'
        },
        endpoints: {
            health: '/health',
            auth: {
                register: 'POST /api/auth/register',
                login: 'POST /api/auth/login',
                profile: 'GET /api/auth/profile',
                updateProfile: 'PUT /api/auth/profile',
                changePassword: 'PUT /api/auth/change-password',
                refreshToken: 'POST /api/auth/refresh-token',
                logout: 'POST /api/auth/logout',
                logoutAll: 'POST /api/auth/logout-all'
            },
            tasks: {
                createTask: 'POST /api/tasks',
                getTasks: 'GET /api/tasks',
                getTask: 'GET /api/tasks/:id',
                updateTask: 'PUT /api/tasks/:id',
                updateStatus: 'PUT /api/tasks/:id/status',
                updateStage: 'PUT /api/tasks/:id/stage',
                addRemark: 'POST /api/tasks/:id/remarks',
                assignTask: 'PUT /api/tasks/:id/assign',
                deleteTask: 'DELETE /api/tasks/:id',
                getStats: 'GET /api/tasks/stats'
            },
            users: {
                getUsers: 'GET /api/users',
                getUser: 'GET /api/users/:id',
                getAllEmployees: 'GET /api/users/employees',
                updateRole: 'PUT /api/users/:id/role',
                toggleStatus: 'PUT /api/users/:id/status',
                transferUser: 'PUT /api/users/:id/transfer',
                getStats: 'GET /api/users/stats'
            }
        }
    });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);

// Handle 404 routes
app.use(notFound);

// Global error handling middleware
app.use(errorHandler);

// Server configuration
const PORT = process.env.PORT || 5000;

// Start server
const server = app.listen(PORT, () => {
    logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    
    if (process.env.NODE_ENV === 'development') {
        console.log(`🚀 Server started successfully!`);
        console.log(`📍 API Base URL: http://localhost:${PORT}/api`);
        console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
        console.log(`📚 API Documentation: http://localhost:${PORT}/api`);
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    logger.error('Unhandled Promise Rejection:', err);
    // Close server & exit process
    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    return (err) => {
        logger.info(`${signal} received`);
        if (err) {
            logger.error(err);
        }
        
        server.close(() => {
            logger.info('HTTP server closed');
            process.exit(err ? 1 : 0);
        });
    };
};

// Listen for termination signals
process.on('SIGINT', gracefulShutdown('SIGINT'));
process.on('SIGTERM', gracefulShutdown('SIGTERM'));

module.exports = app;
