import {
  GameConfig,
  Settings,
  getSettings,
  setGameConfig,
  setSettings,
  forgetGame,
} from "./backend";
import { isExcluded } from "./util";

let cache: Settings | null = null;
const listeners = new Set<(s: Settings) => void>();

function emit() {
  if (cache) listeners.forEach((fn) => fn(cache!));
}

/**
 * Apps a scan proved have no .sh, kept in memory only: persisting one entry
 * per library game would balloon settings.json for no benefit.
 */
const noScript = new Set<string>();

export const markNoScript = (appId: string) => noScript.add(appId);
export const hasNoScript = (appId: string) => noScript.has(appId);
export const clearNoScript = () => noScript.clear();

export function snapshot(): Settings | null {
  return cache;
}

/** Synchronous lookup — the launch hook cannot afford a round trip. */
export function gameConfig(appId: string): GameConfig | undefined {
  return cache?.games?.[appId];
}

export async function refresh(): Promise<Settings> {
  cache = await getSettings();
  emit();
  return cache;
}

export function subscribe(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  if (cache) fn(cache);
  return () => listeners.delete(fn);
}

export async function updateGame(appId: string, patch: Partial<GameConfig>) {
  const entry = await setGameConfig(appId, patch);
  if (cache) cache.games[appId] = entry;
  emit();
  return entry;
}

export async function updateSettings(patch: Partial<Settings>) {
  cache = await setSettings(patch);

  // A newly-added exclusion should retire any game already detected under
  // that name, otherwise a stale entry keeps prompting on launch.
  if (patch.excludedScripts && cache) {
    const stale = Object.entries(cache.games).filter(
      ([, config]) => config.detected && isExcluded(config.script, patch.excludedScripts),
    );
    for (const [appId] of stale) {
      cache.games[appId] = await setGameConfig(appId, {
        detected: false,
        enabled: false,
      });
    }
  }

  emit();
  return cache;
}

export async function dropGame(appId: string) {
  cache = await forgetGame(appId);
  emit();
  return cache;
}
