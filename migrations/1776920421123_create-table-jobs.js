exports.up = (pgm) => {
  pgm.createTable('jobs', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    title: { type: 'TEXT', notNull: true },
    company_id: { type: 'VARCHAR(50)', references: '"companies"', onDelete: 'cascade' },
    category_id: { type: 'VARCHAR(50)', references: '"categories"', onDelete: 'cascade' },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('current_timestamp') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('jobs');
}