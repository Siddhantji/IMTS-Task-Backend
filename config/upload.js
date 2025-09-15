const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Create subdirectories based on file type
        const fileType = file.mimetype.split('/')[0]; // 'image', 'application', etc.
        const subDir = path.join(uploadsDir, fileType);
        
        if (!fs.existsSync(subDir)) {
            fs.mkdirSync(subDir, { recursive: true });
        }
        
        cb(null, subDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const name = path.basename(file.originalname, ext);
        cb(null, `${name}-${uniqueSuffix}${ext}`);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif'];
    const fileExt = path.extname(file.originalname).toLowerCase().substring(1);
    
    if (allowedTypes.includes(fileExt)) {
        cb(null, true);
    } else {
        cb(new Error(`File type ${fileExt} is not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
};

// Configure multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
        files: 5 // Maximum 5 files per request
    },
    fileFilter: fileFilter
});

// Utility functions
const uploadConfig = {
    // Single file upload
    single: (fieldName) => upload.single(fieldName),
    
    // Multiple files upload
    multiple: (fieldName, maxCount = 5) => upload.array(fieldName, maxCount),
    
    // Fields upload (multiple fields with different names)
    fields: (fields) => upload.fields(fields),
    
    // Delete file utility
    deleteFile: (filePath) => {
        const fullPath = path.join(__dirname, '../uploads', filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }
        return false;
    },
    
    // Get file URL
    getFileUrl: (req, filePath) => {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        return `${baseUrl}/uploads/${filePath}`;
    },
    
    // Error handler middleware
    errorHandler: (error, req, res, next) => {
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'File too large',
                    maxSize: process.env.MAX_FILE_SIZE || '10MB'
                });
            }
            if (error.code === 'LIMIT_FILE_COUNT') {
                return res.status(400).json({
                    success: false,
                    message: 'Too many files uploaded'
                });
            }
        }
        
        if (error.message.includes('File type')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        
        next(error);
    }
};

module.exports = uploadConfig;
