import fs from 'fs';
import path from 'path';

export function assertRealPathInside(root, target) {
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.realpathSync(target);

  const rel = path.relative(realRoot, realTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes root');
  }
}
