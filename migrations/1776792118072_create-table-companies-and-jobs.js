exports.up = (pgm) => {
  // Tabel Perusahaan
  pgm.createTable('companies', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    name: { type: 'TEXT', notNull: true },
    owner: { type: 'VARCHAR(50)', references: '"users"', onDelete: 'cascade' },
  });

  // Tabel Lowongan (Jobs)
  pgm.createTable('jobs', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    title: { type: 'TEXT', notNull: true },
    company_id: { type: 'VARCHAR(50)', references: '"companies"', onDelete: 'cascade' },
    category_id: { type: 'VARCHAR(50)', notNull: true },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('current_timestamp') },
  });
};