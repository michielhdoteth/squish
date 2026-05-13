import fs from 'node:fs';
import path from 'node:path';

export function copyPluginFiles(sourceDir, targetDir, files) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);
    if (!fs.existsSync(sourcePath)) continue;

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}
