import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

export type StoredSecurityEntry<T> = {
  value: T;
  expiresAt: number;
};

export type SecurityStateUpdateResult<T> =
  | { kind: "set"; value: T; expiresAt: number }
  | { kind: "delete" };

export type SecurityStateStore = {
  get<T>(key: string, now: number): Promise<StoredSecurityEntry<T> | null>;
  update<T>(
    key: string,
    now: number,
    updater: (current: StoredSecurityEntry<T> | null) => SecurityStateUpdateResult<T>,
  ): Promise<StoredSecurityEntry<T> | null>;
  delete(key: string): Promise<void>;
  reset?(): Promise<void>;
};

const GLOBAL_SECURITY_STORE_KEY = "__midocSecurityStateStore";
const GLOBAL_SECURITY_MEMORY_MAP = "__midocSecurityStateStoreMemory";

function getMemoryMap() {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_SECURITY_MEMORY_MAP]?: Map<string, StoredSecurityEntry<unknown>>;
  };

  if (!globalScope[GLOBAL_SECURITY_MEMORY_MAP]) {
    globalScope[GLOBAL_SECURITY_MEMORY_MAP] = new Map<string, StoredSecurityEntry<unknown>>();
  }

  return globalScope[GLOBAL_SECURITY_MEMORY_MAP];
}

function createInMemorySecurityStore(): SecurityStateStore {
  return {
    async get<T>(key: string, now: number) {
      const entry = getMemoryMap().get(key) as StoredSecurityEntry<T> | undefined;
      if (!entry) return null;
      if (entry.expiresAt <= now) {
        getMemoryMap().delete(key);
        return null;
      }
      return entry;
    },
    async update<T>(
      key: string,
      now: number,
      updater: (current: StoredSecurityEntry<T> | null) => SecurityStateUpdateResult<T>,
    ) {
      const current = await this.get<T>(key, now);
      const next = updater(current);
      if (next.kind === "delete") {
        getMemoryMap().delete(key);
        return null;
      }

      const entry = { value: next.value, expiresAt: next.expiresAt };
      getMemoryMap().set(key, entry);
      return entry;
    },
    async delete(key: string) {
      getMemoryMap().delete(key);
    },
    async reset() {
      getMemoryMap().clear();
    },
  };
}

type SecurityStateRow = {
  key: string;
  payload: Prisma.JsonValue;
  expiresAt: Date;
};

function createDatabaseSecurityStore(): SecurityStateStore {
  return {
    async get<T>(key: string, now: number) {
      const rows = await prisma.$queryRaw<SecurityStateRow[]>`
        SELECT "key", "payload", "expiresAt"
        FROM "SecurityState"
        WHERE "key" = ${key}
          AND "expiresAt" > ${new Date(now)}
        LIMIT 1
      `;

      const row = rows[0];
      if (!row) return null;

      return {
        value: row.payload as T,
        expiresAt: row.expiresAt.getTime(),
      };
    },
    async update<T>(
      key: string,
      now: number,
      updater: (current: StoredSecurityEntry<T> | null) => SecurityStateUpdateResult<T>,
    ) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

        const rows = await tx.$queryRaw<SecurityStateRow[]>`
          SELECT "key", "payload", "expiresAt"
          FROM "SecurityState"
          WHERE "key" = ${key}
            AND "expiresAt" > ${new Date(now)}
          LIMIT 1
        `;

        const currentRow = rows[0];
        const current = currentRow
          ? {
              value: currentRow.payload as T,
              expiresAt: currentRow.expiresAt.getTime(),
            }
          : null;

        const next = updater(current);
        if (next.kind === "delete") {
          await tx.$executeRaw`DELETE FROM "SecurityState" WHERE "key" = ${key}`;
          return null;
        }

        const expiresAtDate = new Date(next.expiresAt);
        await tx.$executeRaw`
          INSERT INTO "SecurityState" ("key", "payload", "expiresAt", "createdAt", "updatedAt")
          VALUES (${key}, ${JSON.stringify(next.value)}::jsonb, ${expiresAtDate}, NOW(), NOW())
          ON CONFLICT ("key")
          DO UPDATE SET
            "payload" = EXCLUDED."payload",
            "expiresAt" = EXCLUDED."expiresAt",
            "updatedAt" = NOW()
        `;

        return {
          value: next.value,
          expiresAt: next.expiresAt,
        };
      });
    },
    async delete(key: string) {
      await prisma.$executeRaw`DELETE FROM "SecurityState" WHERE "key" = ${key}`;
    },
  };
}

function shouldUseDatabaseStore() {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "test" || process.env.E2E_TEST_MODE === "1") return false;

  const backend = process.env.SECURITY_STATE_BACKEND?.trim().toUpperCase();
  if (backend === "MEMORY") return false;
  if (backend === "DATABASE") return true;

  return (
    nodeEnv === "production" &&
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.trim().length > 0
  );
}

export function getSecurityStateStore(): SecurityStateStore {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_SECURITY_STORE_KEY]?: SecurityStateStore;
  };

  if (!globalScope[GLOBAL_SECURITY_STORE_KEY]) {
    globalScope[GLOBAL_SECURITY_STORE_KEY] = shouldUseDatabaseStore()
      ? createDatabaseSecurityStore()
      : createInMemorySecurityStore();
  }

  return globalScope[GLOBAL_SECURITY_STORE_KEY];
}

export function configureSecurityStateStore(store: SecurityStateStore) {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_SECURITY_STORE_KEY]?: SecurityStateStore;
  };
  globalScope[GLOBAL_SECURITY_STORE_KEY] = store;
}

export async function resetSecurityStateStore() {
  await getSecurityStateStore().reset?.();
}
