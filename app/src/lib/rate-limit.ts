// Rate limiter đơn giản, lưu trong bộ nhớ tiến trình (đủ cho triển khai 1 instance).
// Với nhiều instance nên thay bằng Redis.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export type RateLimitOptions = {
  /** Số lần cho phép trong cửa sổ. */
  max: number;
  /** Độ dài cửa sổ (ms). */
  windowMs: number;
};

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

/** Kiểm tra còn lượt không (không tính là 1 lần thử). */
export function checkRateLimit(key: string, opts: RateLimitOptions) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    return { allowed: true, retryAfterSec: 0, remaining: opts.max };
  }
  if (bucket.count >= opts.max) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000), remaining: 0 };
  }
  return { allowed: true, retryAfterSec: 0, remaining: opts.max - bucket.count };
}

/** Ghi nhận 1 lần thất bại. */
export function recordFailure(key: string, opts: RateLimitOptions) {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
  } else {
    bucket.count += 1;
  }
}

/** Xoá bộ đếm (gọi khi thành công). */
export function resetLimit(key: string) {
  buckets.delete(key);
}
