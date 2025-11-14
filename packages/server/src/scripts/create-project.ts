import { pool, initDatabase } from "../db/connection.js";
import dotenv from "dotenv";

dotenv.config();

async function createProject() {
  const projectId = process.argv[2];
  const projectName = process.argv[3];
  const originsArg = process.argv[4];

  if (!projectId || !projectName || !originsArg) {
    console.error(
      "Usage: tsx src/scripts/create-project.ts <project-id> <project-name> <origins-json>"
    );
    console.error(
      'Example: tsx src/scripts/create-project.ts my-project "My Project" \'["https://example.com"]\''
    );
    console.error("At least one origin is required");
    process.exit(1);
  }

  let origins: string[] = [];
  try {
    origins = JSON.parse(originsArg);
    if (!Array.isArray(origins)) {
      throw new Error("Origins must be an array");
    }

    // Require at least one origin
    if (origins.length === 0) {
      console.error("Error: At least one origin is required.");
      process.exit(1);
    }

    // Disallow '*' as a single origin to prevent abuse
    if (origins.length === 1 && origins[0] === "*") {
      console.error("Error: Cannot use '*' as the only origin.");
      console.error("Specify at least one valid origin.");
      process.exit(1);
    }
  } catch (error) {
    console.error("Error parsing origins JSON:", error);
    console.error(
      'Origins should be a JSON array, e.g., ["https://example.com", "https://app.example.com"]'
    );
    process.exit(1);
  }

  try {
    await initDatabase();

    await pool.query(
      "INSERT INTO projects (id, name, origins) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, origins = $3",
      [projectId, projectName, JSON.stringify(origins)]
    );

    console.log(
      `Project ${projectId} (${projectName}) created/updated successfully`
    );
    console.log(`Origins: ${JSON.stringify(origins)}`);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("Error creating project:", error);
    await pool.end();
    process.exit(1);
  }
}

createProject();
