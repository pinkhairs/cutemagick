export function resolveSiteAddress(site) {
  if (!site) return null;

  const {
    domain,
    directory
  } = site;

  const base =
    domain && domain.trim()
      ? domain.trim()
      : `${directory}.${process.env.WILDCARD_DOMAIN}`;

  // Ensure protocol
  if (/^https?:\/\//i.test(base)) {
    return base;
  }

  return `https://${base}`;
}
