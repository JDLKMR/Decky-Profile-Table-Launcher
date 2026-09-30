import { toaster } from "@decky/api";
import { resolveScript, writeProfile } from "./backend";
import { LinkEntry, buildPromptEntries, hasLinks, pickDefaultKey } from "./links";
import { promptForProfile } from "./ProfileModal";
import { gameConfig, hasNoScript, markNoScript, snapshot, updateGame } from "./store";
import {
  cancelLaunch,
  getGameId,
  getLaunchInfo,
  getOverview,
  resolveAppId,
  runGame,
} from "./steam";
import { basename } from "./util";

/** appIds we relaunched ourselves — their next GameActionStart passes through. */
const bypass = new Set<string>();
/** appIds currently being prompted, so a double-fire cannot stack modals. */
const busy = new Set<string>();

function toast(title: string, body: string) {
  try {
    toaster.toast({ title, body });
  } catch {
    console.log(`[ProfileLauncher] ${title}: ${body}`);
  }
}

export function registerLaunchInterceptor(): () => void {
  let registration: any;
  try {
    registration = SteamClient.Apps.RegisterForGameActionStart(
      (_actionType: number, rawGameActionId: string, action: string) => {
        void onGameActionStart(rawGameActionId, action);
      },
    );
  } catch (e) {
    console.error("[ProfileLauncher] could not hook game launches", e);
    return () => {};
  }

  return () => {
    try {
      registration?.unregister?.();
    } catch {
      /* ignore */
    }
  };
}

async function onGameActionStart(rawGameActionId: string, action: string) {
  if (action !== "LaunchApp") return;

  // The value Steam hands this callback is a GameID, not an AppID — see
  // resolveAppId's comment. Everything from here on keys off the real AppID,
  // matching what the QAM, config storage, and script resolution all expect.
  const resolvedAppId = resolveAppId(rawGameActionId);
  if (typeof resolvedAppId !== "number") {
    console.warn(
      "[ProfileLauncher] couldn't resolve an AppID for game action",
      rawGameActionId,
    );
    return;
  }
  const appId = String(resolvedAppId);

  // Our own relaunch — let it through.
  if (bypass.has(appId)) {
    bypass.delete(appId);
    return;
  }
  if (busy.has(appId)) return;

  const config = gameConfig(appId);

  if (config) {
    // Prompting switched off: do nothing.
    if (!config.enabled) return;
    // Known to have no script, and no shortcut links to offer either.
    if (!config.detected && !hasLinks(config)) return;

    // A .sh game, a game with shortcut links, or both: stop the launch
    // immediately, then take our time.
    busy.add(appId);
    cancelLaunch(getGameId(Number(appId)));
    try {
      await handleLaunch(appId);
    } finally {
      busy.delete(appId);
    }
    return;
  }

  // Never configured and already known to have no script.
  if (hasNoScript(appId)) return;

  // First time we've seen this app. Look it up before deciding, and only
  // interrupt if a script actually turns up. The first launch of a new
  // .sh game therefore gets killed a beat late; after that it is cached.
  busy.add(appId);
  try {
    const info = await getLaunchInfo(Number(appId));
    const script = await resolveScript(info.exe, info.launchOptions);

    if (!script.path) {
      markNoScript(appId);
      return;
    }

    await updateGame(appId, {
      name: info.name,
      script: script.path,
      detected: true,
      enabled: snapshot()?.askByDefault ?? true,
    });

    cancelLaunch(info.gameId);
    await handleLaunch(appId, info.gameId);
  } finally {
    busy.delete(appId);
  }
}

async function handleLaunch(appId: string, knownGameId?: string) {
  const settings = snapshot();
  const variable = settings?.variable ?? "PROFILE";

  const info = await getLaunchInfo(Number(appId));
  const gameId = knownGameId ?? info.gameId;

  // Re-resolve every time: launch options may have changed since we cached,
  // and the script's own PROFILE_NAMES table is the live source of truth for
  // which profiles exist, their names, and their order — never cached here,
  // so an edit to the script shows up on the very next launch.
  const script = await resolveScript(info.exe, info.launchOptions);

  const config = gameConfig(appId);
  const links = config?.links ?? [];
  const scriptUsable = !!script.path && script.exists && script.profiles.length > 0;

  if (!scriptUsable && !links.length) {
    // Nothing to offer: launch normally, saying why if there's something to fix.
    if (!script.path) {
      await updateGame(appId, { detected: false, enabled: false, script: "" });
    } else if (!script.exists) {
      toast("Profile Launcher", `Script not found: ${script.path}`);
    } else {
      await updateGame(appId, { name: info.name, script: script.path, detected: true });
      toast(
        "Profile Launcher",
        `No PROFILE_NAMES table found in ${basename(script.path)} — launching unchanged.`,
      );
    }
    relaunch(appId, gameId);
    return;
  }

  // The shortcut links are still worth offering, but a script that's
  // referenced and missing is worth flagging.
  if (script.path && !script.exists) {
    toast("Profile Launcher", `Script not found: ${script.path}`);
  }

  // One list: the script's profiles in table order, then shortcut links
  // (each placed by its number override, or last, alphabetically).
  const entries = buildPromptEntries(
    scriptUsable ? script.profiles : [],
    links,
    config?.defaultName,
  );
  const defaultKey = pickDefaultKey(entries, config);

  const choice = await promptForProfile({
    gameName: info.name,
    scriptName: scriptUsable ? basename(script.path) : "",
    variable,
    currentValue: scriptUsable ? script.value : null,
    entries,
    defaultKey,
  });

  const picked = choice.entry;
  await updateGame(appId, {
    name: info.name,
    ...(scriptUsable ? { script: script.path, detected: true } : {}),
    enabled: choice.keepAsking,
    ...(picked?.kind === "profile" ? { lastProfile: picked.value, lastLinkId: null } : {}),
    ...(picked?.kind === "default" ? { lastLinkId: null } : {}),
    ...(picked?.kind === "link" ? { lastLinkId: picked.linkId } : {}),
  });

  if (!picked) {
    if (choice.skipWrite) relaunch(appId, gameId);
    return; // cancelled: leave the game closed
  }

  if (picked.kind === "link") {
    launchLink(picked);
    return;
  }

  if (picked.kind === "default") {
    // Just this game, opened normally — no script to touch.
    relaunch(appId, gameId);
    return;
  }

  if (!script.hasVariable) {
    toast(
      "Profile Launcher",
      `No ${variable}= line in ${basename(script.path)} — nothing to change.`,
    );
    relaunch(appId, gameId);
    return;
  }

  const result = await writeProfile(script.path, picked.value);
  if (!result.ok) {
    toast("Profile Launcher — not launched", result.error ?? "Could not update the script.");
    return;
  }

  relaunch(appId, gameId);
}

/**
 * Open the linked game instead of running this game's script. Starting it
 * goes through the same launch hook as any other game, so if the linked game
 * has its own profile prompt, that prompt appears as usual.
 */
function launchLink(entry: LinkEntry) {
  if (!getOverview(entry.targetAppId)) {
    toast("Profile Launcher", `Linked game not found: ${entry.label}`);
    return;
  }
  runGame(getGameId(entry.targetAppId));
}

function relaunch(appId: string, gameId: string) {
  bypass.add(appId);
  // Give Steam a moment to finish tearing down the cancelled game action.
  setTimeout(() => {
    runGame(gameId);
    // Safety net: if the launch never reaches us, clear the bypass.
    setTimeout(() => bypass.delete(appId), 10000);
  }, 400);
}
