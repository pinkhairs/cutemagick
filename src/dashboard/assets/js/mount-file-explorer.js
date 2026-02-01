function isBinaryLikeFile(name) {
  if (!name.includes('.')) return false;
  const ext = name.split('.').pop().toLowerCase();
  return [
    'png','jpg','jpeg','gif','webp','bmp','ico','avif',
    'mp3','wav','ogg','flac','m4a','aac',
    'mp4','webm','mov','avi','mkv',
    'woff','woff2','ttf','otf',
    'zip','tar','gz','tgz','rar','7z',
    'pdf','exe','bin','dmg','dmg','iso',
    'db',
  ].includes(ext);
}

function openCodeWindow(siteUUID, path) {
  // Ensure path is always relative (no leading slash)
  const cleanPath = String(path).replace(/^\/+/, '');
  
  // Human-readable, stable window id
  const treatedPath = cleanPath
  .replace(/\//g, '-')
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-zA-Z0-9-]/g, '')
  .toLowerCase();
  
  const windowId = `editor-${siteUUID}-${treatedPath}`;
  
  // If already open, bring to front
  const existing = document.getElementById(windowId);
  if (existing) {
    DraggableWindows.bringToFront(existing);
    return;
  }
  
  const container = document.querySelector('#windows');
  if (!container || !window.htmx) return;
  
  // Encode path segments (not slashes)
  const encodedPath = cleanPath
  .split('/')
  .map(encodeURIComponent)
  .join('/');
  
  const url = `/editor/${siteUUID}/${encodedPath}`;
  
  const placeholder = document.createElement('div');
  placeholder.style.display = 'none';
  container.prepend(placeholder);
  
  window.htmx.ajax(
    'GET',
    url,
    {
      source: placeholder,
      target: '#windows',
      swap: 'afterbegin',
      headers: {
        'X-Window-Id': windowId
      }
    }
  );
}


/* -------------------------------------------------
Robust mount handler
-------------------------------------------------- */

function mountFileExplorers(root) {
  const mounts = [];
  
  // Case 1: root *is* the mount
  if (
    root.classList?.contains('file-explorer') &&
    root.dataset.siteId
  ) {
    mounts.push(root);
  }
  
  // Case 2: mount exists inside root
  root.querySelectorAll?.('.file-explorer[data-site-id]')
  .forEach(el => mounts.push(el));
  
  mounts.forEach(mount => {
    if (mount.dataset.initialized === 'true') return;
    mount.dataset.initialized = 'true';
    
    const siteId = mount.dataset.siteId;
    if (!siteId) {
      console.warn('[FileExplorer] Missing siteId', mount);
      return;
    }
    
    new FileExplorer(mount, {
      group: `site-${siteId}`, // 🔑 enable intra-site drag/drop
      initpath: [[ '', '', { canmodify: true } ]],
      rename: true,
      
      onopenfile(folder, entry) {
        const pathIDs = folder.GetPathIDs().filter(Boolean);
        const filename = entry.name || entry.id;
        const fullPath = pathIDs.length
        ? `${pathIDs.join('/')}/${filename}`
        : filename;
        
        if (isBinaryLikeFile(filename)) {
          window.location.href =
          `/fs/${siteId}/download?path=${encodeURIComponent(fullPath)}`;
          return false;
        }
        
        openCodeWindow(siteId, fullPath);
        return false;
      },
      
      tools: {
        new_folder: true,
        new_file: true,
        delete: true,
        upload: true,
        download: true
      },
      
      onrefresh(folder, required) {
        const explorer = this;
        const relPath = folder.GetPathIDs().filter(Boolean).join('/');
        
        const url = `/fs/${siteId}/list?path=${encodeURIComponent(relPath)}`;
        
        console.log('[FileExplorer:onrefresh] GET', url);
        
        const xhr = new explorer.PrepareXHR({
          method: 'GET',
          url,
          onsuccess(e) {
            const raw = e.target.responseText || e.target.response || '';
            folder.SetEntries(JSON.parse(raw));
          },
          onerror() {
            if (required) explorer.SetNamedStatusBarText('folder', 'Failed to load folder');
          }
        });
        
        xhr.Send();
      },
      
      
      
      onnewfolder(created, folder) {
        const parent = folder.GetPathIDs().slice(1).join('/');
        const name = prompt('New folder name:');
        if (!name) return created(false);
        if (name.includes(' ')) {
          alert('Folder names cannot contain spaces');
          return created(false);
        }
        
        csrfFetch(`/fs/${siteId}/folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: parent ? `${parent}/${name}` : name
          })
        })
        .then(() => {
          created({ id: name, name, type: 'folder' });
        })
        .catch(err => created(err.message));
      },
      
      onnewfile(created, folder) {
        const parent = folder.GetPathIDs().slice(1).join('/');
        const name = prompt('New file name:');
        if (!name) return created(false);
        if (name === '.env') {
          alert('Use the Secrets tab to manage environment variables');
          created(false);
        }
        
        csrfFetch(`/fs/${siteId}/file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: parent ? `${parent}/${name}` : name,
            content: ''
          })
        })
        .then(() => {
          created({ id: name, name, type: 'file' });
        })
        .catch(err => created(err.message));

        htmx.trigger(document.body, 'siteCommit', {
          siteId,
          
          source: 'new-file'
        });
      },
      
      
      onrename(renamed, folder, entry, newname) {
        const parent = folder.GetPathIDs().slice(1).join('/');
        const from = parent ? `${parent}/${entry.name}` : entry.name;
        const to = parent ? `${parent}/${newname}` : newname;
        
        renamed({ ...entry, id: newname, name: newname });
        
        csrfFetch(`/fs/${siteId}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to })
        })
        .catch(console.error);

        htmx.trigger(document.body, 'siteCommit', {
          siteId,
          
          source: 'rename'
        });
      },
      
      ondelete(deleted, folder, ids, entries) {
        if (!confirm('Delete selected items?')) return;
        
        const parent = folder.GetPathIDs().slice(1).join('/');
        const paths = entries.map(e =>
          parent ? `${parent}/${e.name}` : e.name
        );
        
        Promise.all(
          paths.map(p =>
            csrfFetch(`/fs/${siteId}/delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: p })
            })
          )
        )
        .then(() => {
          htmx.trigger(document.body, 'siteCommit', {
            siteId,
            source: 'delete'
          });
          deleted(true);
        })
        .catch(console.error);
      },
      
      oninitdownload(startdownload, folder, ids, entries) {
        const siteId = mount.dataset.siteId;
        const parentPath = folder.GetPathIDs().slice(1).join('/');
        
        // single file
        if (ids.length === 1 && entries[0].type === 'file') {
          const filePath = parentPath
          ? `${parentPath}/${entries[0].name}`
          : entries[0].name;
          
          window.open(
            `/fs/${siteId}/download?path=${encodeURIComponent(filePath)}`,
            '_blank'
          );
          
          return;
        }
        
        // multiple → zip
        const paths = entries.map(e =>
          parentPath ? `${parentPath}/${e.name}` : e.name
        );
        
        const query = paths
        .map(p => `paths=${encodeURIComponent(p)}`)
        .join('&');
        
        window.open(
          `/fs/${siteId}/download-zip?${query}`,
          '_blank'
        );
      },
      
      oninitupload(startupload, fileinfo) {
        console.log('[upload:init]', fileinfo);
        
        // Allow directory drops
        if (fileinfo.type === 'dir') {
          // Let FileExplorer descend into it
          return startupload(true);
        }
        
        const basePath = fileinfo.folder.GetPathIDs().slice(1).join('/');
        
        // Preserve folder structure if present
        const rel =
        fileinfo.file?.webkitRelativePath
        ? fileinfo.file.webkitRelativePath
        : fileinfo.name;
        
        const fullPath = basePath
        ? `${basePath}/${rel}`
        : rel;
        
        fileinfo.url = `/fs/${siteId}/upload`;
        fileinfo.fileparam = 'file';
        fileinfo.params = {
          path: fullPath
        };
        
        console.log('[upload:file]', { fullPath });
        
        startupload(true);
      },
      
      
      onfinishedupload(finalize, fileinfo) {
        htmx.trigger(document.body, 'siteCommit', {
          siteId,
          
          source: 'upload'
        });
        finalize(true);
      },
      
    });
  });
}

/* -------------------------------------------------
HTMX hook
-------------------------------------------------- */

document.body.addEventListener('htmx:afterSwap', (e) => {
  mountFileExplorers(e.target);
});