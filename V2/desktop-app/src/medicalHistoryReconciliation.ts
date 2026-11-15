export type MedicalHistoryPayload = Record<string, unknown>;
export type ConflictDecision = "current" | "incoming";

export interface MedicalHistoryConflict {
  path: string;
  groupLabel: string;
  fieldLabel: string;
  currentValue: unknown;
  incomingValue: unknown;
}

export interface MedicalHistoryReconciliation {
  merged: MedicalHistoryPayload;
  conflicts: MedicalHistoryConflict[];
  autoMergedCount: number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

function normalized(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => normalized(item)).sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    );
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => !isEmpty(item))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalized(item)])
    );
  }
  return value;
}

function valuesEqual(first: unknown, second: unknown): boolean {
  return JSON.stringify(normalized(first)) === JSON.stringify(normalized(second));
}

function getAtPath(root: MedicalHistoryPayload, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isPlainObject(current)) return undefined;
    return current[key];
  }, root);
}

function setAtPath(root: MedicalHistoryPayload, path: string, value: unknown) {
  const keys = path.split(".");
  let cursor: MedicalHistoryPayload = root;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = clone(value);
      return;
    }
    if (!isPlainObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as MedicalHistoryPayload;
  });
}

function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function reconcileMedicalHistories(
  current: MedicalHistoryPayload,
  incoming: MedicalHistoryPayload
): MedicalHistoryReconciliation {
  const merged = clone(current);
  const conflicts: MedicalHistoryConflict[] = [];
  let autoMergedCount = 0;

  function visit(value: unknown, pathParts: string[]) {
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, [...pathParts, key]);
      }
      return;
    }
    if (isEmpty(value)) return;

    const path = pathParts.join(".");
    const currentValue = getAtPath(current, path);
    if (isEmpty(currentValue)) {
      setAtPath(merged, path, value);
      autoMergedCount += 1;
      return;
    }
    if (valuesEqual(currentValue, value)) return;

    conflicts.push({
      path,
      groupLabel: humanize(pathParts[0] ?? "Antecedentes"),
      fieldLabel: humanize(pathParts[pathParts.length - 1] ?? path),
      currentValue: clone(currentValue),
      incomingValue: clone(value)
    });
  }

  visit(incoming, []);
  return { merged, conflicts, autoMergedCount };
}

export function applyConflictDecisions(
  merged: MedicalHistoryPayload,
  conflicts: MedicalHistoryConflict[],
  decisions: Record<string, ConflictDecision>
): MedicalHistoryPayload {
  const result = clone(merged);
  for (const conflict of conflicts) {
    const decision = decisions[conflict.path];
    if (!decision) continue;
    setAtPath(
      result,
      conflict.path,
      decision === "incoming" ? conflict.incomingValue : conflict.currentValue
    );
  }
  return result;
}
