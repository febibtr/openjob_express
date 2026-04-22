const errorHandler = (error, req, res, next) => {
  // Jika error berasal dari Joi (validasi)
  if (error.isJoi) {
    return res.status(400).json({
      status: 'fail',
      message: error.message,
    });
  }

  // Jika error adalah error custom yang kita buat (misal: 401, 403, 404)
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      status: 'fail',
      message: error.message,
    });
  }

  // Jika error tidak dikenal (500)
  console.error(error);
  return res.status(500).json({
    status: 'error',
    message: 'Maaf, terjadi kegagalan pada server kami.',
  });
};

module.exports = errorHandler;