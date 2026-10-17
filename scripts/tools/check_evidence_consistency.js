const { execSync } = require('child_process');
const path = require('path');

const pyScript = path.join(__dirname, 'check_evidence_consistency.py');
try {
  execSync(`python "${pyScript}"`, { stdio: 'inherit' });
} catch (err) {
  process.exit(1);
}
