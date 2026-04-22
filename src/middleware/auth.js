const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      status: 'fail',
      message: 'Token tidak ditemukan',
    });
  }

  const token = authHeader.split(' ')[1]; // Mengambil token setelah kata 'Bearer'

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_KEY);
    req.user = decoded; // Menyimpan payload (id user) ke dalam request
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'fail',
      message: 'Token tidak valid atau sudah kadaluarsa',
    });
  }
};

module.exports = authMiddleware;