type RateLimitEntry = {
  count: number;
  expiresAt: number;
};

const memoryStore = new Map<string, RateLimitEntry>();

export function assertRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const current = memoryStore.get(options.key);

  if (!current || current.expiresAt <= now) {
    memoryStore.set(options.key, {
      count: 1,
      expiresAt: now + options.windowMs
    });
    return;
  }

  if (current.count >= options.limit) {
    throw new Error("Rate limit exceeded");
  }

  current.count += 1;
  memoryStore.set(options.key, current);
}
