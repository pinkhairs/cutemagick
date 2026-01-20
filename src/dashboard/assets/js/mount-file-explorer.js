document.body.addEventListener('htmx:afterSwap', (e) => {
  const mount = e.target.querySelector('[data-site-uuid]');
  if (!mount) return;
  
  if (mount.dataset.initialized === 'true') return;
  mount.dataset.initialized = 'true';
  
  const uuid = mount.dataset.siteUuid;
  
  new FileExplorer(mount, {
    initpath: [['/', '/', { canmodify: true }]],
    rename: true,
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
