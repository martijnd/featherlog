import bcrypt from 'bcrypt';
import { pool, execute, initDatabase } from '../db/connection.js';
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
    
    await execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?) AS new ON DUPLICATE KEY UPDATE password_hash = new.password_hash',
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

