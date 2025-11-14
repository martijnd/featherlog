import { pool, initDatabase } from '../db/connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function createProject() {
  const projectId = process.argv[2];
  const projectName = process.argv[3];
  const secret = process.argv[4];

  if (!projectId || !projectName || !secret) {
    console.error('Usage: tsx src/scripts/create-project.ts <project-id> <project-name> <secret>');
    process.exit(1);
  }

  try {
    await initDatabase();
    
    await pool.query(
      'INSERT INTO projects (id, name, secret) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, secret = $3',
      [projectId, projectName, secret]
    );

    console.log(`Project ${projectId} (${projectName}) created/updated successfully`);
    console.log(`Secret: ${secret}`);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error creating project:', error);
    await pool.end();
    process.exit(1);
  }
}

createProject();

