import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Root HTML shell for web (static output).
 *
 * Includes a CSS-only branded startup screen (`.boot-splash`) that renders
 * with the FIRST byte of HTML — before JS loads — and auto-fades itself via
 * a CSS animation, so it can never get stuck covering the app (a React
 * overlay would be server-rendered into the static bundle and outlive
 * hydration errors). When React mounts, it clears the shell's children and
 * the splash is gone; the animation's `forwards` fill keeps it invisible
 * even if mounting is slow, and dark mode gets the app's dark background.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#F8FAFC" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0B1220" media="(prefers-color-scheme: dark)" />

        {/* Pre-hydration backgrounds: light first, dark via media query. */}
        <style dangerouslySetInnerHTML={{ __html: `html{background:#F8FAFC}@media (prefers-color-scheme:dark){html{background:#0B1220}}` }} />

        {/* Branded boot splash — pure CSS, zero JS, auto-dismissing. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
#boot-splash{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#FFFFFF;pointer-events:none;animation:boot-hide .5s ease .9s forwards}
#boot-splash .boot-tile{width:132px;height:132px;border-radius:36px;background:#FFFFFF;box-shadow:0 2px 4px 0 rgba(15,23,42,.04),0 16px 40px 0 rgba(15,23,42,.14);display:flex;align-items:center;justify-content:center;animation:boot-pop .55s cubic-bezier(.34,1.56,.64,1) both}
#boot-splash img{width:112px;height:112px}
#boot-splash .boot-title{font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.5px;color:#0F172A;animation:boot-rise .45s ease .18s both}
#boot-splash .boot-sub{font-size:13px;line-height:18px;color:#64748B;animation:boot-rise .45s ease .3s both}
#boot-splash .boot-dots{display:flex;gap:8px;margin-top:20px}
#boot-splash .boot-dot{width:8px;height:8px;border-radius:9999px;background:#CBD5E1;animation:boot-pulse 1s ease-in-out infinite}
#boot-splash .boot-dot:nth-child(2){animation-delay:.15s}
#boot-splash .boot-dot:nth-child(3){animation-delay:.3s}
@keyframes boot-pop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes boot-rise{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes boot-pulse{0%,100%{opacity:.3;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}
@keyframes boot-hide{to{opacity:0;visibility:hidden}}
@media (prefers-color-scheme:dark){
  #boot-splash{background:#0B1220}
  #boot-splash .boot-title{color:#F1F5F9}
  #boot-splash .boot-sub{color:#94A3B8}
  #boot-splash .boot-dot{background:#334155}
}`,
          }}
        />
        <link rel="icon" href="/assets/images/play_store_512.png" type="image/png" />

        <ScrollViewStyleReset />
      </head>
      <body>
        <div id="boot-splash" aria-hidden="true">
          <div className="boot-tile">
            <img src="/assets/images/play_store_512.png" alt="" />
          </div>
          <div className="boot-title">Mamta General Store</div>
          <div className="boot-sub">Scan to price · Inventory in your pocket</div>
          <div className="boot-dots">
            <div className="boot-dot" />
            <div className="boot-dot" />
            <div className="boot-dot" />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
