import fs from 'fs/promises';
import path from 'path';
import { assertRealPathInside } from './assertInsideRoot.js';

export async function listDirectory(rootDir, relPathParts = []) {
  const absPath = path.resolve(rootDir, ...relPathParts);
  assertRealPathInside(rootDir, absPath);

  const dirents = await fs.readdir(absPath, { withFileTypes: true });

  return Promise.all(
    dirents.map(async (dirent) => {
      const childRelParts = [...relPathParts, dirent.name];
      const id = childRelParts.join('/'); // stable, relative ID

      const childAbsPath = path.join(absPath, dirent.name);
      assertRealPathInside(rootDir, childAbsPath);

      if (dirent.isDirectory()) {
        return {
          id,
          name: dirent.name,
          type: 'folder',
          attrs: { canmodify: true }
        };
      }

      const stat = await fs.stat(childAbsPath);

      return {
        id,
        name: dirent.name,
        type: 'file',
        size: stat.size,
        attrs: { canmodify: true }
      };
    })
  );
}
