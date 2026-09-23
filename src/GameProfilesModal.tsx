import { DialogButton, Focusable, ModalRoot, ToggleField } from "@decky/ui";
import { FC, useEffect, useState } from "react";
import { GameConfig, TableProfile, resolveScript } from "./backend";
import { gameConfig, snapshot, updateGame } from "./store";
import { getLaunchInfo } from "./steam";
import { basename } from "./util";

interface Props {
  appId: string;
  fallbackName?: string;
  closeModal?: () => void;
}

/**
 * Read-only per-game view, opened from the QAM. There's nothing to edit here
 * anymore — a game's profiles, their names, and their order all come from
 * its own script, re-read fresh every time this opens (same as every
 * launch), so this just shows what the next launch prompt will show. The
 * only actual setting left is whether prompting happens at all.
 */
const GameProfilesModal: FC<Props> = ({ appId, fallbackName, closeModal }) => {
  const settings = snapshot();

  const [config, setConfig] = useState<GameConfig | undefined>(gameConfig(appId));
  const [status, setStatus] = useState<"loading" | "ready" | "none">(
    gameConfig(appId)?.detected ? "ready" : "loading",
  );
  const [scriptPath, setScriptPath] = useState(gameConfig(appId)?.script ?? "");
  const [profiles, setProfiles] = useState<TableProfile[]>([]);
  const [name, setName] = useState(
    gameConfig(appId)?.name || fallbackName || `App ${appId}`,
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const info = await getLaunchInfo(Number(appId));
        const script = await resolveScript(info.exe, info.launchOptions);
        if (cancelled) return;

        if (!script.path) {
          setName(info.name || name);
          setStatus("none");
          return;
        }

        const entry = await updateGame(appId, {
          name: info.name,
          script: script.path,
          detected: true,
          enabled: gameConfig(appId)?.enabled ?? settings?.askByDefault ?? true,
        });

        if (cancelled) return;
        setName(info.name || name);
        setScriptPath(script.path);
        setProfiles(script.profiles);
        setConfig(entry);
        setStatus("ready");
      } catch (e) {
        console.error("[ProfileLauncher] game lookup failed", e);
        if (!cancelled) setStatus("none");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appId]);

  return (
    <ModalRoot onCancel={closeModal} onEscKeypress={closeModal}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>View Profiles</div>
        <div style={{ opacity: 0.7, fontSize: "0.9em" }}>
          {name}
          {scriptPath ? ` · ${basename(scriptPath)}` : ""}
        </div>
      </div>

      {status === "loading" && (
        <div style={{ marginTop: "16px", opacity: 0.7 }}>Looking up launch options…</div>
      )}

      {status === "none" && (
        <div style={{ marginTop: "16px", opacity: 0.8 }}>
          No profile script for this game. Its launch options and target don't point
          at a .sh file, or the script's name is on the excluded list.
        </div>
      )}

      {status === "ready" && (
        <>
          <div style={{ marginTop: "16px" }}>
            <ToggleField
              label="Prompt for a profile on launch"
              checked={config?.enabled ?? true}
              onChange={async (enabled) =>
                setConfig(await updateGame(appId, { enabled }))
              }
            />
          </div>

          <div style={{ marginTop: "16px", marginBottom: "4px", opacity: 0.7 }}>
            Profiles this script currently offers
          </div>

          {profiles.length === 0 ? (
            <div style={{ opacity: 0.8 }}>
              No PROFILE_NAMES table found yet. Add one to this script to enable
              the launch prompt.
            </div>
          ) : (
            <Focusable style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {profiles.map((profile, index) => (
                <div
                  key={profile.value}
                  style={{ padding: "6px 0", opacity: 0.9 }}
                >
                  {index + 1}. {profile.label}
                </div>
              ))}
            </Focusable>
          )}
        </>
      )}

      <Focusable style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <DialogButton onClick={closeModal}>Close</DialogButton>
      </Focusable>
    </ModalRoot>
  );
};

export default GameProfilesModal;
