exports.up = (pgm) => {
  pgm.createTable('applications', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    job_id: { type: 'VARCHAR(50)', references: '"jobs"', onDelete: 'cascade' },
    user_id: { type: 'VARCHAR(50)', references: '"users"', onDelete: 'cascade' },
    status: { type: 'VARCHAR(20)', notNull: true, default: 'pending' }, // pending, accepted, rejected
  });
};

exports.down = (pgm) => {
  pgm.dropTable('applications');
}