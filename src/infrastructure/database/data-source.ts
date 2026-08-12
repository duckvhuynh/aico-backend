import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  synchronize: false,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsTableName: 'aico_migrations',
});
