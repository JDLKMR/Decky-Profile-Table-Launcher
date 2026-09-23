import { DialogButton, Focusable, ModalRoot, ToggleField, showModal } from "@decky/ui";
import { FC, useRef, useState } from "react";

export interface ProfileOption {
  /** The real profile number — what gets written into the script. */
  value: number;
  label: string;
}

export interface ProfileChoice {
  /** The profile number chosen, or null if the launch was cancelled. */
  profile: number | null;
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
  /** Parsed fresh from the script's own PROFILE_NAMES table, in file order. */
  options: ProfileOption[];
  /** Profile number to pre-select, or null if none applies. */
  defaultValue: number | null;
  onResult: (choice: ProfileChoice) => void;
  closeModal?: () => void;
}

const ProfileModal: FC<Props> = ({
  gameName,
  scriptName,
  variable,
  currentValue,
  options,
  defaultValue,
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
      onCancel={() => settle({ profile: null, keepAsking })}
      onEscKeypress={() => settle({ profile: null, keepAsking })}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>Choose a profile</div>
        <div style={{ opacity: 0.7, fontSize: "0.9em" }}>
          {gameName} &middot; {scriptName}
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
        {options.map((option, index) => {
          const displayNumber = index + 1;
          const isDefault = option.value === defaultValue;
          return (
            <DialogButton
              key={option.value}
              // @ts-expect-error autoFocus isn't in @decky/ui's DialogButtonProps
              // typing, but the component forwards unknown props to the
              // underlying <button>, and Steam's controller navigation on
              // Deck follows native DOM focus — so this genuinely gives the
              // last-used profile initial gamepad focus.
              autoFocus={isDefault}
              onClick={() => settle({ profile: option.value, keepAsking })}
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <span>
                {displayNumber}. {option.label}
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
          onClick={() => settle({ profile: null, keepAsking, skipWrite: true })}
        >
          Launch unchanged
        </DialogButton>
        <DialogButton onClick={() => settle({ profile: null, keepAsking })}>
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
