import { resolveScript } from "./backend";
import { getLaunchInfo, listLibraryApps } from "./steam";
import { clearNoScript, markNoScript, refresh, snapshot, updateGame } from "./store";

export interface ScanProgress {
  done: number;
  total: number;
  found: number;
}

/**
 * Walk the library and cache which apps launch a .sh. Not required — the
 * interceptor detects on first launch too — but it makes that first launch
 * instant instead of kill-and-relaunch.
 */
export async function scanLibrary(
  onProgress?: (progress: ScanProgress) => void,
): Promise<number> {
  clearNoScript();

  const apps = listLibraryApps();
  const batchSize = 6;
  let done = 0;
  let found = 0;

  for (let i = 0; i < apps.length; i += batchSize) {
    const batch = apps.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async ({ appId, name }) => {
        const key = String(appId);
        try {
          const info = await getLaunchInfo(appId);
          const script = await resolveScript(info.exe, info.launchOptions);

          if (script.path) {
            found += 1;
            const existing = snapshot()?.games?.[key];
            await updateGame(key, {
              name,
              script: script.path,
              detected: true,
              enabled: existing?.detected
                ? existing.enabled
                : (snapshot()?.askByDefault ?? true),
            });
          } else {
            markNoScript(key);
          }
        } catch (e) {
          console.warn("[ProfileLauncher] scan failed for", appId, e);
        }
      }),
    );

    done += batch.length;
    onProgress?.({ done: Math.min(done, apps.length), total: apps.length, found });
  }

  await refresh();
  return found;
}
