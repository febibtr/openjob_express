const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');

// Public Endpoint
router.get('/', (req, res) => {
});

// Protected Endpoint 
router.post('/', authMiddleware, (req, res) => {
  const { id: credentialId } = req.user; 
  // Logic simpan data
});

module.exports = router;