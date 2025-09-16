const express = require('express');
const router = express.Router();

console.log('🧪 Simple test route loaded');

// Simple test route
router.get('/test', (req, res) => {
    console.log('🧪 Test route called');
    res.json({ 
        success: true, 
        message: 'Simple test route is working!',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;