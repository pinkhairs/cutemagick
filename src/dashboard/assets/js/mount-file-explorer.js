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
(function () {
  const _assign = window.location.assign;
  const _replace = window.location.replace;
  const _push = history.pushState;

  window.location.assign = function (...args) {
    console.trace('location.assign', args);
    return _assign.apply(this, args);
  };

  window.location.replace = function (...args) {
    console.trace('location.replace', args);
    return _replace.apply(this, args);
  };

  history.pushState = function (...args) {
    console.trace('history.pushState', args);
    return _push.apply(this, args);
  };
})();


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
  
  openCodeWindow(uuid, fullPath);
  
  return false;
},

    tools: {
      new_folder: true,
      new_file: true,

      delete: true,

      upload: true,
      download: true,
    },
	onrename: function(renamed, folder, entry, newname) {
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
    }
  });
});
