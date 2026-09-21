/**
 * Crypto-agnostic UUID v4 helper.
 *
 * `crypto.randomUUID()` is only available where the WebCrypto global
 * `crypto` exists — Hermes (the React Native JS engine) does not provide
 * it, so image uploads would crash on devices while working on web.
 */
export function uuid(): string {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  // RFC 4122 v4 via getRandomValues (also WebCrypto, but widely available),
  // with a Math.random fallback for environments without either.
  if (typeof cryptoObj?.getRandomValues === 'function') {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
      const n = Number(c);
      return (
        n ^
        (cryptoObj.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))
      ).toString(16);
    });
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
