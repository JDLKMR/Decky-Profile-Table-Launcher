import { DialogButton, Focusable, ModalRoot, ToggleField, showModal } from "@decky/ui";
import { FC, useRef, useState } from "react";
import type { PromptEntry } from "./links";

export interface ProfileChoice {
  /** What was picked, or null if the launch was cancelled or left unchanged. */
  entry: PromptEntry | null;
  /** false = stop prompting for this game from now on. */
  keepAsking: boolean;
  /** true = launch without touching the script. */
  skipWrite?: boolean;
}

interface Props {
  gameName: string;
  scriptName: string;
  variable: string;
  currentValue: string | null;
  /** Script profiles and shortcut links, already merged and ordered. */
  entries: PromptEntry[];
  /** Key of the entry to pre-select, or null if none applies. */
  defaultKey: string | null;
  onResult: (choice: ProfileChoice) => void;
  closeModal?: () => void;
}

const ProfileModal: FC<Props> = ({
  gameName,
  scriptName,
  variable,
  currentValue,
  entries,
  defaultKey,
  onResult,
  closeModal,
}) => {
  const [keepAsking, setKeepAsking] = useState(true);
  const settled = useRef(false);

  const settle = (choice: ProfileChoice) => {
    if (settled.current) return;
    settled.current = true;
    onResult(choice);
    closeModal?.();
  };

  return (
    <ModalRoot
      onCancel={() => settle({ entry: null, keepAsking })}
      onEscKeypress={() => settle({ entry: null, keepAsking })}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>Choose a profile</div>
        <div style={{ opacity: 0.7, fontSize: "0.9em" }}>
          {gameName}
          {scriptName ? ` · ${scriptName}` : ""}
          {currentValue !== null ? ` (currently ${variable}=${currentValue})` : ""}
        </div>
      </div>

      <Focusable
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginTop: "16px",
        }}
      >
        {entries.map((entry, index) => {
          const displayNumber = index + 1;
          const isDefault = entry.key === defaultKey;
          return (
            <DialogButton
              key={entry.key}
              // @ts-expect-error autoFocus isn't in @decky/ui's DialogButtonProps
              // typing, but the component forwards unknown props to the
              // underlying <button>, and Steam's controller navigation on
              // Deck follows native DOM focus — so this genuinely gives the
              // last-used profile initial gamepad focus.
              autoFocus={isDefault}
              onClick={() => settle({ entry, keepAsking })}
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <span>
                {displayNumber}. {entry.label}
              </span>
              {isDefault && (
                <span style={{ opacity: 0.6, fontSize: "0.85em" }}>last used</span>
              )}
            </DialogButton>
          );
        })}
      </Focusable>

      <div style={{ marginTop: "16px" }}>
        <ToggleField
          label="Ask every time for this game"
          description="Turn this off to keep launching with the profile you pick now. You can turn it back on from the Profile Launcher menu."
          checked={keepAsking}
          onChange={setKeepAsking}
        />
      </div>

      <Focusable
        style={{ display: "flex", gap: "8px", marginTop: "8px" }}
        flow-children="horizontal"
      >
        <DialogButton
          onClick={() => settle({ entry: null, keepAsking, skipWrite: true })}
        >
          Launch unchanged
        </DialogButton>
        <DialogButton onClick={() => settle({ entry: null, keepAsking })}>
          Cancel launch
        </DialogButton>
      </Focusable>
    </ModalRoot>
  );
};

export function promptForProfile(
  props: Omit<Props, "onResult" | "closeModal">,
): Promise<ProfileChoice> {
  return new Promise((resolve) => {
    showModal(<ProfileModal {...props} onResult={resolve} />, window);
  });
}

export default ProfileModal;
