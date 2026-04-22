const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');

// Public Endpoint
router.get('/', (req, res) => {
  // Logic untuk mengambil job dengan query parameters
});

// Protected Endpoint (Hanya user yang login bisa posting job)
router.post('/', authMiddleware, (req, res) => {
  const { id: credentialId } = req.user; // Diambil dari token
  // Logic simpan data
});

module.exports = router;