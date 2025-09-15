const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Simple logger utility
const logger = {
    info: (message, ...args) => {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] INFO: ${message}`;
        console.log(logMessage, ...args);
        
        // Write to file
        fs.appendFileSync(
            path.join(logsDir, 'app.log'),
            logMessage + (args.length ? ' ' + JSON.stringify(args) : '') + '\n'
        );
    },

    error: (message, ...args) => {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ERROR: ${message}`;
        console.error(logMessage, ...args);
        
        // Write to file
        fs.appendFileSync(
            path.join(logsDir, 'error.log'),
            logMessage + (args.length ? ' ' + JSON.stringify(args) : '') + '\n'
        );
    },

    warn: (message, ...args) => {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] WARN: ${message}`;
        console.warn(logMessage, ...args);
        
        // Write to file
        fs.appendFileSync(
            path.join(logsDir, 'app.log'),
            logMessage + (args.length ? ' ' + JSON.stringify(args) : '') + '\n'
        );
    },

    debug: (message, ...args) => {
        if (process.env.NODE_ENV === 'development') {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] DEBUG: ${message}`;
            console.log(logMessage, ...args);
        }
    }
};

module.exports = { logger };
