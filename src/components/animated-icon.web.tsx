/**
 * Web startup screen stub.
 *
 * The real web splash lives in the pre-hydration shell (src/app/+html.tsx)
 * as pure HTML + CSS that auto-dismisses via the app-ready signal from
 * RootLayout — a React overlay here would be server-rendered into the
 * static export and could outlive hydration errors, covering the app
 * forever. This stub keeps the shared import surface (src/app/_layout.tsx)
 * working on web.
 */
export function AnimatedSplashOverlay() {
  return null;
}
