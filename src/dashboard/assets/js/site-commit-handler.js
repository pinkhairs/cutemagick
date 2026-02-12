// Site commit event handler
document.body.addEventListener('siteCommit', e => {
  if (!e.detail) return;
  const siteId = e.detail.siteId;
});
