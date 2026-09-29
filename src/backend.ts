import { call } from "@decky/api";

/**
 * A link that lets a game's launch prompt open another Steam or non-Steam
 * shortcut instead of running that game's script.
 */
export interface ShortcutLink {
  /** Stable identifier, so renaming or reordering never loses track of it. */
  id: string;
  /** AppID of the game this link opens. */
  targetAppId: number;
  /** Name shown in the launch prompt — chosen when added, renameable later. */
  name: string;
  /**
   * Optional 1-based number this link should take in the launch prompt.
   * Missing = default, which puts it after every script profile.
   */
  position?: number;
}

export interface GameConfig {
  name: string;
  script: string;
  enabled: boolean;
  lastProfile: number;
  detected: boolean;
  /** Shortcut links offered alongside (or instead of) the script's profiles. */
  links?: ShortcutLink[];
  /** Set when the last thing picked was a link rather than a script profile. */
  lastLinkId?: string | null;
}

export interface Settings {
  version: number;
  variable: string;
  askByDefault: boolean;
  backup: boolean;
  /** Script names never treated as profile scripts (glob allowed). */
  excludedScripts: string[];
  games: Record<string, GameConfig>;
}

/** One entry from a script's own PROFILE_NAMES table. */
export interface TableProfile {
  /** The real profile number — what gets written into the script. */
  value: number;
  label: string;
}

export interface ScriptInfo {
  path: string;
  exists: boolean;
  hasVariable: boolean;
  value: string | null;
  /** True when a .sh was found but every candidate was excluded by name. */
  excluded?: boolean;
  /**
   * Parsed fresh from this script's own `declare -A PROFILE_NAMES=(...)`
   * table, in the order the entries appear in the file. Empty if the script
   * has no such table yet.
   */
  profiles: TableProfile[];
}

export interface WriteResult {
  ok: boolean;
  value?: string;
  unchanged?: boolean;
  error?: string;
}

export const getSettings = () => call<[], Settings>("get_settings");

export const setSettings = (patch: Partial<Settings>) =>
  call<[Partial<Settings>], Settings>("set_settings", patch);

export const setGameConfig = (appId: string, patch: Partial<GameConfig>) =>
  call<[string, Partial<GameConfig>], GameConfig>("set_game_config", appId, patch);

export const forgetGame = (appId: string) =>
  call<[string], Settings>("forget_game", appId);

export const resolveScript = (exe: string, launchOptions: string) =>
  call<[string, string], ScriptInfo>("resolve_script", exe, launchOptions);

export const writeProfile = (path: string, value: number) =>
  call<[string, number], WriteResult>("write_profile", path, value);
