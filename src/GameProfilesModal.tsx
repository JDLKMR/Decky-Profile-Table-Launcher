import { DialogButton, DropdownItem, Focusable, ModalRoot, ToggleField } from "@decky/ui";
import { FC, useEffect, useState } from "react";
import { FaPen, FaTrash } from "react-icons/fa";
import { GameConfig, ShortcutLink, TableProfile, resolveScript } from "./backend";
import { promptLinkName, promptPickGame } from "./LinkModals";
import { buildPromptEntries, hasLinks, minLinkPosition, newLinkId } from "./links";
import { gameConfig, snapshot, updateGame } from "./store";
import { getLaunchInfo, getOverview } from "./steam";
import { basename } from "./util";

const iconButtonStyle = {
  padding: "0",
  minWidth: "0",
  width: "32px",
  height: "32px",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
} as const;

interface Props {
  appId: string;
  fallbackName?: string;
  closeModal?: () => void;
}

/**
 * Per-game settings, opened from the QAM. A game's script profiles — their
 * names and order — come from its own script, re-read fresh every time this
 * opens (same as every launch), so there's nothing to edit for those; this
 * shows the prompt as it will appear. What's configurable here: whether
 * prompting happens at all, and this game's shortcut links.
 */
const GameProfilesModal: FC<Props> = ({ appId, fallbackName, closeModal }) => {
  const settings = snapshot();
  const initial = gameConfig(appId);

  const [config, setConfig] = useState<GameConfig | undefined>(initial);
  const [ready, setReady] = useState(!!(initial?.detected || hasLinks(initial)));
  const [loaded, setLoaded] = useState(false);
  const [scriptPath, setScriptPath] = useState(initial?.script ?? "");
  const [profiles, setProfiles] = useState<TableProfile[]>([]);
  const [name, setName] = useState(initial?.name || fallbackName || `App ${appId}`);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const info = await getLaunchInfo(Number(appId));
        const script = await resolveScript(info.exe, info.launchOptions);
        if (cancelled) return;

        setName(info.name || name);

        if (script.path) {
          const entry = await updateGame(appId, {
            name: info.name,
            script: script.path,
            detected: true,
            enabled: gameConfig(appId)?.enabled ?? settings?.askByDefault ?? true,
          });
          if (cancelled) return;
          setScriptPath(script.path);
          setProfiles(script.profiles);
          setConfig(entry);
        } else {
          setScriptPath("");
          setProfiles([]);
        }
      } catch (e) {
        console.error("[ProfileLauncher] game lookup failed", e);
      } finally {
        if (!cancelled) {
          setReady(true);
          setLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appId]);

  const links = config?.links ?? [];
  const entries = buildPromptEntries(profiles, links);
  const minPosition = minLinkPosition(profiles);

  // Read the latest links from the store rather than a render's closure, so
  // two quick edits in a row can't overwrite each other.
  const latestLinks = (): ShortcutLink[] => gameConfig(appId)?.links ?? [];
  const saveLinks = async (next: ShortcutLink[]) =>
    setConfig(await updateGame(appId, { links: next }));

  const addLink = async () => {
    const picked = await promptPickGame({
      title: "Add shortcut link",
      description:
        "Pick a game for this one's launch prompt to open. It will show up alongside the other profiles.",
      confirmLabel: "Add",
      askName: true,
      excludeAppId: Number(appId),
    });
    if (!picked) return;
    await saveLinks([
      ...latestLinks(),
      { id: newLinkId(), targetAppId: picked.appId, name: picked.name },
    ]);
  };

  const renameLink = async (link: ShortcutLink) => {
    const next = await promptLinkName(link.name);
    if (next === null) return;
    await saveLinks(latestLinks().map((l) => (l.id === link.id ? { ...l, name: next } : l)));
  };

  const removeLink = async (link: ShortcutLink) => {
    await saveLinks(latestLinks().filter((l) => l.id !== link.id));
  };

  const setPosition = async (link: ShortcutLink, position: number) => {
    await saveLinks(
      latestLinks().map((l) => {
        if (l.id !== link.id) return l;
        const { position: _drop, ...rest } = l;
        return position > 0 ? { ...rest, position } : rest;
      }),
    );
  };

  // Numbers a link can take. With no script profiles, Default holds number 1,
  // so links start at 2.
  const positionOptions = [
    { data: 0, label: "Last (default)" },
    ...Array.from({ length: Math.max(0, entries.length - minPosition + 1) }, (_, i) => ({
      data: minPosition + i,
      label: String(minPosition + i),
    })),
  ];

  return (
    <ModalRoot onCancel={closeModal} onEscKeypress={closeModal}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>Game Settings</div>
        <div style={{ opacity: 0.7, fontSize: "0.9em" }}>
          {name}
          {scriptPath ? ` · ${basename(scriptPath)}` : ""}
        </div>
      </div>

      {!ready && (
        <div style={{ marginTop: "16px", opacity: 0.7 }}>Looking up launch options…</div>
      )}

      {ready && (
        <>
          <div style={{ marginTop: "16px" }}>
            <ToggleField
              label="Prompt for a profile on launch"
              checked={config?.enabled ?? true}
              onChange={async (enabled: boolean) =>
                setConfig(await updateGame(appId, { enabled }))
              }
            />
          </div>

          <div style={{ marginTop: "16px", marginBottom: "4px", opacity: 0.7 }}>
            Launch prompt, as it will appear
          </div>

          {entries.length > 0 ? (
            <Focusable style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {entries.map((entry, index) => (
                <div key={entry.key} style={{ padding: "6px 0", opacity: 0.9 }}>
                  {index + 1}. {entry.label}
                  {entry.kind !== "profile" && (
                    <span style={{ opacity: 0.5, fontSize: "0.85em", marginLeft: "8px" }}>
                      {entry.kind === "link" ? "shortcut" : "this game"}
                    </span>
                  )}
                </div>
              ))}
            </Focusable>
          ) : (
            loaded && (
              <div style={{ opacity: 0.8 }}>
                {scriptPath
                  ? "No PROFILE_NAMES table found yet. Add one to this script, or add a shortcut link below, to enable the launch prompt."
                  : "This game doesn't use a .sh script. Add a shortcut link below and its launch prompt will offer the game itself first, then your links."}
              </div>
            )
          )}

          <div style={{ marginTop: "16px", marginBottom: "4px", opacity: 0.7 }}>
            Shortcut links
          </div>

          {links.map((link) => {
            const target = getOverview(link.targetAppId);
            const shownPosition = link.position
              ? Math.max(link.position, minPosition)
              : 0;
            return (
              <div key={link.id} style={{ marginBottom: "8px" }}>
                <Focusable style={{ display: "flex", alignItems: "center", gap: "2px" }}>
                  <div style={{ flexGrow: 1, minWidth: 0, padding: "4px 0" }}>
                    <div>{link.name}</div>
                    <div style={{ opacity: 0.6, fontSize: "0.85em" }}>
                      {target
                        ? `Opens ${target.display_name}`
                        : "Linked game not found in your library"}
                    </div>
                  </div>
                  <DialogButton
                    onClick={() => void renameLink(link)}
                    style={iconButtonStyle}
                  >
                    <FaPen size={11} />
                  </DialogButton>
                  <DialogButton
                    onClick={() => void removeLink(link)}
                    style={iconButtonStyle}
                  >
                    <FaTrash size={11} />
                  </DialogButton>
                </Focusable>
                <DropdownItem
                  label="Number in launch prompt"
                  rgOptions={positionOptions}
                  selectedOption={shownPosition}
                  strDefaultLabel={shownPosition ? String(shownPosition) : "Last (default)"}
                  onChange={(option: any) => void setPosition(link, option.data)}
                />
              </div>
            );
          })}

          <DialogButton onClick={() => void addLink()}>Add shortcut link...</DialogButton>
        </>
      )}

      <Focusable style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <DialogButton onClick={closeModal}>Close</DialogButton>
      </Focusable>
    </ModalRoot>
  );
};

export default GameProfilesModal;
