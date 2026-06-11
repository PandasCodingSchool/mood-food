/**
 * Opens the Swiggy app with the dish pre-filled in search.
 *
 * On mobile: tries swiggy:// native scheme first; falls back to web after 1.5 s
 * if the app isn't installed (document.hidden stays false).
 * On desktop: opens the web URL directly in a new tab.
 */
export function openSwiggy(dishName: string): void {
  const encoded = encodeURIComponent(dishName);
  const appScheme = `swiggy://search?q=${encoded}`;
  const webUrl = `https://www.swiggy.com/search?query=${encoded}`;

  const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  if (!isMobile) {
    window.open(webUrl, "_blank", "noopener,noreferrer");
    return;
  }

  window.location.href = appScheme;

  setTimeout(() => {
    if (!document.hidden) {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }
  }, 1500);
}
