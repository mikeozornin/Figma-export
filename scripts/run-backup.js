const fs = require("node:fs");
const path = require("path");
const { execSync } = require("child_process");
const { close: closeDb } = require("./db");

async function runBackup() {
  try {
    // Clean up previous files.json if it exists
    const filesJsonPath = path.join(__dirname, "../files.json");
    if (fs.existsSync(filesJsonPath)) {
      fs.unlinkSync(filesJsonPath);
    }

    // Step 1: Generate files.json
    console.log("Generating files.json...");
    execSync("node scripts/get-team-files.js 1446837479148090378", { stdio: "inherit" });

    // Step 2: Run tests
    console.log("Running tests...");
    try {
      // execSync("npx playwright test automations/download.spec.ts --headed", { stdio: "inherit" });
      execSync("npx playwright test automations/download.spec.ts", { stdio: "inherit" });
      
      console.log("Backup completed successfully!");
    } catch (testError) {
      console.error("Playwright tests failed:", testError);
      throw testError; // Re-throw to be caught by outer try-catch
    }

    await closeDb();

    // After closing DB, check if Alloy volume is mounted and run rsync if so
    const alloyBackupPath = "/Volumes/Alloy/ptsecurity/figma-all-backups";
    if (fs.existsSync(alloyBackupPath)) {
      console.log("Alloy volume is mounted. Running rsync...");
      try {
        execSync(
          'rsync -av --remove-source-files "/Users/mike/work/git-repos/work/stuff/figma-export-clean/downloads/1446837479148090378/" "/Volumes/Alloy/ptsecurity/figma-clean-backups-download/1446837479148090378/"',
          { stdio: "inherit" }
        );
        console.log("rsync completed successfully!");
      } catch (rsyncError) {
        console.error("rsync failed:", rsyncError);
      }
    } else {
      console.log("Alloy volume is not mounted. Skipping rsync.");
    }
  } catch (error) {
    console.error("Backup failed:", error);
    process.exit(1);
  }
}

runBackup(); 