import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('public', 'icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
  // 1. 192x192 PNG
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.resolve('public', 'pwa-192x192.png'));
  console.log('Created pwa-192x192.png');

  // 2. 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.resolve('public', 'pwa-512x512.png'));
  console.log('Created pwa-512x512.png');

  // 3. Apple Touch Icon 180x180 PNG
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.resolve('public', 'apple-touch-icon.png'));
  console.log('Created apple-touch-icon.png');

  // 4. Maskable 512x512 with safe-zone padding (15% padding = 76px around icon scaled to 360x360)
  const innerIcon = await sharp(svgBuffer)
    .resize(360, 360)
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 79, g: 70, b: 229, alpha: 1 }, // Brand indigo #4f46e5
    },
  })
    .composite([{ input: innerIcon, top: 76, left: 76 }])
    .png()
    .toFile(path.resolve('public', 'pwa-maskable-512x512.png'));
  console.log('Created pwa-maskable-512x512.png');
}

generateIcons().catch(console.error);
