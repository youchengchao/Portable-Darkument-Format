const fs = require('fs');
const path = require('path');
const https = require('https');

const PDFJS_VERSION = '3.11.174';
const BASE_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/`;

const filesToDownload = [
  { url: BASE_URL + 'pdf.js', dest: 'pdfjs/pdf.js' },
  { url: BASE_URL + 'pdf.worker.js', dest: 'pdfjs/pdf.worker.js' }
];

const targetDir = path.join(__dirname, 'pdfjs');
const iconsDir = path.join(__dirname, 'icons');

// Create directories if they don't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} -> ${destPath}...`);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP Status ${response.statusCode}`));
        return;
      }
      
      const fileStream = fs.createWriteStream(destPath);
      response.pipe(fileStream);
      
      fileStream.on('finish', () => {
        fileStream.close();
        console.log(`Successfully saved ${destPath}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {}); // Delete local temp file
      reject(err);
    });
  });
}

// Generate basic placeholder icons if they don't exist
function generateIcons() {
  const iconSizes = [16, 48, 128];
  
  // A simple dark themed SVG icon to render onto a canvas and save, or we can just write SVG strings,
  // but wait: Chrome extension needs PNG icons!
  // Since we don't have canvas or canvas-to-png easily in pure Node.js without dependencies (like node-canvas),
  // we can download a public domain icon, or we can write a tiny script to save a basic PNG,
  // or we can download standard icons.
  // Wait, let's search if there's a simple way to create PNG icons in pure Node.
  // Actually, we can download a simple sample icon from a URL!
  // Let's download a free PNG icon, or create simple ones.
  // Let's see: we can download a PDF-like dark icon.
  // Let's just download a basic PDF icon.
  const iconUrl = 'https://raw.githubusercontent.com/diwash007/PDF-Dark-Mode/main/icons/icon128.png'; // safe open source file
  
  downloadFile(iconUrl, path.join(iconsDir, 'icon128.png'))
    .then(() => {
      // Copy to size 48 and 16
      fs.copyFileSync(path.join(iconsDir, 'icon128.png'), path.join(iconsDir, 'icon48.png'));
      fs.copyFileSync(path.join(iconsDir, 'icon128.png'), path.join(iconsDir, 'icon16.png'));
      console.log('Icons generated successfully.');
    })
    .catch((err) => {
      console.error('Error downloading icon:', err.message);
    });
}

async function run() {
  try {
    for (const file of filesToDownload) {
      const destPath = path.join(__dirname, file.dest);
      await downloadFile(file.url, destPath);
    }
    console.log('PDF.js files set up successfully!');
    generateIcons();
  } catch (err) {
    console.error('Setup failed:', err.message);
    process.exit(1);
  }
}

run();
