const fs = require('fs');
const path = require('path');
const text = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const lines = text.split(/\r?\n/);
const start = 1488;
const end = 1505;
for (let i = start; i <= end; i++) {
  console.log(`${i}: ${lines[i-1]}`);
}
