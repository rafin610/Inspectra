import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const zipFile = path.join(rootDir, 'inspectra-release.zip');

console.log('--- Inspectra Chrome Web Store Release Packager ---');

// 1. Verify dist exists and has manifest.json
const manifestPath = path.join(distDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Error: dist/manifest.json not found! Run npm run build first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// 2. Validate Manifest V3 properties
console.log('Validating Manifest V3 configuration...');
if (manifest.manifest_version !== 3) {
  console.error('Error: manifest_version must be 3.');
  process.exit(1);
}
if (!manifest.name || !manifest.version || !manifest.description) {
  console.error('Error: manifest missing name, version, or description.');
  process.exit(1);
}
if (manifest.host_permissions && manifest.host_permissions.includes('<all_urls>')) {
  console.error('Error: <all_urls> is not allowed for store release.');
  process.exit(1);
}
if (manifest.permissions && manifest.permissions.includes('tabs')) {
  console.error('Error: unnecessary tabs permission should not be included.');
  process.exit(1);
}

// 3. Check icon files
for (const size of ['16', '48', '128']) {
  const iconRel = manifest.icons?.[size];
  if (!iconRel || !fs.existsSync(path.join(distDir, iconRel))) {
    console.error(`Error: Missing icon${size} in dist (${iconRel})`);
    process.exit(1);
  }
}

// 4. Check background service worker
if (manifest.background?.service_worker) {
  const swPath = path.join(distDir, manifest.background.service_worker);
  if (!fs.existsSync(swPath)) {
    console.error(`Error: Background service worker not found at ${swPath}`);
    process.exit(1);
  }
}

// 5. Check content scripts
if (manifest.content_scripts) {
  for (const cs of manifest.content_scripts) {
    for (const js of cs.js ?? []) {
      const csPath = path.join(distDir, js);
      if (!fs.existsSync(csPath)) {
        console.error(`Error: Content script not found at ${csPath}`);
        process.exit(1);
      }
    }
  }
}

console.log('Manifest and bundle validation passed.');

// 6. Remove existing zip if any
if (fs.existsSync(zipFile)) {
  fs.unlinkSync(zipFile);
}

// 7. Create ZIP archive with manifest.json at ROOT
console.log('Creating production ZIP archive (inspectra-release.zip)...');
execSync(`cd "${distDir}" && zip -r "${zipFile}" . -x "*.DS_Store" -x "__MACOSX/*" -x "*.map"`, {
  stdio: 'inherit',
});

// 8. Verify ZIP archive structure
console.log('Verifying ZIP archive structure...');
const zipListing = execSync(`unzip -l "${zipFile}"`, { encoding: 'utf8' });
console.log(zipListing);

if (!zipListing.includes(' manifest.json\n') && !zipListing.includes(' manifest.json\r')) {
  console.error('CRITICAL: manifest.json is NOT at the root of the ZIP file!');
  process.exit(1);
}

const zipStat = fs.statSync(zipFile);
console.log(`✓ SUCCESS: inspectra-release.zip successfully created (${(zipStat.size / 1024).toFixed(1)} KB).`);
console.log('✓ Ready for Chrome Web Store Developer Dashboard upload.');
