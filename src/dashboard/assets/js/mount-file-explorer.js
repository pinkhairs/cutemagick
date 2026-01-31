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
        const relPath = folder.GetPathIDs().filter(Boolean).join('/');
        
        const xhr = new this.PrepareXHR({
          method: 'GET',
          url: `/fs/${siteId}/list`,
          params: { path: relPath },
          onsuccess(e) {
            folder.SetEntries(JSON.parse(e.target.response));
          },
          onerror() {
            if (required) {
              this.SetNamedStatusBarText(
                'folder',
                'Failed to load folder'
              );
            }
          }
        });
        
        xhr.Send();
      },
      
      onnewfolder(created, folder) {
        const parent = folder.GetPathIDs().slice(1).join('/');
        const name = prompt('New folder name:');
        if (!name) return created(false);
        
        fetch(`/fs/${siteId}/folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: parent ? `${parent}/${name}` : name
          })
        })
        .then(() => {
          created({ id: name, name, type: 'folder' });
          htmx.trigger(document.body, 'commitsChanged');
        })
        .catch(err => created(err.message));
      },
      
      onnewfile(created, folder) {
        const parent = folder.GetPathIDs().slice(1).join('/');
        const name = prompt('New file name:');
        if (!name) return created(false);
        
        fetch(`/fs/${siteId}/file`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: parent ? `${parent}/${name}` : name,
            content: ''
          })
        })
        .then(() => {
          created({ id: name, name, type: 'file' });
          htmx.trigger(document.body, 'commitsChanged');
        })
        .catch(err => created(err.message));
      },
      
      onrename(renamed, folder, entry, newname) {
        const parent = folder.GetPathIDs().slice(1).join('/');
        const from = parent ? `${parent}/${entry.name}` : entry.name;
        const to = parent ? `${parent}/${newname}` : newname;
        
        renamed({ ...entry, id: newname, name: newname });
        
        fetch(`/fs/${siteId}/rename`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to })
        })
        .then(() => htmx.trigger(document.body, 'commitsChanged'))
        .catch(console.error);
      },
      
      ondelete(deleted, folder, ids, entries) {
        if (!confirm('Delete selected items?')) return;
        
        const parent = folder.GetPathIDs().slice(1).join('/');
        const paths = entries.map(e =>
          parent ? `${parent}/${e.name}` : e.name
        );
        
        Promise.all(
          paths.map(p =>
            fetch(`/fs/${siteId}/delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: p })
            })
          )
        )
        .then(() => {
          deleted(true);
          htmx.trigger(document.body, 'commitsChanged');
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
        console.log({startupload, fileinfo});
        if (fileinfo.type === 'dir') return startupload(false);
        
        fileinfo.url = `/fs/${siteId}/upload`;
        fileinfo.fileparam = 'file';
        fileinfo.params = {
          path: fileinfo.folder.GetPathIDs().slice(1).join('/')
        };
        
        startupload(true);
      },
      
      onfinishedupload(finalize, fileinfo) {
        console.log({finalize, fileinfo});
        htmx.trigger(document.body, 'commitsChanged');
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