const fs = require('fs');
const path = require('path');

const filesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../files.json'), 'utf8'));

if (!Array.isArray(filesJson)) {
  throw new Error('files.json must be an array');
}

for (const project of filesJson) {
  if (!project.id || !Array.isArray(project.files)) {
    throw new Error('Invalid project structure in files.json');
  }
}

console.log('Test passed: files.json is valid'); 