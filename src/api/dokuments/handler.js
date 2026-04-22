const upload = require('../../middleware/upload'); // Middleware multer yang kita bahas sebelumnya

router.post('/documents', authMiddleware, (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ status: 'fail', message: err.message });
    }
    
    // Jika berhasil upload, simpan path file ke database
    const { filename } = req.file;
    // const documentId = await documentsService.addDocument(filename, req.user.id);

    res.status(201).json({
      status: 'success',
      message: 'Dokumen berhasil diunggah',
      data: { filename }
    });
  });
});