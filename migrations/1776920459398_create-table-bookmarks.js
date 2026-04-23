exports.up = (pgm) => {
  pgm.createTable('bookmarks', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    user_id: { type: 'VARCHAR(50)', references: '"users"', onDelete: 'cascade' },
    job_id: { type: 'VARCHAR(50)', references: '"jobs"', onDelete: 'cascade' },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('bookmarks');
};