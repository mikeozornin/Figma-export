const fs = require("node:fs");
const path = require("path");
const { getFiles } = require("./lib");
const { getFilesToBackup, updateBackupInfo, close: closeDb } = require("./db");

const MAX_FILES = 45;
const projectIds = process.argv.slice(2);

// Delay between API requests to respect rate limits (default: 2000ms = max 30 requests/min)
// Can be configured via FIGMA_API_REQUEST_DELAY_MS env variable (in ms)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REQUEST_DELAY_MS = Number(process.env.FIGMA_API_REQUEST_DELAY_MS) || 2000;

(async () => {
  try {
    const allApiFilesData = [];

    // Step 1: Fetch all files from Figma API for specified projects
    console.log("Fetching file metadata from Figma API...");
    for (let i = 0; i < projectIds.length; i++) {
      const projectId = projectIds[i];
      const projectFilesData = await getFiles(projectId);
      
      // Add project metadata
      projectFilesData.id = projectId;
      // projectFilesData has 'name' which is the project name

      allApiFilesData.push(projectFilesData);

      // Step 2: Update database with latest file info (do this for all fetched files)
      for (const file of projectFilesData.files) {
        // Assuming projectFilesData.name holds the project name from API
        await updateBackupInfo(file.key, file.last_modified, projectFilesData.name, file.name);
      }

      // Add delay between requests to respect rate limits (except after the last project)
      if (i < projectIds.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }
    console.log(`Fetched metadata for ${allApiFilesData.reduce((sum, p) => sum + p.files.length, 0)} files across ${allApiFilesData.length} projects.`);

    // Step 3: Get ALL files that need backup from DB
    const filesToBackupFromDb = await getFilesToBackup();
    console.log(`Found ${filesToBackupFromDb.length} files potentially needing backup in the database.`);

    // Step 4: Filter DB files against actual API files and apply limit
    const allApiFileKeys = new Set(allApiFilesData.flatMap(project => project.files.map(file => file.key)));
    
    const existingFilesToBackup = filesToBackupFromDb.filter(dbFile => allApiFileKeys.has(dbFile.file_key));
    console.log(`Found ${existingFilesToBackup.length} files that exist in Figma and need backup.`);

    // Apply the limit to the existing files needing backup (already sorted by priority in DB query)
    const finalFilesToBackup = existingFilesToBackup.slice(0, MAX_FILES);
    const backupFileKeys = new Set(finalFilesToBackup.map(f => f.file_key));
    console.log(`Selected ${finalFilesToBackup.length} files for this backup run based on priority and limit.`);

    // Step 5: Filter the API data to include only the final selected files for files.json
    const filteredFiles = allApiFilesData.map(project => ({
      ...project,
      // Project name 'name' is already part of projectFilesData
      files: project.files.filter(file => backupFileKeys.has(file.key))
    })).filter(project => project.files.length > 0);

    // Step 6: Write to files.json
    const filesJsonPath = path.join(__dirname, "../files.json");
    fs.writeFileSync(filesJsonPath, JSON.stringify(filteredFiles, null, 2));
    console.log(`Successfully wrote ${filteredFiles.length} projects with ${filteredFiles.reduce((acc, proj) => acc + proj.files.length, 0)} files to ${filesJsonPath}`);
    
    await closeDb();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
})();
