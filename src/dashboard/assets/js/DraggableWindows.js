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
        console.log(JSON.parse(localStorage.getItem('open-site-windows')).length);
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
      
      window.addEventListener('resize', () => {
        this.checkScreenSize();
        this.updateAllWindows();
      });
    },
    
    checkScreenSize() {
      this.isLargeScreen = window.innerWidth >= 1024;
    },
    
    updateAllWindows() {
      document.querySelectorAll('.window').forEach(win => {
        if (this.isLargeScreen) {
          if (!win.style.left) {
            const offset = Array.from(document.querySelectorAll('.window')).indexOf(win) * 20;
            win.style.left = offset + 'px';
            win.style.top = offset + 'px';
          }
          win.style.position = 'fixed';
        } else {
          win.style.position = '';
        }
      });
    },
    
    loadZ(id) {
      try {
        const z = localStorage.getItem(`win-z-${id}`);
        return z ? Number(z) : null;
      } catch {
        return null;
      }
    },
    
    saveZ(id, z) {
      try {
        localStorage.setItem(`win-z-${id}`, String(z));
      } catch {}
    },
    
    
    initAllWindows() {
      document.querySelectorAll('.window').forEach(win => this.initWindow(win));
    },
    
    initWindow(windowEl) {
      if (windowEl.dataset.draggableInit) return;
      windowEl.dataset.draggableInit = 'true';
      
      const uuid = windowEl.id;
      
      // Track open window
      this.ensureDefaultTab(windowEl, uuid);
      this.addOpenWindow(uuid);
      if (!this.isLargeScreen) return;
      
      // Load saved position
      const saved = this.loadPosition(uuid);
      if (saved) {
        windowEl.style.left = saved.x + 'px';
        windowEl.style.top = saved.y + 'px';
      } else {
        const count =
        document.querySelectorAll('.window[data-draggable-init]').length - 1;
        const offset = count * 20 + 20;
        windowEl.style.left = offset + 'px';
        windowEl.style.top = offset + 'px';
      }
      
      windowEl.style.position = 'fixed';
      const savedZ = this.loadZ(uuid);
      
      if (savedZ !== null) {
        windowEl.style.zIndex = savedZ;
        this.zCounter = Math.max(this.zCounter, savedZ);
      } else {
        windowEl.style.zIndex = ++this.zCounter;
        this.saveZ(uuid, this.zCounter);
      }
      
      
      this.makeDraggable(windowEl);
      windowEl.addEventListener('mousedown', () =>
        this.focusWindow(windowEl)
    );
    
    this.loadState(windowEl, uuid);
    
    if (!this.loadPosition(uuid)) {
      const rect = windowEl.getBoundingClientRect();
      this.savePosition(uuid, rect.left, rect.top);
    }
    
  },
  ensureDefaultTab(windowEl, uuid) {
  const key = `win-tab-${uuid}`;
  const existing = localStorage.getItem(key);

  if (existing != null) return;

  // First time ever
  localStorage.setItem(key, 'files');

  // Click default tab AFTER HTMX settles
  const clickDefault = () => {
    const btn = windowEl.querySelector('button[data-tab="files"]');
    if (btn) {
      btn.dataset._restored = '1'; // prevent double restore
      btn.click();
    }
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(clickDefault);
  });
},

  restoreOpenWindows() {
    const uuids = this.getOpenWindows();
    if (!uuids.length) return;
    
    const container = document.querySelector('#windows');
    if (!container || !window.htmx) return;
    
    // Only count windows that are NOT already in the DOM
    const toRestore = uuids.filter(uuid =>
      !document.getElementById(uuid)
    );
    
    if (toRestore.length === 0) {
      return;
    }
    
    toRestore.forEach(uuid => {
      // Create a unique placeholder element to use as source for this specific request
      // This prevents HTMX from queuing/canceling requests (it defaults to body as source)
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
  
  makeDraggable(windowEl) {
    const handle = windowEl.querySelector('h2');
    if (!handle) return;
    
    handle.style.cursor = 'move';
    handle.addEventListener('mousedown', (e) => this.onMouseDown(e, windowEl));
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
      const windowId = self.currentWindow.id || self.currentWindow.dataset.windowId;
      const rect = self.currentWindow.getBoundingClientRect();
      self.savePosition(windowId, rect.left, rect.top);
    }
    
    self.isDragging = false;
    self.currentWindow = null;
    document.removeEventListener('mousemove', self.onMouseMove);
    document.removeEventListener('mouseup', self.onMouseUp);
  },
  bringToFront(windowEl) {
    const newZ = ++this.zCounter;
    windowEl.style.zIndex = newZ;
    this.saveZ(windowEl.id, newZ);
  },
  
  observeNewWindows() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue; // elements only
          
          // Case A: node itself is a window
          if (node.classList.contains('window')) {
            this.initWindow(node);
          }
          
          // Case B: node contains windows (common with HTMX fragments/wrappers)
          node.querySelectorAll?.('.window').forEach((win) => {
            this.initWindow(win);
          });
        }
      }
    });
    
    const windowsContainer = document.querySelector('#windows') || document.body;
    observer.observe(windowsContainer, { childList: true, subtree: true });
  },
  setupControls() {
    document.addEventListener('click', (e) => {
      const windowEl = e.target.closest('.window');
      if (!windowEl) return;
      
      if (e.target.classList.contains('minimize')) {
        const content = windowEl.querySelector('.hide-when-minimized');
        if (content) {
          const isMinimized = content.style.display === 'none';
          content.style.display = isMinimized ? '' : 'none';
          this.saveState(windowEl.id, { minimized: !isMinimized });
          if (isMinimized) {
            windowEl.classList.add('w-full');
          } else {
            windowEl.classList.remove('w-full');
          }
        }
      }
      if (e.target.classList.contains('hide')) {
        const uuid = windowEl.id;
        
        this.removeOpenWindow(uuid);
        
        localStorage.removeItem(`win-pos-${windowEl.id}`);
        localStorage.removeItem(`win-state-${windowEl.id}`);
        localStorage.removeItem(`win-path-site-${uuid}`);
        localStorage.removeItem(`win-z-${windowEl.id}`);
        localStorage.removeItem(`win-tab-${windowEl.id}`);
        
        windowEl.remove();
      }
    });
  },
  
  loadPosition(id) {
    try {
      const saved = localStorage.getItem(`win-pos-${id}`);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  },
  
  savePosition(id, x, y) {
    try {
      localStorage.setItem(`win-pos-${id}`, JSON.stringify({ x, y }));
    } catch (e) {}
  },
  minimizeWindow(windowEl) {
    const content = windowEl.querySelector('.hide-when-minimized');
    if (!content) return;
    
    content.style.display = 'none';
    windowEl.classList.remove('w-full');
    this.saveState(windowEl.id, { minimized: true });
  },
  
  unminimizeWindow(windowEl) {
    const content = windowEl.querySelector('.hide-when-minimized');
    if (!content) return;
    
    content.style.display = '';
    windowEl.classList.add('w-full');
    this.saveState(windowEl.id, { minimized: false });
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
  loadState(windowEl, id) {
    try {
      const saved = localStorage.getItem(`win-state-${id}`);
      if (saved) {
        const state = JSON.parse(saved);
        if (state.hidden) {
          windowEl.style.display = 'none';
        } else if (state.minimized) {
          const content = windowEl.querySelector('.hide-when-minimized');
          if (content) content.style.display = 'none';
          windowEl.classList.remove('w-full');
        }
      }
    } catch (e) {}
  },
  
  saveState(id, state) {
    try {
      localStorage.setItem(`win-state-${id}`, JSON.stringify(state));
    } catch (e) {}
  }
};

// Initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => DraggableWindows.init());
} else {
  DraggableWindows.init();
}

window.DraggableWindows = DraggableWindows;
})();