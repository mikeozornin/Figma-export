const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, '../figma_backups.db'));

// Add at the top of the file with other constants
const DEFAULT_BACKUP_LIMIT = 1;

// Initialize database
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS backups (
    file_key           TEXT PRIMARY KEY,
    project_name       TEXT,
    file_name          TEXT,
    last_backup_date   TEXT,
    last_modified_date TEXT,
    next_attempt_date  TEXT
  )`);
});

async function getFilesToBackup() {
  const utcNow = new Date().toISOString();
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT file_key, last_modified_date
      FROM backups 
      WHERE (last_modified_date > last_backup_date OR last_backup_date IS NULL)
        AND (next_attempt_date IS NULL OR next_attempt_date <= ?)
      ORDER BY 
        CASE 
          WHEN last_backup_date IS NULL THEN 0
          ELSE 1
        END,
        last_backup_date ASC
    `, [utcNow], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function updateBackupInfo(fileKey, lastModifiedDate, projectName, fileName) {
  // Normalize date format to remove milliseconds for consistency
  let normalizedDate = lastModifiedDate;
  if (lastModifiedDate && lastModifiedDate.includes('.')) {
    // Remove milliseconds if present
    normalizedDate = lastModifiedDate.split('.')[0] + 'Z';
  }
  
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO backups (file_key, last_modified_date, project_name, file_name)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(file_key) DO UPDATE SET
        last_modified_date = ?,
        project_name = ?,
        file_name = ?
    `, [fileKey, normalizedDate, projectName, fileName, normalizedDate, projectName, fileName], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function recordBackupFailure(fileKey) {
  const nextAttemptDate = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // +72 часа в UTC
  
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE backups 
      SET next_attempt_date = ?
      WHERE file_key = ?
    `, [nextAttemptDate, fileKey], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function updateBackupDate(fileKey) {
  const utcNow = new Date().toISOString();
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE backups 
      SET last_backup_date = ?,
          next_attempt_date = NULL
      WHERE file_key = ?
    `, [utcNow, fileKey], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function close() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

module.exports = {
  getFilesToBackup,
  updateBackupInfo,
  updateBackupDate,
  recordBackupFailure,
  close
}; 