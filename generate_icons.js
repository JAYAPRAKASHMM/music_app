const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SVG_PATH = path.resolve(__dirname, 'client/assets/logo.svg');
const RES_DIR = path.resolve(__dirname, 'android/app/src/main/res');

const LAUNCHER_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const FOREGROUND_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

async function generateIcon(svgBuffer, outputPath, size) {
  await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outputPath);
  console.log(`  Created: ${outputPath} (${size}x${size})`);
}

async function generateForeground(svgBuffer, outputPath, canvasSize) {
  const iconSize = Math.round(canvasSize * 0.66);

  const resizedIcon = await sharp(svgBuffer)
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resizedIcon, gravity: 'centre' }])
    .png()
    .toFile(outputPath);
  console.log(`  Created: ${outputPath} (${canvasSize}x${canvasSize}, icon ${iconSize}x${iconSize})`);
}

(async () => {
  const svgBuffer = fs.readFileSync(SVG_PATH);

  console.log('Generating launcher icons (ic_launcher.png)...');
  for (const [dir, size] of Object.entries(LAUNCHER_SIZES)) {
    const outPath = path.join(RES_DIR, dir, 'ic_launcher.png');
    await generateIcon(svgBuffer, outPath, size);
  }

  console.log('\nGenerating round launcher icons (ic_launcher_round.png)...');
  for (const [dir, size] of Object.entries(LAUNCHER_SIZES)) {
    const outPath = path.join(RES_DIR, dir, 'ic_launcher_round.png');
    await generateIcon(svgBuffer, outPath, size);
  }

  console.log('\nGenerating foreground icons (ic_launcher_foreground.png)...');
  for (const [dir, size] of Object.entries(FOREGROUND_SIZES)) {
    const outPath = path.join(RES_DIR, dir, 'ic_launcher_foreground.png');
    await generateForeground(svgBuffer, outPath, size);
  }

  console.log('\nDone! All icons generated.');
})();
