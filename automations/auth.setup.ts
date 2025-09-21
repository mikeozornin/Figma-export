import { test as setup, expect } from "@playwright/test";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const authFile = ".auth/user.json";
const accountStateFile = ".auth/account-state.json";

// Check and create authentication directory if it doesn't exist
const authDir = path.dirname(authFile);
if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

// Function to get next account to use
function getNextAccount() {
  const statePath = path.join(process.cwd(), accountStateFile);
  let state = { lastUsedAccount: 0 };
  
  if (fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  }
  
  // Get total number of accounts from environment variables
  const totalAccounts = Object.keys(process.env)
    .filter(key => key.startsWith('FIGMA_ACCOUNT_') && key.endsWith('_EMAIL'))
    .length;
  
  if (totalAccounts === 0) {
    throw new Error('No Figma accounts configured in environment variables');
  }
  
  const nextAccount = (state.lastUsedAccount + 1) % totalAccounts;
  state.lastUsedAccount = nextAccount;
  
  fs.writeFileSync(statePath, JSON.stringify(state));
  return nextAccount + 1; // Return 1-based index for environment variables
}

setup("authenticate", async ({ page }) => {
  const accountNum = getNextAccount();
  const FIGMA_AUTH_COOKIE = process.env[`FIGMA_ACCOUNT_${accountNum}_AUTH_COOKIE`];

  if (FIGMA_AUTH_COOKIE) {
    const authCookie = {
      name: "__Host-figma.authn",
      value: FIGMA_AUTH_COOKIE,
      domain: "www.figma.com",
      path: "/",
      httpOnly: true,
      secure: true,
    };

    await page.context().addCookies([authCookie]);
    await page.goto("https://www.figma.com/files");
  } else {
    await page.goto("https://www.figma.com/login");
    await page
      .getByRole("textbox", { name: "email" })
      .fill(process.env[`FIGMA_ACCOUNT_${accountNum}_EMAIL`]!);
    await page
      .getByRole("textbox", { name: "password" })
      .fill(process.env[`FIGMA_ACCOUNT_${accountNum}_PASSWORD`]!);
    await page.getByRole("button", { name: "log in" }).click();
  }

  await expect(page.getByTestId("ProfileButton")).toBeAttached({
    timeout: 10 * 1000,
  });

  await page.context().storageState({ path: authFile });
});
