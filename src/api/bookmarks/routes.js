const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middleware/auth');

router.post('/jobs/:jobId/bookmark', authMiddleware, async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { id: userId } = req.user;
    
    const bookmarkId = await bookmarksService.addBookmark(userId, jobId);
    
    res.status(201).json({
      status: 'success',
      message: 'Bookmark berhasil ditambahkan',
      data: { bookmarkId }
    });
  } catch (error) { next(error); }
});