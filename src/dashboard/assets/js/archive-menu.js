// Archive menu functionality
const archiveBtn = document.getElementById('archive-btn');

tippy(archiveBtn, {
  trigger: 'click',
  interactive: true,
  placement: 'top-end',
  content: () => renderArchiveMenu(), // ← IMPORTANT
});

/* -----------------------------------------------
   Helpers
------------------------------------------------ */

function fireRefreshSites() {
  document.body.dispatchEvent(
    new Event('refreshSites')
  );
}

async function fetchArchivedSites() {
  const res = await csrfFetch('/admin/sites/archive');
  if (!res.ok) throw new Error('Failed to load archived sites');
  return res.json();
}

/* -----------------------------------------------
   Menu renderer
------------------------------------------------ */

function renderArchiveMenu() {
  const el = document.createElement('div');
  el.className = 'flex flex-col gap-2 w-56 text-sm';

  const header = document.createElement('div');
  header.textContent = 'Archived sites';
  header.className = 'font-medium text-white mb-1';

  const list = document.createElement('div');
  list.className = 'flex flex-col gap-1';

  el.append(header, list);

  // Initial loading state
  const loading = document.createElement('div');
  loading.textContent = 'Loading…';
  loading.className = 'text-gray-400 italic';
  list.append(loading);

  fetchArchivedSites()
    .then(sites => {
      list.innerHTML = '';

      if (!sites.length) {
        const empty = document.createElement('div');
        empty.textContent = 'No archived sites';
        empty.className = 'text-gray-400 italic';
        list.append(empty);
        return;
      }

      sites.forEach(site => {
        const btn = document.createElement('button');
        btn.className =
          'text-left px-2 py-1 rounded hover:bg-white/10';

        btn.textContent = site.name || site.directory;

        btn.onclick = async () => {
          const ok = confirm(
            'Restore this site? (It won\'t affect any other site)'
          );
          if (!ok) return;

          try {
            const res = await csrfFetch(
              `/admin/sites/${site.uuid}/restore-archive`,
              { method: 'POST' }
            );

            if (!res.ok) {
              alert('Failed to restore site');
              return;
            }

            fireRefreshSites();

            // 🔁 Re-render the dropdown *without closing it*
            const instance = archiveBtn._tippy;
            if (instance) {
              instance.setContent(renderArchiveMenu());
            }

          } catch (err) {
            alert('Failed to restore site');
          }
        };

        list.append(btn);
      });
    })
    .catch(() => {
      list.innerHTML = '';
      const err = document.createElement('div');
      err.textContent = 'Failed to load archived sites';
      err.className = 'text-red-500';
      list.append(err);
    });

  return el;
}
