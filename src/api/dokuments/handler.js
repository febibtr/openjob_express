const upload = require('../../middleware/upload');

router.post('/documents', authMiddleware, (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ status: 'fail', message: err.message });
    }
    
    const { filename } = req.file;

    res.status(201).json({
      status: 'success',
      message: 'Dokumen berhasil diunggah',
      data: { filename }
    });
  });
});