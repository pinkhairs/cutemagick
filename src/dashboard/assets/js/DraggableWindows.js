(function() {
  if (window.DraggableWindows) return;
  
  
  const DraggableWindows = {
    isDragging: false,
    currentWindow: null,
    offset: { x: 0, y: 0 },
    zCounter: 100,
    isLargeScreen: false,
    getOpenWindows() {
      try {
        return JSON.parse(localStorage.getItem('open-site-windows')) || [];
      } catch {
        return [];
      }
    },


    addOpenWindow(uuid) {
      const open = this.getOpenWindows();
      if (!open.includes(uuid)) {
        open.push(uuid);
        localStorage.setItem('open-site-windows', JSON.stringify(open));
      }
    },
    
    removeOpenWindow(uuid) {
      const open = this.getOpenWindows().filter(id => id !== uuid);
      localStorage.setItem('open-site-windows', JSON.stringify(open));
    },
    
    init() {
      this.checkScreenSize();
      this.restoreOpenWindows();
      this.initAllWindows();
      this.setupControls();
      this.observeNewWindows();
      this.setupDeleteListener();
      
      window.addEventListener('resize', () => {
        this.checkScreenSize();
        this.updateAllWindows();
      });
    },
    
    checkScreenSize() {
      this.isLargeScreen = window.innerWidth >= 1024;
    },
    
    updateAllWindows() {
      document.querySelectorAll('.window-wrapper').forEach(win => {
        if (this.isLargeScreen) {
          if (!win.style.left) {
            const offset = Array.from(document.querySelectorAll('.window-wrapper')).indexOf(win) * 20;
            win.style.left = offset + 'px';
            win.style.top = offset + 'px';
          }
          win.style.position = 'fixed';
        } else {
          win.style.position = '';
        }
      });
    },
    
loadZ(id, kind) {
  try {
    const z = localStorage.getItem(this.key('win-z', id));
    return z ? Number(z) : null;
  } catch {
    return null;
  }
},

saveZ(id, z, kind) {
  try {
    localStorage.setItem(this.key('win-z', id, kind), String(z));
  } catch {}
},
setupDeleteListener() {
  document.body.addEventListener('htmx:trigger', (event) => {
    // HTMX triggers come through the htmx:trigger event
    // The actual trigger name and data are in event.detail
    if (event.detail['files:deleted']) {
      const { hashedPaths } = event.detail['files:deleted'];
      
      if (!hashedPaths || !Array.isArray(hashedPaths)) return;
      
      hashedPaths.forEach(windowId => {
        const windowEl = document.getElementById(windowId);
        if (windowEl) {
          this.closeWindow(windowEl);
        }
      });
    }
  });
},
initWindow(windowEl) {
  if (windowEl.dataset.draggableInit) return;
  windowEl.dataset.draggableInit = 'true';
  const kind = this.getWindowKind(windowEl);
if (!kind) return;

const uuid = windowEl.id;

  // Track open windows (separate lists)
  if (kind === 'folder') {
    this.addOpenWindow(uuid);
  }

// Save file path separately for file windows
if (kind === 'file') {
  const siteUUID =
    windowEl.dataset.siteUuid ||
    windowEl.closest('[data-site-uuid]')?.dataset.siteUuid ||
    null;

  const filePath =
    windowEl.dataset.path ||
    windowEl.querySelector('[data-file-path]')?.dataset.filePath ||
    null;

  if (!siteUUID || !filePath) {
    console.warn('[windows] file window missing site or path, not stored', {
      siteUUID,
      filePath,
      windowEl
    });
    return;
  }

  // Ensure datasets are authoritative
  windowEl.dataset.siteUuid = siteUUID;
  windowEl.dataset.path = filePath;

  const openFiles = JSON.parse(
    localStorage.getItem('open-file-windows') || '[]'
  );

  const exists = openFiles.some(
    f => f.site === siteUUID && f.path === filePath
  );

  if (!exists) {
    openFiles.push({ site: siteUUID, path: filePath });
    localStorage.setItem('open-file-windows', JSON.stringify(openFiles));
  }
}


  if (!this.isLargeScreen) return;

  // Open default tab for folder windows (if no saved tab exists)
  if (kind === 'folder') {
    const savedTab = localStorage.getItem(this.key('win-tab', uuid));
    const tabToOpen = savedTab || 'view';
    
    // If no saved tab, save 'view' as default
    if (!savedTab) {
      localStorage.setItem(this.key('win-tab', uuid), 'view');
    }
    
    // Open the tab after HTMX settles
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.openTab(windowEl, tabToOpen);
      });
    });
  }

  // Load saved position
  const savedPos = this.loadPosition(uuid, kind);
  if (savedPos) {
    windowEl.style.left = savedPos.x + 'px';
    windowEl.style.top  = savedPos.y + 'px';
  } else {
    const count =
      document.querySelectorAll('.window-wrapper[data-draggable-init]').length - 1;
    const offset = count * 20 + 20;
    windowEl.style.left = offset + 'px';
    windowEl.style.top  = offset + 'px';
  }

  windowEl.style.position = 'fixed';

  // Load / assign z-index
  const savedZ = this.loadZ(uuid, kind);
  if (savedZ !== null) {
    windowEl.style.zIndex = savedZ;
    this.zCounter = Math.max(this.zCounter, savedZ);
  } else {
    const z = ++this.zCounter;
    windowEl.style.zIndex = z;
    this.saveZ(uuid, z, kind);
  }

  // Draggable behavior
  this.makeDraggable(windowEl);

  windowEl.addEventListener('mousedown', () => {
    this.bringToFront(windowEl);
  });

  // Restore minimized / hidden state
  this.loadState(windowEl, uuid, kind);

  // Persist initial position if none existed
  if (!savedPos) {
    const rect = windowEl.getBoundingClientRect();
    this.savePosition(uuid, rect.left, rect.top, kind);
  }
},

observeNewWindows() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue; // elements only
        
        // Case A: node itself is a window
        if (node.classList.contains('window-wrapper')) {
          this.initWindow(node);
        }
        
        // Case B: node contains windows (common with HTMX fragments/wrappers)
        node.querySelectorAll?.('.window-wrapper').forEach((win) => {
          this.initWindow(win);
        });
      }
    }
  });
  
  const windowsContainer = document.querySelector('#windows') || document.body;
  observer.observe(windowsContainer, { childList: true, subtree: true });
},

// Opens a specific tab in a window
  openTab(windowEl, tabName) {
    if (!windowEl || !tabName) return;
    
    const btn = windowEl.querySelector(`button[data-tab="${tabName}"]`);
    if (btn) {
      btn.click();
    }
  },

  restoreOpenWindows() {
    const uuids = this.getOpenWindows();
    if (!uuids.length) return;
    
    const container = document.querySelector('#windows');
    if (!container || !window.htmx) return;
    
    const toRestore = uuids.filter(uuid => !document.getElementById(uuid));
    if (toRestore.length === 0) return;
    
    // Track which windows still need restoration
    const pendingRestoration = new Set(toRestore);
    
    const handleSettle = (event) => {
      let windowEl = null;
      
      if (event.detail.target.classList?.contains('window-wrapper')) {
        windowEl = event.detail.target;
      } else {
        windowEl = event.detail.target.querySelector('.window-wrapper');
      }
      
      if (!windowEl) {
        windowEl = event.detail.target.closest('.window-wrapper');
      }
      
      if (windowEl && pendingRestoration.has(windowEl.id)) {
        pendingRestoration.delete(windowEl.id);
        
        // Restore saved tab for this window
        const savedTab = localStorage.getItem(this.key('win-tab', windowEl.id));
        if (savedTab) {
          setTimeout(() => {
            this.openTab(windowEl, savedTab);
          }, 100);
        }
        
        // Remove listener only after ALL windows are restored
        if (pendingRestoration.size === 0) {
          document.body.removeEventListener('htmx:afterSettle', handleSettle);
        }
      }
    };
    
    document.body.addEventListener('htmx:afterSettle', handleSettle);
    
    toRestore.forEach(uuid => {
      const placeholder = document.createElement('div');
      placeholder.id = `${uuid}-placeholder`;
      placeholder.style.display = 'none';
      container.appendChild(placeholder);
      
      window.htmx.ajax('GET', `/sites/${uuid}`, {
        source: placeholder,
        target: container,
        swap: 'afterbegin'
      });
    });
  },

initAllWindows() {
  document.querySelectorAll('.window-wrapper').forEach(win => this.initWindow(win));
},
makeDraggable(windowEl) {
  const handle = windowEl.querySelector('.window-handle');
  if (!handle) return;

  handle.style.cursor = 'move';

  handle.addEventListener('mousedown', (e) => {
    e._fromHandle = true;        // 👈 mark event source
    this.onMouseDown(e, windowEl);
  });
},
  
  onMouseDown(e, windowEl) {
    if (e.target.closest('button')) return;
    if (!this.isLargeScreen) return;
    
    this.isDragging = true;
    this.currentWindow = windowEl;
    
    const rect = windowEl.getBoundingClientRect();
    this.offset.x = e.clientX - rect.left;
    this.offset.y = e.clientY - rect.top;
    
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    e.preventDefault();
  },
  
  onMouseMove: (e) => {
    const self = DraggableWindows;
    if (!self.isDragging || !self.currentWindow) return;
    
    let newX = e.clientX - self.offset.x;
    let newY = e.clientY - self.offset.y;
    
    const rect = self.currentWindow.getBoundingClientRect();
    newX = Math.max(0, Math.min(newX, window.innerWidth - rect.width));
    newY = Math.max(0, Math.min(newY, window.innerHeight - rect.height));
    
    self.currentWindow.style.left = newX + 'px';
    self.currentWindow.style.top = newY + 'px';
  },
  
onMouseUp: () => {
  const self = DraggableWindows;
  if (!self.isDragging) return;

  if (self.currentWindow) {
    const windowEl = self.currentWindow;
    const windowId = windowEl.id;
    const kind = self.getWindowKind(windowEl);

    const rect = windowEl.getBoundingClientRect();
    self.savePosition(windowId, rect.left, rect.top, kind);
  }

  self.isDragging = false;
  self.currentWindow = null;

  document.removeEventListener('mousemove', self.onMouseMove);
  document.removeEventListener('mouseup', self.onMouseUp);
},
bringToFront(windowEl) {
  if (!windowEl) return;

  const kind = this.getWindowKind(windowEl);
  if (!kind) return;

  const newZ = ++this.zCounter;
  windowEl.style.zIndex = newZ;
  this.saveZ(windowEl.id, newZ, kind);
},

  
  observeNewWindows() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue; // elements only
          
          // Case A: node itself is a window
          if (node.classList.contains('window-wrapper')) {
            this.initWindow(node);
          }
          
          // Case B: node contains windows (common with HTMX fragments/wrappers)
          node.querySelectorAll?.('.window-wrapper').forEach((win) => {
            this.initWindow(win);
          });
        }
      }
    });
    
    const windowsContainer = document.querySelector('#windows') || document.body;
    observer.observe(windowsContainer, { childList: true, subtree: true });
  },
  hashPath(siteId, relPath) {
  // Must match backend: sha256(path).slice(0, 12)
  // Requires crypto.subtle (browser). We'll implement sync-ish via subtle+promise.
  // But for rename we already receive oldHash/newHash from backend, so we mostly won't need this.
},

getFileWindowEl(siteUUID, filePath) {
  return document.querySelector(
    `.window-wrapper[data-window-kind="file"][data-site-uuid="${CSS.escape(siteUUID)}"][data-path="${CSS.escape(filePath)}"]`
  );
},


// migrate all localStorage keys + open-site-windows id list + DOM id
migrateWindowId(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;

  // 1) DOM id change (if element exists)
  const el = document.getElementById(oldId);
  if (el) el.id = newId;

  // 2) Migrate persisted keys
  ['win-pos', 'win-size', 'win-state', 'win-path', 'win-z', 'win-tab'].forEach(prefix => {
    const oldKey = this.key(prefix, oldId);
    const newKey = this.key(prefix, newId);

    const val = localStorage.getItem(oldKey);
    if (val !== null) {
      localStorage.setItem(newKey, val);
      localStorage.removeItem(oldKey);
    }
  });

  // 3) open-site-windows (folder list, but we defensively migrate anyway)
  const open = this.getOpenWindows();
  const idx = open.indexOf(oldId);
  if (idx !== -1) {
    open[idx] = newId;
    localStorage.setItem('open-site-windows', JSON.stringify(Array.from(new Set(open))));
  }
},

closeWindow(windowEl) {
  const id = windowEl.id;
  const kind = this.getWindowKind(windowEl);

  // Fallback: unknown window
  if (!kind) {
    windowEl.remove();
    return;
  }

  /* ---------------------------------
   * 1. Remove from open-window tracking
   * --------------------------------- */

  if (kind === 'file') {
    // Remove by site + path (authoritative)
    const openFiles = JSON.parse(
      localStorage.getItem('open-file-windows') || '[]'
    ).filter(entry => {
      return !(
        entry.site === windowEl.dataset.siteUuid &&
        entry.path === windowEl.dataset.path
      );
    });

    localStorage.setItem(
      'open-file-windows',
      JSON.stringify(openFiles)
    );

    // Also defensively remove hashed ID
    this.removeOpenWindow(id);
  } else {
    this.removeOpenWindow(id);
  }

  /* ---------------------------------
   * 2. Remove ALL persisted window state
   * --------------------------------- */

  [
    'win-pos',
    'win-size',
    'win-state',
    'win-path',
    'win-z',
    'win-tab'
  ].forEach(prefix => {
    localStorage.removeItem(this.key(prefix, id));
  });

  /* ---------------------------------
   * 3. Remove the DOM element
   * --------------------------------- */

  windowEl.remove();
},

setupControls() {
  document.addEventListener('click', (e) => {
    const windowEl = e.target.closest('.window-wrapper');
    if (!windowEl) return;
    
    // Persist active tab selection
    const tabBtn = e.target.closest('button[data-tab]');
    if (tabBtn) {
      const windowEl = tabBtn.closest('.window-wrapper');
      if (!windowEl) return;

      const kind = this.getWindowKind(windowEl);
      if (kind !== 'folder') return;

      const siteUUID = windowEl.id;
      const tabName = tabBtn.dataset.tab;

      localStorage.setItem(
        this.key('win-tab', siteUUID),
        tabName
      );
    }
    
    if (e.target.classList.contains('minimize')) {
      const content = windowEl.querySelector('.hide-when-minimized');
      if (content) {
        const isMinimized = content.style.display === 'none';
        content.style.display = isMinimized ? '' : 'none';
        const kind = this.getWindowKind(windowEl);
        if (!kind) return;

        this.saveState(windowEl.id, { minimized: !isMinimized }, kind);

        if (isMinimized) {
          windowEl.classList.add('lg:w-2xl', 'w-full', 'lg:h-130');
        } else {
          windowEl.classList.remove('lg:w-2xl', 'w-full', 'lg:h-130');
        }
      }
    }
    
    if (e.target.classList.contains('hide')) {
      this.closeWindow(windowEl);
    }
  });
},
  
loadPosition(id, kind) {
  try {
    const saved = localStorage.getItem(this.key('win-pos', id));
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
},

savePosition(id, x, y, kind) {
  try {
    localStorage.setItem(
      this.key('win-pos', id),
      JSON.stringify({ x, y })
    );
  } catch {}
},

getWindowKind(windowEl) {
  const kind = windowEl.dataset.windowKind;
  if (kind !== 'file' && kind !== 'folder') {
    console.warn('Window missing/invalid data-window-kind; skipping init', windowEl);
    return null;
  }
  return kind;
},


key(type, id) {
  return `${type}-${id}`;
},
  minimizeWindow(windowEl) {
    const content = windowEl.querySelector('.hide-when-minimized');
    if (!content) return;
    
    content.style.display = 'none';
    windowEl.classList.remove('lg:w-2xl', 'w-full', 'lg:h-130');
    this.saveState(windowEl.id, { minimized: true });
  },
loadState(windowEl, id, kind) {
  try {
    const saved = localStorage.getItem(this.key('win-state', id));
    if (!saved) return;

    const state = JSON.parse(saved);

    if (state.hidden) {
      windowEl.style.display = 'none';
    } else if (state.minimized) {
      const content = windowEl.querySelector('.hide-when-minimized');
      if (content) content.style.display = 'none';
      windowEl.classList.remove('lg:w-2xl', 'w-full', 'lg:h-130');
    }
  } catch {}
},

saveState(id, state, kind) {
  try {
    localStorage.setItem(this.key('win-state', id), JSON.stringify(state));
  } catch {}
},

};

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => DraggableWindows.init());
} else {
  DraggableWindows.init();
}

window.DraggableWindows = DraggableWindows;
})();