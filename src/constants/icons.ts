/**
 * Asset registry for app-level icons used by more than one module.
 *
 * Why this lives here and not next to the component that displays it: a
 * component file may only export components. The moment it also exports a
 * plain value, the module stops being a Fast Refresh boundary, so editing it
 * throws away the state of every component in the file instead of patching it
 * in place. A constants module has no state to lose, so it is the right home.
 *
 * It also keeps the native and web splash overlays pointing at ONE definition
 * of the store icon instead of two copies that can drift apart.
 */
export const APP_ICON_SOURCE = require('@/assets/images/play_store_512.png');
