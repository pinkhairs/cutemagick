// Upload file persistence via symlinks
import fs from 'fs';
import path from 'path';
import { SITES_ROOT, UPLOADS_ROOT } from '../../config/index.js';
import log from '../logs/index.js';

/**
 * Ensure uploads directory symlink exists in site working directory
 * @param {string} site - Site slug/directory name
 */
export function ensureUploadsSymlink(site) {
  const siteDir = path.join(SITES_ROOT, site);
  const uploadsDir = path.join(UPLOADS_ROOT, site);
  const uploadsSymlink = path.join(siteDir, 'uploads');

  try {
    // Ensure uploads directory exists
    fs.mkdirSync(uploadsDir, { recursive: true });

    // Check if symlink already exists
    if (fs.existsSync(uploadsSymlink)) {
      const stats = fs.lstatSync(uploadsSymlink);
      if (stats.isSymbolicLink()) {
        const existing = fs.readlinkSync(uploadsSymlink);
        if (existing === uploadsDir) {
          return; // Already correct
        }
        // Remove incorrect symlink
        fs.unlinkSync(uploadsSymlink);
      } else {
        // Real directory exists - don't touch it (user may have files there)
        log.warn('[uploadPersistence:ensureUploadsSymlink]', {
          site,
          message: 'Real uploads directory exists, not replacing with symlink'
        });
        return;
      }
    }

    // Create symlink
    fs.symlinkSync(uploadsDir, uploadsSymlink);
    log.info('[uploadPersistence:ensureUploadsSymlink]', {
      site,
      source: uploadsDir,
      target: uploadsSymlink
    });
  } catch (err) {
    log.error('[uploadPersistence:ensureUploadsSymlink]', {
      site,
      error: err.message
    });
  }
}

// Patterns for upload files to persist
// This covers common user-generated content types
export const UPLOAD_FILE_PATTERNS = [
  // Images
  /\.jpg$/i,
  /\.jpeg$/i,
  /\.png$/i,
  /\.gif$/i,
  /\.webp$/i,
  /\.svg$/i,
  /\.bmp$/i,
  /\.ico$/i,
  /\.tiff?$/i,
  // Videos
  /\.mp4$/i,
  /\.webm$/i,
  /\.mov$/i,
  /\.avi$/i,
  /\.mkv$/i,
  /\.flv$/i,
  /\.m4v$/i,
  // Audio
  /\.mp3$/i,
  /\.wav$/i,
  /\.ogg$/i,
  /\.m4a$/i,
  /\.flac$/i,
  /\.aac$/i,
  // Documents
  /\.pdf$/i,
  /\.doc$/i,
  /\.docx$/i,
  /\.txt$/i,
  /\.rtf$/i,
  /\.odt$/i,
  // Archives
  /\.zip$/i,
  /\.tar$/i,
  /\.gz$/i,
  /\.7z$/i,
  /\.rar$/i,
  // Other common uploads
  /\.csv$/i,
  /\.json$/i,
  /\.xml$/i,
];

/**
 * Check if a filename matches upload file patterns
 */
export function isUploadFile(filename) {
  return UPLOAD_FILE_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Recursively find all upload files in a directory
 */
export function findUploadFiles(dir, baseDir = dir) {
  const results = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip .git and node_modules
      if (entry.name === '.git' || entry.name === 'node_modules') {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(...findUploadFiles(fullPath, baseDir));
      } else if (entry.isFile() && isUploadFile(entry.name)) {
        const relativePath = path.relative(baseDir, fullPath);
        results.push(relativePath);
      }
    }
  } catch (err) {
    // Directory may not exist or be readable
    log.debug('[uploadPersistence:findUploadFiles]', {
      dir,
      error: err.message
    });
  }

  return results;
}

/**
 * Create symlinks in render/working directory for all upload files in uploads directory
 * @param {string} site - Site slug/directory name
 * @param {string} targetDir - Full path to render or working directory
 */
export function symlinkUploadFiles({ site, targetDir }) {
  const uploadsDir = path.join(UPLOADS_ROOT, site);

  // Ensure uploads directory exists
  fs.mkdirSync(uploadsDir, { recursive: true });

  const uploadFiles = findUploadFiles(uploadsDir);

  for (const relativePath of uploadFiles) {
    const sourcePath = path.join(uploadsDir, relativePath);
    const targetPath = path.join(targetDir, 'uploads', relativePath);

    // Ensure parent directory exists in target
    const targetParent = path.dirname(targetPath);
    if (!fs.existsSync(targetParent)) {
      fs.mkdirSync(targetParent, { recursive: true });
    }

    // Skip if symlink already exists and points to correct location
    try {
      if (fs.existsSync(targetPath)) {
        const stats = fs.lstatSync(targetPath);
        if (stats.isSymbolicLink()) {
          const existing = fs.readlinkSync(targetPath);
          if (existing === sourcePath) {
            continue; // Already correct
          }
          // Remove incorrect symlink
          fs.unlinkSync(targetPath);
        } else {
          // Real file exists (e.g., from git worktree materialization)
          // Remove it - uploads directory is source of truth
          log.info('[uploadPersistence:symlinkUploadFiles]', {
            site,
            relativePath,
            message: 'Removing target file (uploads directory is source of truth)'
          });
          fs.unlinkSync(targetPath);
        }
      }

      // Create symlink
      fs.symlinkSync(sourcePath, targetPath);
      log.debug('[uploadPersistence:symlinkUploadFiles]', {
        site,
        relativePath,
        source: sourcePath,
        target: targetPath
      });
    } catch (err) {
      log.error('[uploadPersistence:symlinkUploadFiles]', {
        site,
        relativePath,
        error: err.message
      });
    }
  }
}

/**
 * Post-execution: Move any new upload files from render/working to uploads directory
 * and replace with symlinks
 * @param {string} site - Site slug/directory name
 * @param {string} sourceDir - Full path to render or working directory
 */
export function persistNewUploadFiles({ site, sourceDir }) {
  const uploadsDir = path.join(UPLOADS_ROOT, site);
  const uploadsSourceDir = path.join(sourceDir, 'uploads');

  if (!fs.existsSync(uploadsSourceDir)) {
    return;
  }

  // Ensure uploads directory exists
  fs.mkdirSync(uploadsDir, { recursive: true });

  const sourceUploadFiles = findUploadFiles(uploadsSourceDir);

  for (const relativePath of sourceUploadFiles) {
    const sourcePath = path.join(uploadsSourceDir, relativePath);
    const uploadsPath = path.join(uploadsDir, relativePath);

    try {
      const stats = fs.lstatSync(sourcePath);

      // If it's already a symlink, nothing to do
      if (stats.isSymbolicLink()) {
        continue;
      }

      // It's a real file - this is a new upload created during execution
      log.info('[uploadPersistence:persistNewUploadFiles]', {
        site,
        relativePath,
        message: 'Moving new upload file to uploads directory'
      });

      // Ensure parent directory exists in uploads directory
      const uploadsParent = path.dirname(uploadsPath);
      if (!fs.existsSync(uploadsParent)) {
        fs.mkdirSync(uploadsParent, { recursive: true });
      }

      // If file exists in uploads directory, remove it first (overwrite with new version)
      if (fs.existsSync(uploadsPath)) {
        fs.unlinkSync(uploadsPath);
      }

      // Move file to uploads directory
      fs.renameSync(sourcePath, uploadsPath);

      // Create symlink in source directory
      fs.symlinkSync(uploadsPath, sourcePath);

      log.info('[uploadPersistence:persistNewUploadFiles]', {
        site,
        relativePath,
        moved: true
      });
    } catch (err) {
      log.error('[uploadPersistence:persistNewUploadFiles]', {
        site,
        relativePath,
        error: err.message
      });
    }
  }
}
