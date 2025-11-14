import bcrypt from 'bcrypt';
import { pool, initDatabase } from '../db/connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function createUser() {
  const username = process.argv[2];
  const password = process.argv[3];

  if (!username || !password) {
    console.error('Usage: tsx src/scripts/create-user.ts <username> <password>');
    process.exit(1);
  }

  try {
    await initDatabase();
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO UPDATE SET password_hash = $2',
      [username, passwordHash]
    );

    console.log(`User ${username} created/updated successfully`);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error creating user:', error);
    await pool.end();
    process.exit(1);
  }
}

createUser();

