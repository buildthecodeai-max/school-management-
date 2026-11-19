import { PERMISSIONS, PERMISSION_GROUPS, type PermissionKey } from "@/lib/permissions";
import { isPlatformPermission } from "@/lib/access";

/** Checklist of school permissions grouped as in the catalog. `locked` ones are shown but cannot be ticked. */
export function PermissionPicker({ selected = [], locked = [], readOnly = false }: { selected?: readonly string[]; locked?: readonly string[]; readOnly?: boolean }) {
  return (
    <div className="space-y-4">
      {PERMISSION_GROUPS.map((g) => {
        const keys = g.keys.filter((k) => !isPlatformPermission(k));
        if (keys.length === 0) return null;
        return (
          <fieldset key={g.label} className="rounded-lg border border-[color:var(--color-line)] p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">{g.label}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {keys.map((k: PermissionKey) => {
                const isLocked = locked.includes(k);
                return (
                  <label key={k} className={`flex items-start gap-2 text-sm ${isLocked ? "opacity-50" : ""}`} title={isLocked ? "You do not hold this permission, so you cannot give it." : undefined}>
                    <input type="checkbox" name="permissions" value={k} defaultChecked={selected.includes(k)} disabled={readOnly || isLocked} className="mt-1" />
                    <span><span className="font-mono text-xs">{k}</span><span className="block text-xs text-[color:var(--color-muted)]">{PERMISSIONS[k]}</span></span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
