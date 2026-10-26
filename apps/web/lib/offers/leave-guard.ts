// Which link clicks would take the member away from a form with unsaved
// changes. Links inside BATR are handled by the router, so the browser's
// own "leave site?" warning never sees them; the form asks instead.

export interface LinkClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface LinkTarget {
  href: string;
  target: string;
  download: boolean;
}

/** The in-app path the click would open, or null when the form should not step in. */
export function guardedDestination(click: LinkClick, link: LinkTarget, current: URL): string | null {
  if (click.defaultPrevented || click.button !== 0) return null;
  // Opening in a new tab or window keeps this page open.
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null;
  if (link.download || (link.target !== "" && link.target !== "_self")) return null;
  let next: URL;
  try {
    next = new URL(link.href, current);
  } catch {
    return null;
  }
  // Other sites go through the browser's own warning.
  if (next.origin !== current.origin) return null;
  // A jump within the same page leaves nothing.
  if (next.pathname === current.pathname && next.search === current.search) return null;
  return `${next.pathname}${next.search}${next.hash}`;
}
