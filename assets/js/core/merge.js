/* ==========================================================
   Three-way merge for synced items.

   Given the version both devices started from (base), this
   device's version (local) and the server's newer one (remote):
   - fields only one side changed are taken from that side;
   - nested objects are merged field by field;
   - arrays and plain values are treated as a single value;
   - a field both sides changed differently is a conflict: the
     local value wins, and the remote one stays in version history.
   ========================================================== */

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

function stable(v) {
  if (v === undefined) return 'u';
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (isObj(v)) {
    return '{' + Object.keys(v).sort()
      .filter(k => v[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export function same(a, b) {
  return stable(a) === stable(b);
}

/** Returns the merged value; pushes {path, local, remote} into `conflicts`.
    `undefined` means "field absent". */
export function merge3(base, local, remote, path = [], conflicts = []) {
  if (same(local, remote)) return local;
  if (same(base, local)) return remote;
  if (same(base, remote)) return local;

  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out = {};
    const keys = new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(remote)]);
    for (const k of keys) {
      const v = merge3(b[k], local[k], remote[k], [...path, k], conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  conflicts.push({ path, local, remote });
  return local;
}

/** Merge two saved states of an item: { data, deleted }.
    An edit on either side beats a delete on the other. */
export function mergeItem(base, local, remote, conflicts = []) {
  if (!remote) return local;
  const merged = merge3(base, local, remote, [], conflicts);
  const result = { data: merged.data === undefined ? null : merged.data, deleted: !!merged.deleted };

  if (result.deleted && base) {
    const localEdited = !local.deleted && !same(base.data, local.data);
    const remoteEdited = !remote.deleted && !same(base.data, remote.data);
    if (localEdited || remoteEdited) {
      result.deleted = false;
      conflicts.push({ path: ['deleted'], local: local.deleted, remote: remote.deleted });
    }
  }
  return result;
}
