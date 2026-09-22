import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// Metro resolves this to the hashed static URL at export time — a literal
// /assets/images/... path 404s in the static bundle (audit finding).
const ICON_URL = require('@/assets/images/play_store_512.png') as string;

/**
 * Root HTML shell for web (static output).
 *
 * Includes a CSS-only branded startup screen (`.boot-splash`) that renders
 * with the FIRST byte of HTML — before JS loads — and stays up until the
 * app is actually ready: RootLayout calls `__signalAppReady` as it mounts
 * (see src/app/_layout.tsx), and that triggers the fade. A slow-fallback
 * CSS timer (8s) keeps dismissal fail-safe if JS errors before mount, so
 * the splash can never trap the user on a blank page.
 *
 * Styling mirrors the app's real palette (Colors light/dark in
 * src/constants/colors.ts) and the native splash: tinted brand background
 * instead of white (no flash between splash and app), an accentSoft icon
 * tile, and brand-accent loading dots. Decorative animations are disabled
 * under `prefers-reduced-motion: reduce` — the fail-safe dismissal is not.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#F6F8F7" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0A0F0D" media="(prefers-color-scheme: dark)" />

        {/* Pre-hydration backgrounds: the app's real light/dark background tokens. */}
        <style dangerouslySetInnerHTML={{ __html: `html{background:#F6F8F7}@media (prefers-color-scheme:dark){html{background:#0A0F0D}}` }} />

        {/* Branded boot splash — pure CSS, zero JS, auto-dismissing. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
#boot-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#F6F8F7;pointer-events:none}
html.app-ready #boot-splash{animation:boot-hide .5s ease forwards}
/* Fail-safe: if the bundle never mounts (JS error, very slow network),
   fade anyway so the user is never left on a frozen splash. */
html:not(.app-ready) #boot-splash{animation:boot-hide .5s ease 8s forwards}
#boot-splash .boot-tile{width:132px;height:132px;border-radius:36px;background:#D1FAE5;border:1px solid rgba(5,150,105,.13);display:flex;align-items:center;justify-content:center;animation:boot-pop .55s cubic-bezier(.34,1.56,.64,1) both}
#boot-splash img{width:112px;height:112px;border-radius:28px}
#boot-splash .boot-title{font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.5px;color:#0F172A;animation:boot-rise .45s ease .18s both}
#boot-splash .boot-sub{font-size:13px;line-height:18px;color:#64748B;animation:boot-rise .45s ease .3s both}
#boot-splash .boot-dots{display:flex;gap:8px;margin-top:20px}
#boot-splash .boot-dot{width:8px;height:8px;border-radius:9999px;background:#059669;animation:boot-pulse 1s ease-in-out infinite}
#boot-splash .boot-dot:nth-child(2){animation-delay:.15s}
#boot-splash .boot-dot:nth-child(3){animation-delay:.3s}
@keyframes boot-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes boot-rise{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes boot-pulse{0%,100%{opacity:.3;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
@keyframes boot-hide{to{opacity:0;visibility:hidden}}
/* Reduced motion: skip the decorative entrances and the loading wave;
   the dismissal fade stays so the splash still gets out of the way. */
@media (prefers-reduced-motion:reduce){
  #boot-splash .boot-tile,#boot-splash .boot-title,#boot-splash .boot-sub{animation:none}
  #boot-splash .boot-dot{animation:none;opacity:.45}
}
@media (prefers-color-scheme:dark){
  #boot-splash{background:#0A0F0D}
  #boot-splash .boot-tile{background:#16211D;border-color:rgba(16,185,129,.22)}
  #boot-splash .boot-title{color:#ECF3F0}
  #boot-splash .boot-sub{color:#94A3B8}
  #boot-splash .boot-dot{background:#10B981}
}`,
          }}
        />
        <link rel="icon" href={ICON_URL} type="image/png" />

        <ScrollViewStyleReset />
      </head>
      <body>
        <div id="boot-splash" aria-hidden="true">
          <div className="boot-tile">
            <img src={ICON_URL} alt="" />
          </div>
          <div className="boot-title">Mamta General Store</div>
          <div className="boot-sub">Scan to price · Inventory in your pocket</div>
          <div className="boot-dots">
            <div className="boot-dot" />
            <div className="boot-dot" />
            <div className="boot-dot" />
          </div>
        </div>
        {/* The splash dismisses when RootLayout signals app-ready (below). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__BOOT_LISTENERS__=[];window.__signalAppReady=function(){document.documentElement.classList.add('app-ready');(window.__BOOT_LISTENERS__||[]).forEach(function(f){try{f()}catch(e){}})};`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
