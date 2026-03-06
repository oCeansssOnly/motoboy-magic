const fs = require('fs');
const path = require('path');
const dir = 'C:/Users/Usuario/.gemini/antigravity/brain/5ff125cf-1660-4c79-9e08-5ac8d46ba107';
const dest = 'C:/Site Teste/motoboy-magic/src/assets';

if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

const files = fs.readdirSync(dir)
  .filter(f => f.startsWith('media__') && f.endsWith('.png'))
  .map(f => {
    const filePath = path.join(dir, f);
    return { name: f, time: fs.statSync(filePath).mtime.getTime(), size: fs.statSync(filePath).size };
  })
  .sort((a,b) => b.time - a.time)
  .slice(0,5);

files.forEach((f, i) => {
  const sourcePath = path.join(dir, f.name);
  const destPath = path.join(dest, `motoboy_pose_${i}_${f.size}.png`);
  fs.copyFileSync(sourcePath, destPath);
  console.log(`Copied ${f.name} (${f.size} bytes) to ${path.basename(destPath)}`);
});
