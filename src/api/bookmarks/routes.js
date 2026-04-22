const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');

// POST /jobs/:jobId/bookmark -> Create bookmark
router.post('/jobs/:jobId/bookmark', authMiddleware, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { id: userId } = req.user;
    
    // Simpan ke database melalui service
    const bookmarkId = await bookmarksService.addBookmark(userId, jobId);
    
    res.status(201).json({
      status: 'success',
      message: 'Bookmark berhasil ditambahkan',
      data: { bookmarkId }
    });
  } catch (error) { next(error); }
});