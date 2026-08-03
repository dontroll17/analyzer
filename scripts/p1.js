const fs = require('fs');
const L = [];
L.push('const fs = require("fs");');
L.push('const lines = [];');
fs.writeFileSync('C:/analyzer/scripts/gen.js', L.join('\n'));