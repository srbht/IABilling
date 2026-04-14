/**
 * Run `next build` once if there is no production output (fixes "production-start-no-build-id").
 * Skips when .next/BUILD_ID already exists (normal CI/Docker flow).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const buildId = path.join(root, '.next', 'BUILD_ID');

if (fs.existsSync(buildId)) {
  process.exit(0);
}

console.log('[frontend] No .next production build found — running next build (one-time)...\n');
execSync('npx next build', { stdio: 'inherit', cwd: root, env: process.env });
