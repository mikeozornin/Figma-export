# A bit more intelligent figma-export

Improved version of [figma-export](https://github.com/alexchantastic/figma-export) by [@alexchantastic](https://github.com/alexchantastic). Quite old, check for a new one in original repo.

Improvements:
- Use sqlite3 to store file metadata and prioritize downloads
- Intelligent backup selection based on file modification dates and backup history
- Automatic retry mechanism for failed downloads with exponential backoff
- Configurable backup limits and priority-based file selection


figma-export is a CLI tool for bulk exporting Figma, FigJam, and Figma Slides files to your local desktop in Figma's proprietary `.fig`/`.jam`/`.deck` format. figma-export supports downloading by team, project, and even drafts.

This tool leverages [Figma's REST API](https://www.figma.com/developers/api) and [Playwright](https://playwright.dev/) to automate discovering Figma files and downloading them.

> [!NOTE]
> If you are a complete beginner to the terminal and CLI tools, please refer to the [Complete beginner guide](https://github.com/alexchantastic/figma-export/wiki/Complete-beginner-guide) in the wiki.

## Table of contents

- [Requirements](#requirements)
- [Installation](#Installation)
- [Usage](#usage)
- [Commands](#commands)
- [Known issues](#known-issues)

## Requirements

- node (v20 LTS)
- npm (v10 LTS)

Other versions may work, but have not been officially tested.

You will also need a [Figma access token](https://www.figma.com/developers/api#authentication) with scope access to **file content** that you can generate through your Figma user profile settings.

## Installation

1. Clone the repository or download the latest release
2. `cd` into the repository
3. Run `npm install`

## Usage

### Environment variables

Create a `.env` file at the root of the repository. You must provide a single Figma access token for API access, and you can provide an array of accounts for browser login (round-robin):

```sh
# Single API token (required for all API operations)
FIGMA_ACCESS_TOKEN="figd_abcdefghijklmnopqrstuvwxyz"

# Multiple accounts for browser login (round-robin)
FIGMA_ACCOUNT_1_EMAIL="email1@example.com"
FIGMA_ACCOUNT_1_PASSWORD="password1"
# Or, if using SSO/cookie:
# FIGMA_ACCOUNT_1_AUTH_COOKIE="cookie1"

FIGMA_ACCOUNT_2_EMAIL="email2@example.com"
FIGMA_ACCOUNT_2_PASSWORD="password2"
# Or, if using SSO/cookie:
# FIGMA_ACCOUNT_2_AUTH_COOKIE="cookie2"

# Add as many accounts as you need:
# FIGMA_ACCOUNT_3_EMAIL=...
# ...

DOWNLOAD_PATH="/Users/anonymous/Downloads" # Absolute path where files will be downloaded to
WAIT_TIMEOUT=10000 # Time in ms to wait between downloads (defaults to 10000)

# Backup configuration (optional)
MAX_FILES=45 # Maximum files to backup per run (defaults to 45)
RETRY_DELAY_HOURS=72 # Hours to wait before retrying failed downloads (defaults to 72)
```

> [!CAUTION]
> Figma has started to implement anti-automation detection which may cause issues with using this tool. It is recommended that you do not set a lower `WAIT_TIMEOUT` than `10000`. To be on the safer side, you may want to increase it even further.

If you are using SSO to log in to Figma, you can either manually set a password (see [wiki](https://github.com/alexchantastic/figma-export/wiki/Manually-setting-a-Figma-password)) _or_ you can provide your Figma auth session cookie through `FIGMA_ACCOUNT_X_AUTH_COOKIE` in lieu of `FIGMA_ACCOUNT_X_EMAIL` and `FIGMA_ACCOUNT_X_PASSWORD`:

```sh
FIGMA_ACCOUNT_1_AUTH_COOKIE="my-auth-cookie-value"
FIGMA_ACCESS_TOKEN="figd_abcdefghijklmnopqrstuvwxyz"
DOWNLOAD_PATH="/Users/anonymous/Downloads"
WAIT_TIMEOUT=10000
```

The value for `FIGMA_ACCOUNT_X_AUTH_COOKIE` should be the value of the `__Host-figma.authn` cookie. Please refer to the [wiki](https://github.com/alexchantastic/figma-export/wiki/Getting-your-Figma-auth-session-cookie) on how to grab this value.

> **Note:**
> - Only one `FIGMA_ACCESS_TOKEN` is used for all API requests.
> - The array of accounts is used only for browser-based login automation (to help avoid rate limits or anti-automation detection).
> - The tool will automatically round-robin through all configured accounts for browser login.

### Generating files.json

`files.json` determines which Figma files within your account will be downloaded.

> [!TIP]
> Drafts are just a hidden project in Figma so you can absolutely download them with figma-export. Check out the [wiki](https://github.com/alexchantastic/figma-export/wiki/Downloading-draft-files) to learn about how to grab the drafts project ID.

It is recommended that you use one of the built-in commands to generate `files.json`:

- `npm run get-team-files {team_ids ...}` - Gets all files for all projects within given team IDs (space separated)
  - Example: `npm run get-team-files 12345 67890`
- `npm run get-project-files {project_ids ...}` - Gets all files for given project IDs (space separated)
  - Example: `npm run get-project-files 12345 67890`

To find your Figma team ID, navigate to your [Figma home](https://www.figma.com/files/), right click your team in the left sidebar, and then click **Copy link**. The last segment of the URL that you copied will contain your team ID: `https://www.figma.com/files/team/1234567890`.

To find a project ID, navigate to your team's home, right click the project, and then click **Copy link**. The last segment of the URL that you copied will contain the project ID: `https://www.figma.com/files/project/1234567890`.

You are free to manually construct this file as long as it follows this structure:

```json
[
  {
    "name": String,
    "id": String,
    "team_id": String?,
    "files": [
      {
        "key": String,
        "name": String
      },
      ...
    ]
  },
  ...
]
```

This is a modified structure from the return value of [Figma's GET project files](https://www.figma.com/developers/api#get-project-files-endpoint) endpoint.

### Backup Selection Logic

This enhanced version includes intelligent backup selection that prioritizes files based on several criteria:

#### Database Schema
The tool uses SQLite3 to track file metadata in the `backups` table:
- `file_key` - Unique Figma file identifier
- `project_name` - Name of the project containing the file
- `file_name` - Display name of the file
- `last_backup_date` - When the file was last successfully backed up
- `last_modified_date` - When the file was last modified in Figma
- `next_attempt_date` - When to retry a failed backup (72 hours after failure)

#### Selection Criteria
Files are selected for backup based on the following priority:

1. **Never backed up** - Files with `last_backup_date IS NULL` get highest priority
2. **Modified since last backup** - Files where `last_modified_date > last_backup_date`
3. **Retry failed downloads** - Files where `next_attempt_date <= current_time`
4. **Oldest backups first** - Among files with same priority, older `last_backup_date` comes first

#### Configuration
- **Backup limit**: Maximum 45 files per backup run (configurable via `MAX_FILES` in scripts)
- **Retry delay**: Failed downloads are retried after 72 hours
- **Automatic updates**: File metadata is updated from Figma API on each run

#### Workflow
1. Fetch latest file metadata from Figma API
2. Update database with current modification dates
3. Query database for files needing backup (sorted by priority)
4. Apply backup limit to selected files
5. Generate `files.json` with only selected files
6. Execute downloads using Playwright
7. Update backup dates for successful downloads
8. Schedule retry for failed downloads

### Starting the downloads

Once you have generated `files.json`, you can then run `npm run start` to start the downloads. The status of each download will be shown in the console.

Each file will be downloaded to your specified `DOWNLOAD_PATH` in a folder named with the project's name and ID. Each file will be saved as the file's name and ID (key). The folder structure will look something like this:

```
Project A (12345)/
├── File X (123).fig
└── File Y (456).fig
Project B (67890)/
└── File Z (789).fig
```

If you ran `get-team-files`, your `files.json` will also have references to the team ID(s) so projects will be placed in a folder named after the team ID. In which case, the folder structure will look something like this:

```
1029384756/
├── Project A (12345)/
│   ├── File X (123).fig
│   └── File Y (456).fig
└── Project B (67890)/
    └── File Z (789).fig
5647382910/
└── Project C (45678)/
    └── File W (012).fig
```

### Parallel downloads

Parallel downloads are disabled by default. To enable them, update the following properties in `playwright.config.ts`:

```ts
export default defineConfig({
  ...
  fullyParallel: true,
  workers: 3, // The maximum number of parallel downloads
  ...
});
```

> [!CAUTION]
> It is not advised to use parallel downloads as Figma has started to invoke anti-automation safe guards.

### Retrying failed downloads

If you encounter downloads that fail, you can attempt to re-run _only_ those failed downloads using the `npm run retry` command.

Note that downloads may fail due to any number of reasons, but typically it is due to reaching the Playwright timeout. You can increase this timeout by updating the `timeout` configuration in `playwright.config.ts`.

## Commands

The following commands are available via `npm run`:

| Command             | Description                                     |
| ------------------- | ----------------------------------------------- |
| `get-team-files`    | Generates `files.json` from Figma team ID(s) with intelligent backup selection |
| `get-project-files` | Generates `files.json` from Figma project ID(s) with intelligent backup selection |
| `start`             | Starts downloads                                |
| `retry`             | Retries failed downloads from last run          |
| `dry-run`           | Lists files that will be downloaded             |
| `report`            | Show an HTML report of the last run             |
| `run-backup`        | Automated backup workflow (generates files.json + downloads + rsync) |

At any time, you can press `ctrl+c` to stop a command.

### Database Management

The tool automatically creates and manages a SQLite database (`figma_backups.db`) to track backup status. You can inspect the database directly:

```bash
# View all files in backup queue
sqlite3 figma_backups.db "SELECT file_key, project_name, file_name, last_backup_date, last_modified_date, next_attempt_date FROM backups ORDER BY last_backup_date ASC;"

# View files needing backup
sqlite3 figma_backups.db "SELECT file_key, project_name, file_name FROM backups WHERE (last_modified_date > last_backup_date OR last_backup_date IS NULL) AND (next_attempt_date IS NULL OR next_attempt_date <= datetime('now'));"

# Reset failed downloads (remove retry delay)
sqlite3 figma_backups.db "UPDATE backups SET next_attempt_date = NULL WHERE next_attempt_date IS NOT NULL;"
```

### Monitoring Backup Progress

The tool provides detailed console output showing:
- Number of files fetched from Figma API
- Number of files found in database needing backup
- Number of files selected for current backup run
- Individual download status for each file
- Summary of successful/failed downloads

## Known issues

- Two-factor authentication is not supported (suggest temporarily disabling two-factor authentication)
- You must have editor access to a file in order to download it
- Some downloads may take a long time (large file size, slow internet connection, etc.) which can trigger the Playwright timeout and lead to a failed download (suggest increasing the `timeout` in `playwright.config.ts`)
- Figma will invoke anti-automation measures based off of how many files you download (suggest using a `WAIT_TIMEOUT` of at least `10000`)
