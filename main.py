import fnmatch
import json
import os
import re
import shlex
import tempfile

import decky

SETTINGS_DIR = decky.DECKY_PLUGIN_SETTINGS_DIR
SETTINGS_FILE = os.path.join(SETTINGS_DIR, "settings.json")

DEFAULTS = {
    "version": 2,
    # Name of the shell variable that gets rewritten inside the script.
    "variable": "PROFILE",
    # Whether a newly-detected game prompts by default.
    "askByDefault": True,
    # Script names never treated as profile scripts. Matched against the
    # basename (case-insensitive, glob allowed: "launch.sh", "start-*.sh").
    # A pattern containing "/" is matched against the full path instead.
    "excludedScripts": [],
    # Keep a one-time .bak of each script the first time we touch it.
    "backup": True,
    # appid (as string) -> {"name": str, "script": str, "enabled": bool,
    #                        "lastProfile": int, "detected": bool}
    # Which profiles a game offers, their names, and their order all come
    # straight from that game's own script (its PROFILE_NAMES table),
    # re-read on every launch — nothing about that is stored here.
    "games": {},
}


def _profile_pattern(var: str) -> "re.Pattern[str]":
    """Matches an assignment line like `PROFILE=2`, `export PROFILE="2"`,
    `PROFILE=3  # comment`. Commented-out lines are not matched."""
    return re.compile(
        r'^(?P<prefix>[ \t]*(?:export[ \t]+)?'
        + re.escape(var)
        + r'[ \t]*=[ \t]*)'
        r'(?P<quote>["\']?)(?P<value>.*?)(?P=quote)'
        r'(?P<suffix>[ \t]*(?:\#.*)?)$',
        re.MULTILINE,
    )


_PROFILE_NAMES_START_RE = re.compile(r'declare\s+-A\s+PROFILE_NAMES\s*=\s*\(')
_PROFILE_NAMES_ENTRY_RE = re.compile(
    r'\[\s*(?P<key>\d+)\s*\]\s*=\s*'
    r'(?:"(?P<dq>(?:[^"\\]|\\.)*)"'
    r"|'(?P<sq>[^']*)'"
    r'|(?P<bare>[^\s)]+))'
)


def _find_array_body(text: str, start: int) -> str:
    """Return the `declare -A ...=( ... )` body starting right after the
    opening '(', stopping at the first ')' that isn't inside a quoted
    string — so a profile name like "Archipelago (v2)" doesn't truncate
    the array early."""
    i, n, quote = start, len(text), None
    while i < n:
        ch = text[i]
        if quote:
            if ch == "\\" and i + 1 < n:
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
        elif ch == ")":
            return text[start:i]
        i += 1
    return text[start:]  # unterminated array; use what's there


def _parse_profile_table(text: str):
    """Read a script's `declare -A PROFILE_NAMES=(...)` table and return
    [[number, name], ...] in the order the entries appear in the file. That
    textual order is all that matters here — bash's own associative-array
    iteration order is a runtime concern the script never relies on for
    display, since the plugin only ever reads this as source text, never
    executes it. A duplicate key keeps its first position but takes its
    last value, matching a plain bash reassignment."""
    start = _PROFILE_NAMES_START_RE.search(text)
    if not start:
        return []
    body = _find_array_body(text, start.end())

    order, names = [], {}
    for entry in _PROFILE_NAMES_ENTRY_RE.finditer(body):
        key = int(entry.group("key"))
        value = entry.group("dq")
        if value is not None:
            value = value.replace('\\"', '"').replace("\\\\", "\\")
        else:
            value = entry.group("sq")
            if value is None:
                value = entry.group("bare")
        value = (value or "").strip()
        if not value:
            continue
        if key not in names:
            order.append(key)
        names[key] = value

    return [{"value": k, "label": names[k]} for k in order]


def _read_text(path: str) -> str:
    # newline="" keeps CRLF files intact on write-back.
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def _atomic_write(path: str, text: str) -> None:
    directory = os.path.dirname(path) or "."
    mode = os.stat(path).st_mode & 0o7777
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".launchprofiles-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def _script_candidates(text: str):
    """Pull every .sh-looking token out of a launch-options / target string."""
    if not text:
        return []
    try:
        parts = shlex.split(text, posix=True)
    except ValueError:
        parts = text.replace('"', " ").replace("'", " ").split()

    out = []
    for part in parts:
        part = part.strip().strip('"').strip("'")
        if not part or part == "%command%":
            continue
        # strips things like `bash /path/foo.sh` -> keeps the .sh token only
        if part.lower().endswith(".sh"):
            out.append(os.path.expanduser(part))
    return out


def _is_excluded(path: str, patterns) -> bool:
    """Match a script against the user's exclusion patterns. Patterns with a
    slash match the whole path; otherwise just the file name."""
    if not patterns:
        return False
    base = os.path.basename(path).lower()
    full = path.lower()
    for pattern in patterns:
        pattern = (pattern or "").strip().lower()
        if not pattern:
            continue
        target = full if "/" in pattern else base
        if target == pattern or fnmatch.fnmatch(target, pattern):
            return True
    return False


class Plugin:
    settings = dict(DEFAULTS)

    async def _main(self):
        os.makedirs(SETTINGS_DIR, exist_ok=True)
        self.settings = self._load()
        decky.logger.info("Profile Launcher backend ready (%s games known)",
                          len(self.settings.get("games", {})))

    async def _unload(self):
        self._save()

    async def _uninstall(self):
        pass

    # ---------- settings ----------

    def _load(self):
        merged = json.loads(json.dumps(DEFAULTS))
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                stored = json.load(f)
            if isinstance(stored, dict):
                merged.update(stored)
        except FileNotFoundError:
            pass
        except Exception as exc:
            decky.logger.warning("Bad settings file, using defaults: %s", exc)
        if not isinstance(merged.get("games"), dict):
            merged["games"] = {}
        return merged

    def _save(self):
        try:
            os.makedirs(SETTINGS_DIR, exist_ok=True)
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(self.settings, f, indent=2)
        except Exception as exc:
            decky.logger.error("Could not save settings: %s", exc)

    async def get_settings(self):
        return self.settings

    async def set_settings(self, patch: dict):
        """Shallow-merge top-level keys (profiles, variable, askByDefault...)."""
        for key, value in (patch or {}).items():
            if key == "games":
                continue
            self.settings[key] = value
        self._save()
        return self.settings

    async def set_game_config(self, app_id, patch: dict):
        app_id = str(app_id)
        games = self.settings.setdefault("games", {})
        entry = games.get(app_id, {
            "name": "",
            "script": "",
            "enabled": bool(self.settings.get("askByDefault", True)),
            "lastProfile": 1,
            "detected": False,
        })
        entry.update(patch or {})
        games[app_id] = entry
        self._save()
        return entry

    async def forget_game(self, app_id):
        self.settings.get("games", {}).pop(str(app_id), None)
        self._save()
        return self.settings

    # ---------- script handling ----------

    async def resolve_script(self, exe: str = "", launch_options: str = ""):
        """Find the .sh referenced by a game's target and/or launch options."""
        candidates = _script_candidates(launch_options) + _script_candidates(exe)

        # Drop excluded names first, so a game referencing both an excluded
        # helper and a real profile script still resolves to the latter.
        patterns = self.settings.get("excludedScripts", [])
        kept = [c for c in candidates if not _is_excluded(c, patterns)]
        if candidates and not kept:
            return {
                "path": "", "exists": False, "hasVariable": False,
                "value": None, "excluded": True, "profiles": [],
            }
        candidates = kept

        chosen = ""
        for path in candidates:
            if os.path.isfile(path):
                chosen = path
                break
        if not chosen and candidates:
            chosen = candidates[0]

        if not chosen:
            return {
                "path": "", "exists": False, "hasVariable": False,
                "value": None, "excluded": False, "profiles": [],
            }

        result = {
            "path": chosen,
            "exists": os.path.isfile(chosen),
            "hasVariable": False,
            "value": None,
            "excluded": False,
            "profiles": [],
        }
        if result["exists"]:
            try:
                text = _read_text(chosen)
            except Exception as exc:
                result["error"] = str(exc)
                return result
            var = self.settings.get("variable", "PROFILE")
            match = _profile_pattern(var).search(text)
            if match:
                result["hasVariable"] = True
                result["value"] = match.group("value")
            result["profiles"] = _parse_profile_table(text)
        return result

    async def read_profile(self, path: str):
        var = self.settings.get("variable", "PROFILE")
        try:
            match = _profile_pattern(var).search(_read_text(path))
        except Exception as exc:
            return {"hasVariable": False, "value": None, "error": str(exc)}
        if not match:
            return {"hasVariable": False, "value": None}
        return {"hasVariable": True, "value": match.group("value")}

    async def write_profile(self, path: str, value):
        """Rewrite the first `VAR=` assignment in the script, keeping quoting,
        indentation, `export`, trailing comments and file permissions."""
        var = self.settings.get("variable", "PROFILE")
        if value is None:
            return {"ok": False, "error": "No profile value was provided to write"}
        value = str(value)

        if not os.path.isfile(path):
            return {"ok": False, "error": "Script not found: %s" % path}

        try:
            text = _read_text(path)
        except Exception as exc:
            return {"ok": False, "error": "Could not read script: %s" % exc}

        pattern = _profile_pattern(var)
        match = pattern.search(text)
        if not match:
            return {
                "ok": False,
                "error": "No %s= line found in %s" % (var, os.path.basename(path)),
            }

        if match.group("value") == value:
            return {"ok": True, "unchanged": True, "value": value}

        replaced = False

        def _sub(m):
            nonlocal replaced
            if replaced:
                return m.group(0)
            replaced = True
            return "%s%s%s%s%s" % (
                m.group("prefix"), m.group("quote"), value,
                m.group("quote"), m.group("suffix"),
            )

        new_text = pattern.sub(_sub, text)

        if self.settings.get("backup", True):
            backup = path + ".launchprofiles.bak"
            if not os.path.exists(backup):
                try:
                    with open(backup, "w", encoding="utf-8", newline="") as f:
                        f.write(text)
                except Exception as exc:
                    decky.logger.warning("Backup failed for %s: %s", path, exc)

        try:
            _atomic_write(path, new_text)
        except PermissionError:
            return {"ok": False, "error": "No write permission for %s" % path}
        except Exception as exc:
            return {"ok": False, "error": "Could not write script: %s" % exc}

        decky.logger.info("Set %s=%s in %s", var, value, path)
        return {"ok": True, "value": value}
