export interface AppLaunchInfo {
  appId: string;
  gameId: string;
  name: string;
  exe: string;
  launchOptions: string;
}

/**
 * RegisterForGameActionStart hands back a GameID, not an AppID. For an
 * ordinary Steam game those two happen to be numerically identical, which is
 * why treating the raw value as an AppID appears to work — but a non-Steam
 * shortcut's AppID is reported as 0 at this layer, while its GameID is a
 * distinct, always-valid composite value. Resolve the real AppID through the
 * overview lookup before using the identifier for anything else.
 */
export function resolveAppId(rawGameActionId: string | number): number | undefined {
  try {
    const overview = appStore?.GetAppOverviewByGameID?.(rawGameActionId);
    const appid = overview?.appid;
    return typeof appid === "number" ? appid : undefined;
  } catch (e) {
    console.error("[ProfileLauncher] GetAppOverviewByGameID failed", e);
    return undefined;
  }
}

/** appDetails arrives via a subscription, so wrap the first callback. */
export function getAppDetails(appId: number, timeoutMs = 3000): Promise<any | null> {
  return new Promise((resolve) => {
    let done = false;
    let reg: any;

    const finish = (value: any) => {
      if (done) return;
      done = true;
      try {
        reg?.unregister?.();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    try {
      reg = SteamClient.Apps.RegisterForAppDetails(appId, (details: any) =>
        setTimeout(() => finish(details ?? null), 0),
      );
    } catch (e) {
      console.error("[ProfileLauncher] RegisterForAppDetails failed", e);
      finish(null);
      return;
    }

    setTimeout(() => finish(null), timeoutMs);
  });
}

export function getOverview(appId: number): any | null {
  try {
    return appStore?.GetAppOverviewByAppID?.(appId) ?? null;
  } catch {
    return null;
  }
}

export function getAppName(appId: number): string {
  return getOverview(appId)?.display_name ?? `App ${appId}`;
}

/** TerminateApp/RunGame want the gameid string, which differs from appid for shortcuts. */
export function getGameId(appId: number): string {
  const overview = getOverview(appId);
  return String(overview?.gameid ?? appId);
}

/** Read the target + launch options for a Steam game or non-Steam shortcut. */
export async function getLaunchInfo(appId: number): Promise<AppLaunchInfo> {
  const details = await getAppDetails(appId);
  return {
    appId: String(appId),
    gameId: getGameId(appId),
    name: getAppName(appId),
    exe: details?.strShortcutExe ?? "",
    launchOptions: details?.strLaunchOptions ?? "",
  };
}

/**
 * Stop a launch that Steam has already begun. There is no clean "cancel",
 * so terminate a few times over the first second to cover the window
 * between the game action starting and the process actually existing.
 */
export function cancelLaunch(gameId: string) {
  const kill = () => {
    try {
      SteamClient.Apps.TerminateApp(gameId, false);
    } catch (e) {
      console.warn("[ProfileLauncher] TerminateApp failed", e);
    }
  };
  kill();
  setTimeout(kill, 200);
  setTimeout(kill, 600);
  setTimeout(kill, 1200);
}

export function runGame(gameId: string) {
  try {
    SteamClient.Apps.RunGame(gameId, "", -1, 100);
  } catch (e) {
    console.error("[ProfileLauncher] RunGame failed", e);
  }
}

/** Every app the library knows about, installed games and shortcuts included. */
export function listLibraryApps(): { appId: number; name: string }[] {
  const seen = new Map<number, string>();
  const collections = [
    collectionStore?.localGamesCollection,
    collectionStore?.deckDesktopApps,
    collectionStore?.allAppsCollection,
  ];
  for (const collection of collections) {
    for (const app of collection?.allApps ?? []) {
      if (app?.appid && !seen.has(app.appid)) {
        seen.set(app.appid, app.display_name ?? `App ${app.appid}`);
      }
    }
  }
  return [...seen].map(([appId, name]) => ({ appId, name }));
}
