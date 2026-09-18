import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * Root HTML shell for web (static output). Pins the background to both
 * color schemes so there's never a white flash before React hydrates,
 * and loads the Inter fallback face for older browsers.
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

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
