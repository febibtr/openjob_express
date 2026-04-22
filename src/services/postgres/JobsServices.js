const pool = require('./Pool');

class JobsService {
  async getJobs() {
    // Query untuk mengambil semua job
    const result = await pool.query('SELECT * FROM jobs');
    return result.rows;
  }
}

module.exports = JobsService;