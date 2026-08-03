const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '..', 'tests', 'unit', 'audio');
fs.mkdirSync(dir, { recursive: true });

const content = fs.readFileSync(path.join(__dirname, 'audio-graph-body.txt'), 'utf8');
fs.writeFileSync(path.join(dir, 'offline-audio-graph.spec.js'), content);
console.log('Done');
