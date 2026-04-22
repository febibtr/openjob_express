const pool = require('./Pool');
const bcrypt = require('bcrypt');
const { nanoid } = require('nanoid'); // npm install nanoid@3

class UsersService {
  async addUser({ username, password, fullname }) {
    // 1. Cek apakah username sudah dipakai (Unique Constraint)
    const queryCheck = {
      text: 'SELECT username FROM users WHERE username = $1',
      values: [username],
    };
    const resultCheck = await pool.query(queryCheck);
    if (resultCheck.rowCount > 0) {
      const error = new Error('Username sudah digunakan');
      error.statusCode = 400;
      throw error;
    }

    // 2. Hash password & simpan ke DB
    const id = `user-${nanoid(16)}`;
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = {
      text: 'INSERT INTO users VALUES($1, $2, $3, $4) RETURNING id',
      values: [id, username, hashedPassword, fullname],
    };

    const result = await pool.query(query);
    return result.rows[0].id;
  }
}

module.exports = UsersService;