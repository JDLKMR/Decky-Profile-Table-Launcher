/** Translate a shell-style glob ("start-*.sh", "launch?.sh") into a regex. */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const source = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${source}$`, "i");
}

/**
 * Mirrors `_is_excluded` in main.py: patterns containing a slash match the
 * whole path, everything else matches the file name only.
 */
export function isExcluded(path: string, patterns: string[] | undefined): boolean {
  if (!path || !patterns?.length) return false;
  const base = (path.split("/").pop() ?? path).toLowerCase();
  const full = path.toLowerCase();

  return patterns.some((raw) => {
    const pattern = (raw ?? "").trim().toLowerCase();
    if (!pattern) return false;
    const target = pattern.includes("/") ? full : base;
    return target === pattern || globToRegExp(pattern).test(target);
  });
}

export const basename = (path: string): string => path.split("/").pop() ?? path;
