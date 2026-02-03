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
    const arr = JSON.parse(localStorage.getItem('open-site-windows')) || [];
    // Ensure it's a list of raw UUIDs (no "site-window-" prefix)
    return arr.map(id => String(id).replace(/^site-window-/, '')).filter(Boolean);
  } catch {
    return [];
  }
},

addOpenWindow(siteUuid) {
  if (!siteUuid) return;
  const open = this.getOpenWindows();
  if (!open.includes(siteUuid)) {
    open.push(siteUuid);
    localStorage.setItem('open-site-windows', JSON.stringify(open));
  }
},

removeOpenWindow(siteUuid) {
  if (!siteUuid) return;
  const open = this.getOpenWindows().filter(id => id !== siteUuid);
  localStorage.setItem('open-site-windows', JSON.stringify(open));
},

    init() {
      this.checkScreenSize();
      document.body.addEventListener('htmx:load', () => {
  DraggableWindows.restoreOpenWindows();
}, { once: true });
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

  const kind = this.getWindowKind(windowEl);
  if (!kind) return;

  const winId = windowEl.id; // e.g. "site-window-<uuid>"
  const siteUuid = this.siteUuidFromWindow(windowEl); // raw <uuid>

  // ---------------------------------------------
  // Duplicate window guard (DOM-id based)
  // ---------------------------------------------
  const existingWindow = document.querySelector(
    `.window-wrapper[id="${CSS.escape(winId)}"][data-draggable-init="true"]`
  );

  if (existingWindow && existingWindow !== windowEl) {
    console.warn('[windows] Duplicate window detected, focusing existing:', winId);
    this.focusWindow(existingWindow);
    windowEl.remove();
    return;
  }

  windowEl.dataset.draggableInit = 'true';

  // ---------------------------------------------
  // Folder windows: track OPEN by SITE UUID
  // ---------------------------------------------
  if (kind === 'folder') {
    this.addOpenWindow(siteUuid);

    const openTab = localStorage.getItem(this.key('win-tab', winId));
    setTimeout(() => this.openTab(windowEl, openTab ?? 'home'), 333);
  }

  // ---------------------------------------------
  // File windows: track by site + path
  // ---------------------------------------------
if (kind === 'file') {
  const site =
    windowEl.dataset.siteUuid ||
    windowEl.getAttribute('data-site-uuid');

  const path =
    windowEl.dataset.path ||
    windowEl.getAttribute('data-path') ||
    windowEl.querySelector('[data-file-path]')?.dataset.filePath;

    if (!site || !path) {
      console.warn('[windows] file window missing site or path, not stored', {
        site,
        path,
        windowEl
      });
      return;
    }

    windowEl.dataset.siteUuid = site;
    windowEl.dataset.path = path;

    const openFiles = JSON.parse(
      localStorage.getItem('open-file-windows') || '[]'
    );

    const isDuplicate = openFiles.some(
      entry => entry.site === site && entry.path === path
    );

    if (!isDuplicate) {
      openFiles.push({ site, path });
      localStorage.setItem('open-file-windows', JSON.stringify(openFiles));
    }
  }

  // ---------------------------------------------
  // Restore tab for NEW folder windows
  // ---------------------------------------------
  if (kind === 'folder') {
    const savedTab = localStorage.getItem(this.key('win-tab', winId));
    const tabToOpen = savedTab || 'home';

    if (!savedTab) {
      localStorage.setItem(this.key('win-tab', winId), 'home');
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.openTab(windowEl, tabToOpen);
      });
    });
  }

  // ---------------------------------------------
  // Mobile: stop here
  // ---------------------------------------------
  if (!this.isLargeScreen) return;

  // ---------------------------------------------
  // Position restore (DOM id–keyed)
  // ---------------------------------------------
  const savedPos = this.loadPosition(winId, kind);
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

  // ---------------------------------------------
  // Z-index restore (DOM id–keyed)
  // ---------------------------------------------
  const savedZ = this.loadZ(winId, kind);
  if (savedZ !== null) {
    windowEl.style.zIndex = savedZ;
    this.zCounter = Math.max(this.zCounter, savedZ);
  } else {
    const z = ++this.zCounter;
    windowEl.style.zIndex = z;
    this.saveZ(winId, z, kind);
  }

  // ---------------------------------------------
  // Drag + focus
  // ---------------------------------------------
  this.makeDraggable(windowEl);
  windowEl.addEventListener('mousedown', () => {
    this.bringToFront(windowEl);
  });

  // ---------------------------------------------
  // Restore minimized / hidden state
  // ---------------------------------------------
  this.loadState(windowEl, winId, kind);

  // ---------------------------------------------
  // Persist initial position if none existed
  // ---------------------------------------------
  if (!savedPos) {
    const rect = windowEl.getBoundingClientRect();
    this.savePosition(winId, rect.left, rect.top, kind);
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
  // ============================================
  const folderUUIDs = this.getOpenWindows();
  const foldersToRestore = folderUUIDs.filter(siteUuid => {
    const winId = this.folderWindowId(siteUuid);
    return !document.getElementById(winId);
  });
  
  // Get file windows to restore
  let openFiles = [];
  try {
    openFiles = JSON.parse(localStorage.getItem('open-file-windows') || '[]');
  } catch {
    openFiles = [];
  }
  
  const container = document.querySelector('#windows');
  if (!container || !window.htmx) return;
  
  const totalToRestore = foldersToRestore.length + openFiles.length;
  if (totalToRestore === 0) return;
  
  // Track which windows still need restoration
  const pendingRestoration = new Set(foldersToRestore);
  const pendingFiles = new Set(openFiles.map(f => `${f.site}:${f.path}`));
  
  // ============================================
  // HANDLE SETTLE EVENT
  // ============================================
  
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
    
    if (!windowEl) return;
    
    const kind = this.getWindowKind(windowEl);
    if (!kind) return;
    
    // ============================================
    // 2. FOLDER WINDOW HANDLING
    // ============================================
    if (kind === 'folder' && pendingRestoration.has(windowEl.id)) {
      pendingRestoration.delete(windowEl.id);
      
      // Restore saved tab for this window
      const savedTab = localStorage.getItem(this.key('win-tab', windowEl.id));
      if (savedTab) {
        setTimeout(() => {
          this.openTab(windowEl, savedTab);
        }, 333);
      }
    }
// ============================================
// 3. FILE WINDOW HANDLING
// ============================================
if (kind === 'file') {
  const site = windowEl.dataset.siteUuid;
  const path = windowEl.dataset.path;
  const key = `${site}:${path}`;
  
  if (pendingFiles.has(key)) {
    pendingFiles.delete(key);
    
    // Focus the file window
    setTimeout(() => {
      this.focusWindow(windowEl);
    }, 333);
  }
}
    
    // Remove listener only after ALL windows are restored
    if (pendingRestoration.size === 0 && pendingFiles.size === 0) {
      document.body.removeEventListener('htmx:afterSettle', handleSettle);
    }
  };
  
  document.body.addEventListener('htmx:afterSettle', handleSettle);
  
  // ============================================
  // RESTORE FOLDER WINDOWS
  // ============================================
foldersToRestore.forEach(siteUuid => {
  const placeholder = document.createElement('div');
  placeholder.id = `${siteUuid}-placeholder`;
  placeholder.style.display = 'none';
  container.appendChild(placeholder);

  window.htmx.ajax('GET', `/admin/site-window/${siteUuid}`, {
    source: placeholder,
    target: container,
    swap: 'afterbegin'
  });
});

  
  // ============================================
// RESTORE FILE WINDOWS
// ============================================
openFiles.forEach(({ site, path }) => {
  const encodedPath = encodeURIComponent(path);

  const placeholder = document.createElement('div');
  placeholder.style.display = 'none';
  container.appendChild(placeholder);

  window.htmx.ajax('GET', `/admin/editor/${site}/${encodedPath}`, {
    source: placeholder,
    target: container,
    swap: 'afterbegin',
  });
});

},
siteUuidFromWindow(windowEl) {
  // Prefer explicit dataset
  const ds = windowEl?.dataset?.siteUuid;
  if (ds) return ds;

  // Fallback: parse folder window DOM ids like "site-window-<uuid>"
  const id = windowEl?.id || '';
  const m = id.match(/^site-window-(.+)$/);
  return m ? m[1] : null;
},

folderWindowId(siteUuid) {
  return `site-window-${siteUuid}`;
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

const open = this.getOpenWindows();
const oldSite = oldId.replace(/^site-window-/, '');
const newSite = newId.replace(/^site-window-/, '');

const idx = open.indexOf(oldSite);
if (idx !== -1) {
  open[idx] = newSite;
  localStorage.setItem('open-site-windows', JSON.stringify([...new Set(open)]));
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

    const id = windowEl.id;
['win-pos','win-size','win-state','win-path','win-z','win-tab'].forEach(prefix => {
  localStorage.removeItem(this.key(prefix, id));
});

  } else {
    const siteUuid = this.siteUuidFromWindow(windowEl);
this.removeOpenWindow(siteUuid);
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

focusWindow(windowEl) {
    if (!windowEl) return;
    
    // Always bring to front
    this.bringToFront(windowEl);
    
    const content = windowEl.querySelector('.hide-when-minimized');
    const isMinimized = content && content.style.display === 'none';
    
    if (isMinimized) {
      this.unminimizeWindow(windowEl);
    }
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