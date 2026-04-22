const express = require('express');
const app = express();

// 1. Wajib agar bisa membaca body JSON
app.use(express.json());

// 2. Simulasi Database (Nanti hubungkan ke UsersService)
const users = [];

// [MANDATORY] POST /users - Register New User
app.post('/users', (req, res) => {
  const { username, password, fullname } = req.body;

  // Skenario Negatif: Validasi sederhana (Agar tes 'Invalid Payload' sukses)
  if (!username || !password || !fullname) {
    return res.status(400).json({
      status: 'fail',
      message: 'Gagal menambahkan user. Mohon lengkapi semua field'
    });
  }

  // Skenario Positif
  const id = `user-${Math.random().toString(36).substr(2, 9)}`;
  const newUser = { id, username, password, fullname };
  users.push(newUser);

  res.status(201).json({
    status: 'success',
    message: 'User berhasil ditambahkan',
    data: {
      userId: id
    }
  });
});

// [MANDATORY] GET /jobs - List All Jobs
app.get('/jobs', (req, res) => {
  res.json({
    status: 'success',
    data: {
      jobs: [] // Kosong dulu tidak apa-apa untuk tes awal
    }
  });
});

// Gunakan port 3000 agar sesuai dengan Postman Environment kamu
const port = 3000; 
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});