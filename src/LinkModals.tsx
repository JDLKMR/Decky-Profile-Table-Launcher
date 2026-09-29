import {
  DialogButton,
  DropdownItem,
  Focusable,
  ModalRoot,
  TextField,
  showModal,
} from "@decky/ui";
import { FC, useMemo, useRef, useState } from "react";
import { listInstalledApps } from "./steam";

export interface PickedGame {
  appId: number;
  /** The name typed in (when asked for), otherwise the game's own name. */
  name: string;
}

interface PickerProps {
  title: string;
  description?: string;
  confirmLabel: string;
  /** Also ask for a display name, pre-filled from the chosen game. */
  askName: boolean;
  /** A game that can't be picked (a game can't link to itself). */
  excludeAppId?: number;
  onResult: (picked: PickedGame | null) => void;
  closeModal?: () => void;
}

/** Choose any installed Steam or non-Steam game from a dropdown. */
const GamePickerModal: FC<PickerProps> = ({
  title,
  description,
  confirmLabel,
  askName,
  excludeAppId,
  onResult,
  closeModal,
}) => {
  const apps = useMemo(
    () => listInstalledApps().filter((a) => a.appId !== excludeAppId),
    [excludeAppId],
  );
  const options = useMemo(
    () => apps.map((a) => ({ data: a.appId, label: a.name })),
    [apps],
  );

  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const settled = useRef(false);

  const settle = (result: PickedGame | null) => {
    if (settled.current) return;
    settled.current = true;
    onResult(result);
    closeModal?.();
  };

  const selectedName = apps.find((a) => a.appId === selected)?.name ?? "";
  const finalName = askName ? name.trim() : selectedName;
  const canConfirm = selected !== null && finalName.length > 0;

  return (
    <ModalRoot onCancel={() => settle(null)} onEscKeypress={() => settle(null)}>
      <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>{title}</div>
      {description && (
        <div style={{ marginTop: "8px", opacity: 0.8 }}>{description}</div>
      )}

      {apps.length === 0 ? (
        <div style={{ marginTop: "16px", opacity: 0.8 }}>
          No installed games were found in your library.
        </div>
      ) : (
        <div style={{ marginTop: "12px" }}>
          <DropdownItem
            label="Game"
            strDefaultLabel="Choose a game…"
            rgOptions={options}
            selectedOption={selected}
            onChange={(option: any) => {
              setSelected(option.data);
              // Keep the suggested name in step with the choice, until the
              // person types their own.
              if (!nameEdited) {
                setName(apps.find((a) => a.appId === option.data)?.name ?? "");
              }
            }}
          />
        </div>
      )}

      {askName && (
        <div style={{ marginTop: "8px" }}>
          <TextField
            label="Name shown in the launch prompt"
            value={name}
            onChange={(e: any) => {
              setName(e.target.value);
              setNameEdited(true);
            }}
          />
        </div>
      )}

      <Focusable style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <DialogButton
          disabled={!canConfirm}
          onClick={() => settle({ appId: selected as number, name: finalName })}
        >
          {confirmLabel}
        </DialogButton>
        <DialogButton onClick={() => settle(null)}>Cancel</DialogButton>
      </Focusable>
    </ModalRoot>
  );
};

export function promptPickGame(
  props: Omit<PickerProps, "onResult" | "closeModal">,
): Promise<PickedGame | null> {
  return new Promise((resolve) => {
    showModal(<GamePickerModal {...props} onResult={resolve} />, window);
  });
}

interface RenameProps {
  currentName: string;
  onResult: (name: string | null) => void;
  closeModal?: () => void;
}

const RenameLinkModal: FC<RenameProps> = ({ currentName, onResult, closeModal }) => {
  const [value, setValue] = useState(currentName);
  const settled = useRef(false);

  const settle = (result: string | null) => {
    if (settled.current) return;
    settled.current = true;
    onResult(result);
    closeModal?.();
  };

  const trimmed = value.trim();

  return (
    <ModalRoot onCancel={() => settle(null)} onEscKeypress={() => settle(null)}>
      <div style={{ fontSize: "1.4em", fontWeight: "bold", marginBottom: "12px" }}>
        Rename shortcut link
      </div>

      <TextField
        label="Name shown in the launch prompt"
        value={value}
        onChange={(e: any) => setValue(e.target.value)}
      />

      <Focusable style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <DialogButton disabled={!trimmed} onClick={() => settle(trimmed)}>
          Save
        </DialogButton>
        <DialogButton onClick={() => settle(null)}>Cancel</DialogButton>
      </Focusable>
    </ModalRoot>
  );
};

export function promptLinkName(currentName: string): Promise<string | null> {
  return new Promise((resolve) => {
    showModal(<RenameLinkModal currentName={currentName} onResult={resolve} />, window);
  });
}
