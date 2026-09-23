import { call } from "@decky/api";

export interface GameConfig {
  name: string;
  script: string;
  enabled: boolean;
  lastProfile: number;
  detected: boolean;
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
