export const SWIGGY_APP_STORE =
  "https://apps.apple.com/in/app/swiggy-food-order-delivery/id989540920";
export const SWIGGY_PLAY_STORE =
  "https://play.google.com/store/apps/details?id=in.swiggy.android";

/**
 * Opens the Swiggy app via its native scheme on mobile.
 * On desktop, opens the Swiggy website.
 * No fallback URLs — callers are expected to show store links in the UI
 * for users who don't have the app installed.
 */
export function openSwiggy(dishName: string): void {
  const encoded = encodeURIComponent(dishName);
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  if (isIOS) {
    // Opens Swiggy app home (Swiggy doesn't expose a public search deep link)
    window.location.href = `swiggy://`;
  } else if (isAndroid) {
    // App Links: opens Swiggy app directly at search results
    window.location.href = `https://www.swiggy.com/search?query=${encoded}`;
  } else {
    // Desktop: open web
    window.open(
      `https://www.swiggy.com/search?query=${encoded}`,
      "_blank",
      "noopener,noreferrer",
    );
  }
}
