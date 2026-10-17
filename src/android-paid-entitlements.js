// A catalog listing can lag a checkout/Stripe entitlement repair. The
// authenticated /paid-audio/my endpoint is authoritative for this user's paid
// IDs; it repairs pending Stripe orders BEFORE the ordinary catalog is fetched.
// Never grant audio/track access from a local flag: playback still requires the
// Worker's signed paid-audio/play-session authorization.
export function verifiedPurchasedIds(data) {
  return new Set((Array.isArray(data?.items) ? data.items : [])
    .filter(item => item && item.accessOwned === true && item.id)
    .map(item => String(item.id)));
}

export function mergeVerifiedPaidCatalog(catalog, purchasedIds) {
  const ids = purchasedIds instanceof Set ? purchasedIds : new Set();
  return (Array.isArray(catalog) ? catalog : []).map(item => {
    if (!item || !ids.has(String(item.id)) || item.owned === true) return item;
    // Safe for display only. If catalog tracks are temporarily absent, the
    // app must show purchased status instead of offering a duplicate checkout.
    return { ...item, owned: true };
  });
}

export function paidCatalogAccountKey(user, hasToken) {
  if (!user || !hasToken) return 'guest';
  const id = String(user.id || user.email || '').trim();
  return id ? 'account:' + id : 'account:authenticated';
}
