/**
 * Emit a site-scoped commit event for HTMX.
 *
 * @param {Response} res - Express response
 * @param {string} siteId - Site UUID
 * @param {string|null} commitHash - New HEAD commit (if known)
 * @param {string} source - Short source tag (e.g. file:edit)
 */
export function triggerSiteCommit(
  res,
  siteId,
  commit = null,
  source = 'unknown'
) {
  const commitHash = commit || null;

  res.set(
    'HX-Trigger',
    JSON.stringify({
      [`site:${siteId}:commit`]: {
        siteId,
        commitHash,
        source
      }
    })
  );
}

export function triggerFileCommit(
  res,
  siteId,
  filePath,
  commitHash = null,
  reason = 'file:edit'
) {
  if (!res || res.headersSent) return;

  res.setHeader('HX-Trigger', JSON.stringify({
    fileCommit: {
      siteId,
      path: filePath,
      commit: commitHash,
      reason
    }
  }));
}
