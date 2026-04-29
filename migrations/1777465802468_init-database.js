exports.shorthands = undefined;

exports.up = (pgm) => {
  // 1. Tabel Master
  pgm.createTable('users', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    name: { type: 'TEXT', notNull: true },
    email: { type: 'VARCHAR(50)', notNull: true, unique: true },
    password: { type: 'TEXT', notNull: true },
    role: { type: 'VARCHAR(20)', notNull: true, default: 'user' },
  });

  pgm.createTable('authentications', { 
    token: { type: 'TEXT', notNull: true } 
  });

  pgm.createTable('categories', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    name: { type: 'TEXT', notNull: true },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('current_timestamp') },
  });

  // 2. Tabel Relasional 
  pgm.createTable('companies', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    name: { type: 'TEXT', notNull: true },
    location: { type: 'TEXT', notNull: true },
    description: { type: 'TEXT' },
    owner: { type: 'VARCHAR(50)', references: '"users"', onDelete: 'cascade' },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('current_timestamp') },
  });

  pgm.createTable('documents', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    user_id: { type: 'VARCHAR(50)', references: '"users"', onDelete: 'cascade' },
    filename: { type: 'TEXT', notNull: true },
    url: { type: 'TEXT', notNull: true },
  });

  pgm.createTable('jobs', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    company_id: { type: 'VARCHAR(50)', references: '"companies"', onDelete: 'cascade' },
    category_id: { type: 'VARCHAR(50)', references: '"categories"', onDelete: 'cascade' },
    title: { type: 'TEXT', notNull: true },
    description: { type: 'TEXT' },
    job_type: { type: 'VARCHAR(20)' },
    experience_level: { type: 'VARCHAR(20)' },
    location_type: { type: 'VARCHAR(20)' },
    location_city: { type: 'TEXT' },
    salary_min: { type: 'INTEGER' },
    salary_max: { type: 'INTEGER' },
    is_salary_visible: { type: 'BOOLEAN', default: true },
    status: { type: 'VARCHAR(20)', default: 'open' },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('current_timestamp') },
  });

  // 3. Tabel Transaksional 
  pgm.createTable('applications', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    job_id: { type: 'VARCHAR(50)', references: '"jobs"', onDelete: 'cascade' },
    user_id: { type: 'VARCHAR(50)', references: '"users"', onDelete: 'cascade' },
    status: { type: 'VARCHAR(20)', notNull: true, default: 'pending' },
    created_at: { type: 'TIMESTAMP', notNull: true, default: pgm.func('current_timestamp') },
  });

  pgm.createTable('bookmarks', {
    id: { type: 'VARCHAR(50)', primaryKey: true },
    user_id: { type: 'VARCHAR(50)', references: '"users"', onDelete: 'cascade' },
    job_id: { type: 'VARCHAR(50)', references: '"jobs"', onDelete: 'cascade' },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('bookmarks');
  pgm.dropTable('applications');
  pgm.dropTable('jobs');
  pgm.dropTable('documents');
  pgm.dropTable('companies');
  pgm.dropTable('categories');
  pgm.dropTable('authentications');
  pgm.dropTable('users');
};