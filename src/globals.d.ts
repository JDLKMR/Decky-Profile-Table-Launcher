// Steam client internals. Untyped on purpose: the shapes shift between
// Steam betas, so every access site guards with optional chaining.
declare const SteamClient: any;
declare const appStore: any;
declare const collectionStore: any;

interface Window {
  SteamClient: any;
  appStore: any;
  collectionStore: any;
}
