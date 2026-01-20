import fs from 'fs/promises';
import path from 'path';

export async function listDirectory(baseDir, relPathParts = []) {
  const safeBaseDir = path.resolve(baseDir);
  const absPath = path.resolve(safeBaseDir, ...relPathParts);

  const dirents = await fs.readdir(absPath, { withFileTypes: true });

  return await Promise.all(
    dirents.map(async (dirent) => {
      const childRelParts = [...relPathParts, dirent.name];
      const id = childRelParts.join('/'); // 🔥 IMPORTANT

      if (dirent.isDirectory()) {
        return {
          id,                 // ← full relative path
          name: dirent.name,
          type: 'folder',
          attrs: { canmodify: true }
        };
      }

      const stat = await fs.stat(path.join(absPath, dirent.name));

      return {
        id,                 // ← full relative path
        name: dirent.name,
        type: 'file',
        size: stat.size,
        attrs: { canmodify: true }
      };
    })
  );
}

