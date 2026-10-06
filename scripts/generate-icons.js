import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const iconsDir = path.join(rootDir, 'public', 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

const sizes = [1024, 512, 128, 48, 16];

for (const size of sizes) {
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${size}px;
      height: ${size}px;
      background: transparent;
      overflow: hidden;
    }
    svg {
      width: ${size}px;
      height: ${size}px;
      display: block;
    }
  </style>
</head>
<body>
  ${svgContent}
</body>
</html>`;

  const tempHtml = path.join(iconsDir, `temp_${size}.html`);
  const outPng = path.join(iconsDir, size === 1024 ? 'icon1024.png' : size === 512 ? 'icon512.png' : `icon${size}.png`);
  
  fs.writeFileSync(tempHtml, htmlContent, 'utf8');

  try {
    execSync(
      `google-chrome --headless --disable-gpu --no-sandbox --hide-scrollbars --window-size=${size},${size} --default-background-color=00000000 --screenshot="${outPng}" "file://${tempHtml}"`,
      { stdio: 'pipe' }
    );
    console.log(`Generated: ${outPng} (${size}x${size})`);
  } finally {
    if (fs.existsSync(tempHtml)) {
      fs.unlinkSync(tempHtml);
    }
  }
}
console.log('All icons generated successfully!');
