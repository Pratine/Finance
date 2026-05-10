const fs = require('fs');
const path = require('path');

const ALL_FIXES = [
  { corrupt: String.fromCharCode(226, 156, 147), correct: '✓' },  // checkmark raw
  { corrupt: String.fromCharCode(226, 128, 166), correct: '…' },  // ellipsis raw
  { corrupt: String.fromCharCode(226, 128, 148), correct: '—' },  // em-dash raw
  { corrupt: String.fromCharCode(226, 128, 147), correct: '–' },  // en-dash raw
  { corrupt: String.fromCharCode(226, 128, 156), correct: '“' },  // left double quote raw
  { corrupt: String.fromCharCode(226, 128, 157), correct: '”' },  // right double quote raw
  { corrupt: String.fromCharCode(226, 150, 178), correct: '▲' },  // up triangle raw
  { corrupt: String.fromCharCode(226, 150, 188), correct: '▼' },  // down triangle raw
  { corrupt: String.fromCharCode(226, 8211, 178), correct: '▲' }, // up triangle win1252
  { corrupt: String.fromCharCode(226, 8211, 188), correct: '▼' }, // down triangle win1252
  { corrupt: String.fromCharCode(226, 156, 149), correct: '✕' },  // mult-x raw
];

let total = 0;
function fix(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory() && !['node_modules', 'dist', '.git'].some(x => f.name === x)) {
      fix(full);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(f.name)) continue;
    let c = fs.readFileSync(full, 'utf8');
    let changed = false;
    for (const p of ALL_FIXES) {
      if (c.includes(p.corrupt)) {
        const n = c.split(p.corrupt).length - 1;
        c = c.split(p.corrupt).join(p.correct);
        changed = true;
        console.log('Fixed', f.name, p.correct, 'x' + n);
      }
    }
    if (changed) { fs.writeFileSync(full, c, 'utf8'); total++; }
  }
}
fix('src');
fix('electron');
console.log('Total files:', total);
