function isTextLikeFile(name) {
  // no extension → treat as text
  if (!name.includes('.')) return true;

  const ext = name.split('.').pop().toLowerCase();

  const TEXT_EXTS = [
    'txt', 'md', 'markdown',
    'js', 'ts', 'jsx', 'tsx',
    'json', 'yaml', 'yml',
    'html', 'htm', 'css',
    'php', 'py', 'go', 'rb',
    'sh', 'bash',
    'env', 'ini', 'conf',
    'sql', 'toml',
    'xml', 'svg'
  ];

  return TEXT_EXTS.includes(ext);
}

function isBinaryLikeFile(name) {
  if (!name.includes('.')) return false;

  const ext = name.split('.').pop().toLowerCase();

  const BINARY_EXTS = [
    // images
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif',

    // audio
    'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac',

    // video
    'mp4', 'webm', 'mov', 'avi', 'mkv',

    // fonts
    'woff', 'woff2', 'ttf', 'otf',

    // archives
    'zip', 'tar', 'gz', 'tgz', 'rar', '7z',

    // binaries / misc
    'pdf', 'exe', 'bin', 'dmg', 'iso'
  ];

  return BINARY_EXTS.includes(ext);
}
function openBinaryFile(siteId, path) {
  const params = new URLSearchParams({
    path
  });

  fetch(`/files/${siteId}/open?${params.toString()}`)
    .then(async res => {
      if (!res.ok) throw new Error('Failed to resolve file URL');
      return res.json();
    })
    .then(({ url }) => {
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
    })
    .catch(err => {
      console.error('[openBinaryFile] failed:', err);
    });
}


function openCodeWindow(siteUUID, path) {
  // Create human-readable ID to match server
  const treatedPath = path
    .replace(/\//g, '-')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();
  
  const windowId = `${siteUUID}-${treatedPath}`;

  if (document.getElementById(windowId)) {
    DraggableWindows.bringToFront(document.getElementById(windowId));
    return;
  }

  const container = document.querySelector('#windows');
  if (!container || !window.htmx) {
    return;
  }

  const placeholder = document.createElement('div');
  placeholder.style.display = 'none';
  container.prepend(placeholder);

  const url = `/sites/${siteUUID}/editor`;

  window.htmx.ajax(
    'POST',
    url,
    {
      source: placeholder,
      target: '#windows',
      swap: 'afterbegin',
      values: { path: path },
      headers: {
        'X-Window-Id': windowId
      }
    }
  );
}


document.body.addEventListener('htmx:afterSwap', (e) => {
  const newWindow = e.detail.target.querySelector('.window-wrapper:first-child');

  const mount = e.target.querySelector('.file-explorer[data-site-uuid]');
  if (!mount) return;
  
  if (mount.dataset.initialized === 'true') return;
  mount.dataset.initialized = 'true';
  
  const uuid = mount.dataset.siteUuid;
  
  new FileExplorer(mount, {
    initpath: [['/', '/', { canmodify: true }]],
    rename: true,
    onopenfile(folder, entry) {
      // Get the parent folder's path
      const pathIDs = folder.GetPathIDs();
      
      const relPathIDs = pathIDs.filter(p => p && p !== '/');
      
      // Add the file name from entry to construct the full file path
      const filename = entry.name || entry.id;
        // Construct full path: folder path + filename
      const fullPath = relPathIDs.length > 0 
        ? `${relPathIDs.join('/')}/${filename}`
        : filename;

      if (isTextLikeFile(filename)) {
        openCodeWindow(uuid, fullPath);
      } else {
        openBinaryFile(uuid, fullPath);
      }
      
      return false;
    },

    tools: {
      new_folder: true,
      new_file: true,
      delete: true,
      upload: true,
      download: true,
    },
    
    onrefresh(folder, required) {
      const fe = this;
      
      // 🔑 THIS is the only supported path source
      const relPathIDs = folder.GetPathIDs().filter(Boolean);
      
      // Root → []
      // new! → ["new!"]
      // new!/images → ["new!", "images"]
      
      const relPath = relPathIDs.join('/');
      
      const xhr = new fe.PrepareXHR({
        url: `/sites/${uuid}/files/list`,
        params: { path: relPath },
        
        onsuccess(e) {
          const entries = JSON.parse(e.target.response);
          folder.SetEntries(entries);
        },
        
        onerror() {
          if (required) {
            fe.SetNamedStatusBarText(
              'folder',
              'Server error while loading folder'
            );
          }
        }
      });
      
      xhr.Send();
    },
onnewfolder: function(created, folder) {
  const siteId = mount.dataset.siteUuid;
  const parentPath = folder.GetPathIDs().slice(1).join('/');

  const name = prompt('New folder name:');
  if (!name) {
    created(false); // user cancelled
    return;
  }

  fetch(`/files/${siteId}/new-folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      parentPath
    })
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error);

      created({
        id: data.folder.name,
        name: data.folder.name,
        type: 'folder'
      });
    })
    .catch(err => {
      created(err.message || 'Server error');
    });
},
onnewfile: function(created, folder) {
  const siteId = mount.dataset.siteUuid;
  const parentPath = folder.GetPathIDs().slice(1).join('/');

  const name = prompt('New file name:');
  if (!name) {
    created(false);
    return;
  }

  fetch(`/files/${siteId}/new-file`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      parentPath,
      content: ''
    })
  })
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error);

      created({
        id: data.file.name,
        name: data.file.name,
        type: 'file'
      });
    })
    .catch(err => {
      created(err.message || 'Server error');
    });
},
    onrename: function(renamed, folder, entry, newname) {
      const siteId = mount.dataset.siteUuid;
      const parentPath = folder.GetPathIDs().slice(1).join('/');
      const oldPath = parentPath ? `${parentPath}/${entry.id}` : entry.id;
      
      const xhr = new this.PrepareXHR({
        url: `/files/${siteId}/rename`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        params: {
          oldPath: oldPath,
          newName: newname
        },
        onsuccess: function(e) {
          const data = JSON.parse(e.target.response);
          
          if (data.success) {
            entry.id = newname;
            entry.name = newname;
            renamed(entry);
          } else {
            renamed(data.error || 'Failed to rename');
          }
        },
        onerror: function(e) {
          renamed('Server error');
        }
      });
      
      xhr.Send();
    },

    ondelete: function(deleted, folder, ids, entries, recycle) {
      const siteId = mount.dataset.siteUuid;
      const parentPath = folder.GetPathIDs().slice(1).join('/');
      
      let completed = 0;
      let hasError = false;
      
      ids.forEach(id => {
        const filePath = parentPath ? `${parentPath}/${id}` : id;
        
        const xhr = new this.PrepareXHR({
          url: `/files/${siteId}/delete`,
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          params: {
            filePath: filePath
          },
          onsuccess: function(e) {
            completed++;
            const data = JSON.parse(e.target.response);
            
            if (!data.success) hasError = true;
            
            if (completed === ids.length) {
              deleted(!hasError);
            }
          },
          onerror: function(e) {
            completed++;
            hasError = true;
            
            if (completed === ids.length) {
              deleted(false);
            }
          }
        });
        
        xhr.Send();
      });
    },
oninitupload: function(startupload, fileinfo) {
  if (fileinfo.type === 'dir') {
    startupload(false);
    return;
  }

  fileinfo.url = `/files/${mount.dataset.siteUuid}/upload`;
  fileinfo.fileparam = 'file';

  fileinfo.params = {
    // send path info so backend knows where to write
    path: JSON.stringify(fileinfo.folder.GetPathIDs())
  };

  startupload(true);
},

onfinishedupload: function(finalize, fileinfo) {
  finalize(true);

  // optional but recommended
  fileinfo.folder.Refresh(true);
},


    onfinishedupload: function(finalize, fileinfo) {
      finalize(true, {
        id: fileinfo.name,
        name: fileinfo.name,
        type: 'file',
        size: fileinfo.size
      });
    },

    onuploaderror: function(fileinfo, e) {
    },

    oninitdownload: function(startdownload, folder, ids, entries) {
      const siteId = mount.dataset.siteUuid;
      
      if (ids.length === 1 && entries[0].type === 'file') {
        const parentPath = folder.GetPathIDs().slice(1).join('/');
        const filePath = parentPath ? `${parentPath}/${ids[0]}` : ids[0];
        
        startdownload({
          url: `/files/${siteId}/download`,
          params: {
            filePath: filePath
          }
        });
      } else {
        startdownload('Downloading multiple files/folders not yet implemented');
      }
    },

    ondownloadstarted: function(options) {
    },

    ondownloaderror: function(options) {
    }
  });
});