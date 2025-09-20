import { test } from "@playwright/test";
import fs from "node:fs";
import dotenv from "dotenv";
import { updateBackupDate, recordBackupFailure } from "../scripts/db";

dotenv.config();

const projects = JSON.parse(
  fs.readFileSync("files.json", { encoding: "utf-8" }),
);

// Set a longer timeout for downloads (60 minutes)
test.setTimeout(3600000); // 60 minutes in milliseconds

for (const project of projects) {
  const projectName = project.name || "Drafts";
  const teamId = project.team_id || null;

  test.describe(`project: ${projectName} (${project.id})`, () => {
    for (const file of project.files) {
      test(`file: ${file.name} (${file.key})`, async ({ page }) => {
        try {
          await page.goto(`https://www.figma.com/design/${file.key}/`);

          const downloadPromise = page.waitForEvent("download");

          await page.locator("#toggle-menu-button").click();
          await page.locator("[id^='mainMenu-file-menu-']").click();
          const saveAsButton = page.locator("[id^='mainMenu-save-as-']");
          if (!(await saveAsButton.isVisible())) {
            throw new Error("Save As menu item not found");
          }
          await saveAsButton.click();

          const download = await downloadPromise;
          const suggestedFilename = download.suggestedFilename();
          const filename = suggestedFilename.match(/.*(?=\.[\w\d]+)/)![0];
          const extension = suggestedFilename.replace(filename + ".", "");
          await download.saveAs(
            `${process.env.DOWNLOAD_PATH!}/${teamId ? teamId + "/" : ""}${projectName} (${project.id})/${filename} (${file.key}).${extension}`,
          );
          
          // Only update backup date if download and save were successful
          await updateBackupDate(file.key);
        } catch (error) {
          await recordBackupFailure(file.key);
          throw error;
        }
      });
    }
  });
}
