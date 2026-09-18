# Day 5 · Chức năng để có thứ mà scale và quan sát

> Thời lượng: ~5 giờ · Chi phí: ~$16 · Đầu vào: pipeline Day 4 chạy được, prod/staging `Healthy`.

Hôm nay làm F3, F4, F5, F6. F1 (metrics) và F2 (tracing) chuyển sang Day 6 (README, mục "Thứ tự F1–F6").
Mọi thay đổi code đi qua PR → `app-lab` → staging → promote prod, như một thay đổi thật.

## Kết quả cuối ngày (DoD)

- [ ] **F3**: 3 replica prod dùng chung một bộ đếm trên Valkey. Gửi 30 webhook sai secret thì đúng 20
      lần nhận `401` và 10 lần nhận `429`, dù request được chia đều cho các pod.
- [ ] **F3**: IP client lấy từ hop tin cậy cuối của `X-Forwarded-For`; tự gửi header giả không né được limit.
- [ ] **F4**: prod có 5 cơ sở, 80 lớp, 2.000 học sinh, 2.000 hoá đơn tháng hiện tại; có file fixtures cho k6.
- [ ] **F4**: cùng một webhook gửi 10 lần **song song** chỉ tạo đúng 1 `Transaction`.
- [ ] **F5**: CronJob đối soát chạy mỗi giờ, đẩy kết quả lên Pushgateway.
- [ ] Unit test mới chạy trong CI.
- [ ] Stretch **F6**: bật được độ trễ/lỗi giả chỉ bằng biến môi trường trong image lab.

> **Không merge các thay đổi code này vào `dev`/`main`** trong 10 ngày. Chúng tương thích với production
> (không đặt `REDIS_URL` thì chạy như cũ), nhưng việc đưa lên production là quyết định riêng, cần review
> riêng.

```bash
cd "$LAB_REPO" && git switch oci-lab && git pull && git switch -c feat/oci-f3-rate-limit
```

Máy bạn không có Node. Mọi lệnh `npm` chạy trong container:

```bash
alias nodebox='docker run --rm -it -v "$PWD":/app -w /app -e DATABASE_URL -e REDIS_URL --network host node:22-alpine'
nodebox npm ci
```

---

## 1. F3 · Rate limit dùng chung trên Valkey

### 1.1 Vấn đề hiện tại

- `src/lib/rate-limit.ts` lưu bucket trong `Map` của từng process. 3 pod → mỗi IP có 3 × 8 = 24 lần thử
  đăng nhập sai thay vì 8.
- `getClientIp()` trong `src/lib/actions.ts` lấy phần tử **đầu** của `X-Forwarded-For`. Envoy (và
  Caddy ở production) **nối thêm** IP thật vào **cuối** chuỗi. Client gửi `X-Forwarded-For: 1.2.3.4`
  thì phần tử đầu là `1.2.3.4` do client tự đặt, mỗi request một IP giả là né được limit.
- Webhook SePay chưa có giới hạn nào cho request sai secret.

### 1.2 Valkey trong chart base

Rate limit là hạ tầng dùng chung của namespace, đặt cạnh DB trong `qltrungtam-base`.

```yaml
# gitops/apps/qltrungtam-base/values.yaml (bổ sung)
valkey:
  image: docker.io/valkey/valkey:<VALKEY_VERSION>-alpine     # pin, ghi vào README §5
  nodeSelector: {}
```

```yaml
# gitops/envs/prod/base-values.yaml (bổ sung)
valkey:
  nodeSelector: { qltt/pool: app }
```

```yaml
# gitops/apps/qltrungtam-base/templates/valkey.yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: qltrungtam-valkey
spec:
  refreshInterval: 1h
  secretStoreRef: { kind: ClusterSecretStore, name: oci-vault }
  target:
    name: qltrungtam-valkey
  data:
    - secretKey: password
      remoteRef: { key: qltt-valkey-password }
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: qltrungtam-valkey
  labels: { app.kubernetes.io/name: valkey }
spec:
  replicas: 1
  strategy: { type: Recreate }
  selector:
    matchLabels: { app.kubernetes.io/name: valkey }
  template:
    metadata:
      labels: { app.kubernetes.io/name: valkey }
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        seccompProfile: { type: RuntimeDefault }
      {{- with .Values.valkey.nodeSelector }}
      nodeSelector: {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: valkey
          image: {{ .Values.valkey.image }}
          # Không persistence: mất bộ đếm khi restart là chấp nhận được với rate limit
          args: ["--requirepass", "$(VALKEY_PASSWORD)", "--save", "", "--appendonly", "no",
                 "--maxmemory", "96mb", "--maxmemory-policy", "volatile-ttl"]
          env:
            - name: VALKEY_PASSWORD
              valueFrom: { secretKeyRef: { name: qltrungtam-valkey, key: password } }
          ports: [{ name: valkey, containerPort: 6379 }]
          readinessProbe:
            exec: { command: ["sh", "-c", "valkey-cli -a \"$VALKEY_PASSWORD\" --no-auth-warning ping | grep -q PONG"] }
            periodSeconds: 5
          resources:
            requests: { cpu: 50m, memory: 64Mi }
            limits: { memory: 128Mi }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          volumeMounts: [{ name: data, mountPath: /data }]
      volumes: [{ name: data, emptyDir: {} }]
---
apiVersion: v1
kind: Service
metadata:
  name: qltrungtam-valkey
spec:
  selector: { app.kubernetes.io/name: valkey }
  ports: [{ name: valkey, port: 6379, targetPort: valkey }]
```

Thêm vào `ExternalSecret qltrungtam-app` (Day 4 §2.1):

```yaml
        REDIS_URL: 'redis://:{{ "{{ .valkeyPassword }}" }}@qltrungtam-valkey:6379/0'
        TRUSTED_PROXY_HOPS: "1"
  data:
    # ...
    - secretKey: valkeyPassword
      remoteRef: { key: qltt-valkey-password }
```

> Valkey 1 replica là single point of failure *có chủ đích*: code fail-open về bộ nhớ cục bộ (dưới đây),
> nên Valkey chết chỉ làm limit yếu đi, không làm app sập. Game day G6 kiểm chứng điều này.

### 1.3 Code

```bash
nodebox npm install ioredis
```

```ts
// src/lib/rate-limit.ts
// Rate limiter cửa sổ cố định. Khi có REDIS_URL, bộ đếm nằm trên Valkey/Redis để mọi instance
// dùng chung; lỗi backend thì fail-open sang bộ nhớ cục bộ (limit yếu hơn nhưng app không sập).
import Redis from "ioredis";

type Bucket = { count: number; resetAt: number };

export type RateLimitOptions = {
  /** Số lần cho phép trong cửa sổ. */
  max: number;
  /** Độ dài cửa sổ (ms). */
  windowMs: number;
};

export type RateLimitResult = { allowed: boolean; retryAfterSec: number; remaining: number };

export interface RateLimitStore {
  get(key: string): Promise<Bucket | null>;
  increment(key: string, windowMs: number): Promise<Bucket>;
  reset(key: string): Promise<void>;
}

const MAX_KEYS = 10_000;

export class MemoryStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  async get(key: string) {
    const bucket = this.buckets.get(key);
    return bucket && bucket.resetAt >= Date.now() ? bucket : null;
  }

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    if (this.buckets.size >= MAX_KEYS) {
      for (const [k, b] of this.buckets) if (b.resetAt < now) this.buckets.delete(k);
    }
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }
    bucket.count += 1;
    return bucket;
  }

  async reset(key: string) {
    this.buckets.delete(key);
  }
}

// INCR + đặt TTL trong một lệnh nguyên tử, tránh key không bao giờ hết hạn khi 2 pod cùng tạo.
const INCR_SCRIPT = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {c, redis.call('PTTL', KEYS[1])}
`;

export class ValkeyStore implements RateLimitStore {
  constructor(
    private readonly client: Redis,
    private readonly prefix = "rl:"
  ) {}

  async get(key: string) {
    const k = this.prefix + key;
    const [[, count], [, ttl]] = (await this.client.multi().get(k).pttl(k).exec()) as [
      [null, string | null],
      [null, number]
    ];
    if (count === null || ttl <= 0) return null;
    return { count: Number(count), resetAt: Date.now() + ttl };
  }

  async increment(key: string, windowMs: number) {
    const [count, ttl] = (await this.client.eval(INCR_SCRIPT, 1, this.prefix + key, windowMs)) as [
      number,
      number
    ];
    return { count, resetAt: Date.now() + Math.max(ttl, 0) };
  }

  async reset(key: string) {
    await this.client.del(this.prefix + key);
  }
}

export function createRateLimiter(
  primary: RateLimitStore,
  fallback: RateLimitStore = new MemoryStore(),
  onBackendError: (operation: string) => void = () => {}
) {
  async function run<T>(operation: string, fn: (store: RateLimitStore) => Promise<T>) {
    if (primary === fallback) return fn(primary);
    try {
      return await fn(primary);
    } catch {
      onBackendError(operation);
      return fn(fallback);
    }
  }

  return {
    /** Kiểm tra còn lượt không (không tính là 1 lần thử). */
    async check(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
      const bucket = await run("get", (s) => s.get(key));
      if (!bucket) return { allowed: true, retryAfterSec: 0, remaining: opts.max };
      if (bucket.count >= opts.max) {
        return {
          allowed: false,
          retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000)),
          remaining: 0
        };
      }
      return { allowed: true, retryAfterSec: 0, remaining: opts.max - bucket.count };
    },
    /** Ghi nhận 1 lần thất bại. */
    async recordFailure(key: string, opts: RateLimitOptions) {
      await run("increment", (s) => s.increment(key, opts.windowMs));
    },
    /** Xoá bộ đếm (gọi khi thành công). */
    async reset(key: string) {
      await run("reset", (s) => s.reset(key));
    }
  };
}

type RateLimiter = ReturnType<typeof createRateLimiter>;
const globalForRateLimit = globalThis as unknown as { qlttRateLimiter?: RateLimiter };

function getRateLimiter(): RateLimiter {
  if (globalForRateLimit.qlttRateLimiter) return globalForRateLimit.qlttRateLimiter;

  const url = process.env.REDIS_URL;
  const memory = new MemoryStore();
  let limiter: RateLimiter;
  if (url) {
    const client = new Redis(url, {
      connectTimeout: 500,
      commandTimeout: 300,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false
    });
    client.on("error", () => {}); // lỗi đã được xử lý ở từng lệnh
    limiter = createRateLimiter(new ValkeyStore(client), memory, (operation) => {
      console.warn(JSON.stringify({ level: "warn", msg: "rate_limit_backend_error", operation }));
    });
  } else {
    limiter = createRateLimiter(memory, memory);
  }
  globalForRateLimit.qlttRateLimiter = limiter;
  return limiter;
}

export const checkRateLimit = (key: string, opts: RateLimitOptions) => getRateLimiter().check(key, opts);
export const recordFailure = (key: string, opts: RateLimitOptions) =>
  getRateLimiter().recordFailure(key, opts);
export const resetLimit = (key: string) => getRateLimiter().reset(key);
```

IP client, file mới để dùng chung cho server action và route handler:

```ts
// src/lib/client-ip.ts
/**
 * Lấy IP client từ X-Forwarded-For theo số proxy tin cậy phía trước app.
 * Proxy (Envoy, Caddy) NỐI IP nó nhìn thấy vào CUỐI chuỗi, nên phần tử thứ `hops` tính từ cuối
 * mới là giá trị client không tự đặt được. Phần tử đầu tiên do client kiểm soát.
 */
export function clientIpFromHeaders(
  headers: Pick<Headers, "get">,
  trustedHops = Number(process.env.TRUSTED_PROXY_HOPS ?? "1")
) {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (trustedHops > 0 && chain.length >= trustedHops) {
    return chain[chain.length - trustedHops];
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
```

Sửa `src/lib/actions.ts`:

```ts
import { clientIpFromHeaders } from "@/lib/client-ip";

async function getClientIp() {
  return clientIpFromHeaders(await headers());
}

// trong loginAction: thêm await ở 4 chỗ
  const limit = await checkRateLimit(rlKey, LOGIN_LIMIT);
  ...
    await recordFailure(rlKey, LOGIN_LIMIT);
  ...
    await recordFailure(rlKey, LOGIN_LIMIT);
  ...
  await resetLimit(rlKey);
```

Sửa `src/app/api/webhook/sepay/route.ts`, ngay sau đoạn kiểm tra `expectedSecret`:

```ts
import { clientIpFromHeaders } from "@/lib/client-ip";
import { checkRateLimit, recordFailure } from "@/lib/rate-limit";

const WEBHOOK_AUTH_LIMIT = { max: 20, windowMs: 60 * 1000 };

  // ... sau khối "Fail-closed"
  const authKey = `webhook-auth:${clientIpFromHeaders(request.headers)}`;
  const authLimit = await checkRateLimit(authKey, WEBHOOK_AUTH_LIMIT);
  if (!authLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(authLimit.retryAfterSec) } }
    );
  }

  const receivedSecret = /* giữ nguyên */;

  if (receivedSecret !== expectedSecret) {
    await recordFailure(authKey, WEBHOOK_AUTH_LIMIT);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
```

Chỉ request **sai secret** bị đếm, nên SePay thật (luôn đúng secret) không bao giờ bị chặn dù gửi dồn
dập đầu tháng.

Nếu `next build` báo lỗi resolve module của `ioredis`, thêm vào `next.config.ts`:
`serverExternalPackages: ["ioredis"]`.

### 1.4 Test

```ts
// tests/rate-limit.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter, MemoryStore, type RateLimitStore } from "../src/lib/rate-limit";
import { clientIpFromHeaders } from "../src/lib/client-ip";

const opts = { max: 3, windowMs: 60_000 };

test("hai instance dùng chung store thì chia chung một limit", async () => {
  const shared = new MemoryStore(); // đóng vai Valkey
  const podA = createRateLimiter(shared, new MemoryStore());
  const podB = createRateLimiter(shared, new MemoryStore());

  await podA.recordFailure("login:1.1.1.1", opts);
  await podB.recordFailure("login:1.1.1.1", opts);
  await podA.recordFailure("login:1.1.1.1", opts);

  assert.equal((await podB.check("login:1.1.1.1", opts)).allowed, false);
});

test("backend lỗi thì fail-open sang bộ nhớ cục bộ và báo lỗi", async () => {
  const broken: RateLimitStore = {
    get: async () => { throw new Error("down"); },
    increment: async () => { throw new Error("down"); },
    reset: async () => { throw new Error("down"); }
  };
  const errors: string[] = [];
  const limiter = createRateLimiter(broken, new MemoryStore(), (op) => errors.push(op));

  for (let i = 0; i < 3; i += 1) await limiter.recordFailure("k", opts);
  assert.equal((await limiter.check("k", opts)).allowed, false);
  assert.ok(errors.length >= 4);
});

test("IP lấy từ hop tin cậy cuối, bỏ qua giá trị client tự đặt", () => {
  const h = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
  assert.equal(clientIpFromHeaders(h, 1), "203.0.113.9");
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" }), 1), "203.0.113.9");
  assert.equal(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.1" }), 1), "198.51.100.1");
});
```

```ts
// tests/rate-limit.valkey.integration.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import Redis from "ioredis";
import { createRateLimiter, MemoryStore, ValkeyStore } from "../src/lib/rate-limit";

test("ValkeyStore: 2 client độc lập chia chung bộ đếm và TTL", { skip: !process.env.REDIS_URL }, async () => {
  const a = new Redis(process.env.REDIS_URL!);
  const b = new Redis(process.env.REDIS_URL!);
  const key = `test:${Date.now()}`;
  try {
    const podA = createRateLimiter(new ValkeyStore(a), new MemoryStore());
    const podB = createRateLimiter(new ValkeyStore(b), new MemoryStore());
    const opts = { max: 2, windowMs: 2_000 };
    await podA.recordFailure(key, opts);
    await podB.recordFailure(key, opts);
    assert.equal((await podA.check(key, opts)).allowed, false);
    assert.ok((await a.pttl(`rl:${key}`)) > 0, "key phải có TTL");
    await new Promise((r) => setTimeout(r, 2_100));
    assert.equal((await podB.check(key, opts)).allowed, true);
  } finally {
    a.disconnect();
    b.disconnect();
  }
});
```

`package.json`: thêm `tests/rate-limit.test.ts` vào `test:unit`, `tests/rate-limit.valkey.integration.test.ts`
vào `test:integration`. Trong `.github/workflows/ci.yml` thêm service và biến:

```yaml
    env:
      REDIS_URL: redis://localhost:6379/0
    services:
      valkey:
        image: valkey/valkey:<VALKEY_VERSION>-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "valkey-cli ping" --health-interval 5s --health-timeout 3s --health-retries 10
```

Chạy thử:

```bash
docker run -d --rm --name vk -p 6379:6379 valkey/valkey:<VALKEY_VERSION>-alpine
REDIS_URL=redis://localhost:6379/0 nodebox sh -c 'npm run typecheck && npm run test:unit && npx tsx --test tests/rate-limit.valkey.integration.test.ts'
docker stop vk
```

---

## 2. F4 · Dữ liệu quy mô lớn và webhook simulator

Schema không có khái niệm "cơ sở". Cơ sở được mã hoá vào `shortCode` của lớp: `CS1-TOAN6A` … `CS5-ANH9D`.
Mọi bản ghi lab đánh dấu `note = "lab-seed"` (Student) để xoá lại được mà không đụng dữ liệu khác.

### 2.1 Chốt an toàn

```ts
// scripts/lab/guard.ts
/** Chặn script lab chạy nhầm vào DB không phải lab. */
export function assertLabDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const host = url.match(/@([^:/?]+)/)?.[1] ?? "";
  const ok =
    process.env.LAB_ENVIRONMENT === "oci-lab" &&
    /^qltrungtam-(postgres|pooler)/.test(host);
  if (!ok) {
    console.error(`Từ chối chạy: LAB_ENVIRONMENT=${process.env.LAB_ENVIRONMENT ?? ""}, host=${host}`);
    process.exit(3);
  }
}
```

### 2.2 Seed

```ts
// scripts/lab/seed-scale.ts
import { PrismaClient } from "@prisma/client";
import { buildMemo } from "../../src/lib/payment";
import { assertLabDatabase } from "./guard";

assertLabDatabase();
const prisma = new PrismaClient();

const CAMPUSES = 5;
const SUBJECTS = ["TOAN", "VAN", "ANH", "LY"];
const GRADES = [6, 7, 8, 9];
const STUDENTS_PER_CLASS = 25;
const PRICE_PER_SESSION = 75_000;
const SESSIONS = 8;
const LAB_NOTE = "lab-seed";

async function wipeLabData() {
  const students = await prisma.student.findMany({ where: { note: LAB_NOTE }, select: { id: true } });
  const studentIds = students.map((s) => s.id);
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: { in: studentIds } },
    select: { id: true, classId: true }
  });
  const enrollmentIds = enrollments.map((e) => e.id);
  const invoices = await prisma.monthlyInvoice.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    select: { id: true, transactionId: true }
  });
  const txIds = invoices.flatMap((i) => (i.transactionId ? [i.transactionId] : []));

  await prisma.$transaction([
    prisma.monthlyInvoice.updateMany({ where: { id: { in: invoices.map((i) => i.id) } }, data: { transactionId: null } }),
    prisma.transaction.deleteMany({ where: { OR: [{ id: { in: txIds } }, { gatewayRef: { startsWith: "LAB-" } }] } }),
    prisma.monthlyInvoice.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } }),
    prisma.enrollmentMonth.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } }),
    prisma.enrollment.deleteMany({ where: { id: { in: enrollmentIds } } }),
    prisma.student.deleteMany({ where: { id: { in: studentIds } } }),
    prisma.classRoom.deleteMany({ where: { shortCode: { startsWith: "CS" }, enrollments: { none: {} } } })
  ]);
}

async function main() {
  const force = process.argv.includes("--force");
  const existing = await prisma.classRoom.count({ where: { shortCode: { startsWith: "CS1-" } } });
  if (existing > 0 && !force) {
    console.log("Đã có dữ liệu lab, dùng --force để tạo lại.");
    return;
  }
  if (force) await wipeLabData();

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let phoneCounter = 0;
  let totalStudents = 0;

  for (let campus = 1; campus <= CAMPUSES; campus += 1) {
    for (const subject of SUBJECTS) {
      for (const grade of GRADES) {
        const shortCode = `CS${campus}-${subject}${grade}`;
        const classRoom = await prisma.classRoom.create({
          data: {
            name: `Cơ sở ${campus} · ${subject} ${grade}`,
            shortCode,
            teacherName: `GV ${subject} ${grade} CS${campus}`,
            pricePerSession: PRICE_PER_SESSION,
            sessionsPerMonthDefault: SESSIONS,
            teacherSharePercent: 40
          }
        });

        const students = await prisma.student.createManyAndReturn({
          data: Array.from({ length: STUDENTS_PER_CLASS }, (_, i) => ({
            fullName: `Học sinh ${shortCode}-${String(i + 1).padStart(2, "0")}`,
            phone: `09${String(10_000_000 + phoneCounter++).slice(-8)}`,
            address: `Cơ sở ${campus}`,
            note: LAB_NOTE
          })),
          select: { id: true, phone: true, fullName: true }
        });

        const enrollments = await prisma.enrollment.createManyAndReturn({
          data: students.map((s) => ({ studentId: s.id, classId: classRoom.id })),
          select: { id: true, studentId: true }
        });

        await prisma.enrollmentMonth.createMany({
          data: enrollments.map((e) => ({
            enrollmentId: e.id, month, year, sessions: SESSIONS, pricePerSession: PRICE_PER_SESSION
          }))
        });

        const byStudent = new Map(students.map((s) => [s.id, s]));
        await prisma.monthlyInvoice.createMany({
          data: enrollments.map((e) => {
            const s = byStudent.get(e.studentId)!;
            return {
              enrollmentId: e.id,
              month,
              year,
              sessions: SESSIONS,
              pricePerSession: PRICE_PER_SESSION,
              amount: SESSIONS * PRICE_PER_SESSION,
              memoContent: buildMemo(shortCode, s.phone, month, year),
              studentNameSnapshot: s.fullName,
              studentPhoneSnapshot: s.phone,
              classNameSnapshot: classRoom.name,
              classShortCodeSnapshot: shortCode,
              teacherNameSnapshot: classRoom.teacherName
            };
          })
        });
        totalStudents += students.length;
      }
    }
    console.log(`Cơ sở ${campus}: xong`);
  }
  console.log(`Tạo ${CAMPUSES * SUBJECTS.length * GRADES.length} lớp, ${totalStudents} học sinh, tháng ${month}/${year}`);
}

main().finally(() => prisma.$disconnect());
```

> 5 × 4 × 4 = **80 lớp**, × 25 = **2.000 học sinh**. Số điện thoại `09xxxxxxxx` là số giả tuần tự,
> không trùng người thật một cách có chủ đích; không dùng số production.

### 2.3 Fixtures cho k6 và reset trạng thái

```ts
// scripts/lab/export-load-fixtures.ts
import { PrismaClient } from "@prisma/client";
import { assertLabDatabase } from "./guard";

assertLabDatabase();
const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.monthlyInvoice.findMany({
    where: { status: "unpaid", enrollment: { student: { note: "lab-seed" } } },
    select: {
      id: true,
      amount: true,
      memoContent: true,
      enrollment: { select: { classRoom: { select: { publicToken: true } } } }
    }
  });
  const rows = invoices.map((i) => ({
    token: i.enrollment.classRoom.publicToken,
    invoiceId: i.id,
    memo: i.memoContent,
    amount: i.amount
  }));
  process.stdout.write(JSON.stringify(rows));
}

main().finally(() => prisma.$disconnect());
```

```ts
// scripts/lab/reset-load-state.ts
// Đưa hoá đơn lab về unpaid và xoá giao dịch LAB-* để chạy lại load test.
import { PrismaClient } from "@prisma/client";
import { assertLabDatabase } from "./guard";

assertLabDatabase();
const prisma = new PrismaClient();

async function main() {
  const txs = await prisma.transaction.findMany({ where: { gatewayRef: { startsWith: "LAB-" } }, select: { id: true } });
  const ids = txs.map((t) => t.id);
  const [invoices, , deleted] = await prisma.$transaction([
    prisma.monthlyInvoice.updateMany({
      where: { transactionId: { in: ids } },
      data: { status: "unpaid", paidAt: null, transactionId: null }
    }),
    prisma.auditLog.deleteMany({ where: { entityType: "Transaction", entityId: { in: ids } } }),
    prisma.transaction.deleteMany({ where: { id: { in: ids } } })
  ]);
  console.log(`reset: ${invoices.count} hoá đơn, xoá ${deleted.count} giao dịch`);
}

main().finally(() => prisma.$disconnect());
```

### 2.4 Chạy trong cluster (Job vận hành, không nằm trong GitOps)

Seed là thao tác dữ liệu một lần, giống chạy runbook, nên dùng `kubectl` có chủ đích thay vì Argo CD.

```yaml
# tests/load/jobs/lab-script.yaml   (dùng: envsubst, SCRIPT và ARGS truyền vào)
apiVersion: batch/v1
kind: Job
metadata:
  generateName: lab-script-
  namespace: qltrungtam
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      restartPolicy: Never
      imagePullSecrets: [{ name: ocir-pull }]
      containers:
        - name: run
          image: ${MIGRATE_IMAGE}
          command: ["sh", "-ec", 'DATABASE_URL="$DIRECT_DATABASE_URL" exec npx tsx ${SCRIPT} ${ARGS}']
          env:
            - { name: LAB_ENVIRONMENT, value: oci-lab }
          envFrom:
            - secretRef: { name: qltrungtam-app }
          resources:
            requests: { cpu: 500m, memory: 512Mi }
            limits: { memory: 1Gi }
```

```bash
source ~/.qltt-lab.env
TAG=$(yq '.image.tag' gitops/envs/prod/values.yaml)
export MIGRATE_IMAGE=$OCIR_HOST/$OS_NAMESPACE/qltrungtam-migrate:$TAG

run_lab_script() {   # $1 context, $2 script, $3 args
  export SCRIPT=$2 ARGS=${3:-}
  local job
  # Chỉ thay 3 biến này; $DATABASE_URL/$DIRECT_DATABASE_URL phải giữ nguyên cho shell trong pod
  job=$(envsubst '${MIGRATE_IMAGE} ${SCRIPT} ${ARGS}' < tests/load/jobs/lab-script.yaml \
        | kubectl --context "$1" create -f - -o name)
  kubectl --context "$1" -n qltrungtam wait "$job" --for=condition=complete --timeout=15m
  kubectl --context "$1" -n qltrungtam logs "$job"
}

run_lab_script qltt-prod scripts/lab/seed-scale.ts
run_lab_script qltt-prod scripts/lab/export-load-fixtures.ts > tests/load/fixtures/prod-invoices.json
jq 'length' tests/load/fixtures/prod-invoices.json      # 2000
```

`tests/load/fixtures/*.json` chứa ID nội bộ và số điện thoại giả; thêm vào `.gitignore`.

Kiểm tra trên UI: `https://qltt.${LAB_DOMAIN}/pay/<token>` hiển thị 25 học sinh của lớp.

### 2.5 Simulator webhook và bài kiểm tra idempotency

```bash
# scripts/lab/sepay-sim.sh
#!/usr/bin/env bash
# Dùng: sepay-sim.sh <base_url> <gatewayRef> <memo> <amount> [secret]
set -euo pipefail
BASE=$1 REF=$2 MEMO=$3 AMOUNT=$4
SECRET=${5:-${SEPAY_WEBHOOK_SECRET:?}}
curl -sS -X POST "$BASE/api/webhook/sepay" \
  -H "Authorization: Apikey $SECRET" -H 'Content-Type: application/json' \
  -w ' HTTP %{http_code}\n' \
  -d "$(jq -nc --arg ref "$REF" --arg memo "$MEMO" --argjson amount "$AMOUNT" '{
        id: $ref, gateway: "LAB", transferType: "in",
        accountNumber: "00000000000000", content: $memo,
        transferAmount: $amount, referenceCode: $ref,
        transactionDate: (now | strflocaltime("%Y-%m-%d %H:%M:%S"))
      }')"
```

```bash
chmod +x scripts/lab/sepay-sim.sh
export SEPAY_WEBHOOK_SECRET=$(oci secrets secret-bundle get-secret-bundle-by-name \
  --vault-id "$(cd infra/oci/envs/foundation && tofu output -raw vault_id)" \
  --secret-name qltt-sepay-webhook-secret --query 'data."secret-bundle-content".content' --raw-output | base64 -d)
BASE=https://qltt.${LAB_DOMAIN}
ROW=$(jq -c '.[0]' tests/load/fixtures/prod-invoices.json)
MEMO=$(jq -r .memo <<<"$ROW"); AMOUNT=$(jq -r .amount <<<"$ROW")

# 10 request giống hệt nhau, song song
seq 10 | xargs -P10 -I{} scripts/lab/sepay-sim.sh "$BASE" LAB-IDEM-0001 "$MEMO" "$AMOUNT"
```

Kiểm tra DB (qua primary, chỉ đọc):

```bash
kubectl cnpg --context qltt-prod -n qltrungtam psql qltrungtam-postgres -- -d qltrungtam -c \
  "select count(*) as tx, count(\"matchedInvoiceId\") as matched from \"Transaction\" where \"gatewayRef\"='LAB-IDEM-0001';"
```

Kỳ vọng `tx = 1`, `matched = 1`. Trong 10 response: 1 lần `"matched":true` không có `duplicate`, 9 lần
`"duplicate":true`. Nếu thấy HTTP 500, xem log app: lỗi `P2034` (serialization) quá 3 lần là điểm yếu
thật dưới tải cao, ghi vào journal để Day 7 đo.

### 2.6 Kiểm tra DoD của F3 trên prod

```bash
BASE=https://qltt.${LAB_DOMAIN}
for i in $(seq 30); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/webhook/sepay" \
    -H 'Authorization: Apikey wrong' -H "X-Forwarded-For: 10.$i.0.1" -H 'Content-Type: application/json' -d '{}'
done | sort | uniq -c
```

Kỳ vọng: `20 401` và `10 429`. Header `X-Forwarded-For` giả đổi mỗi lần nhưng không có tác dụng (nhờ
lấy hop cuối). Kiểm tra request thực sự được chia cho nhiều pod:

```bash
kp -n qltrungtam logs -l app.kubernetes.io/name=qltrungtam --prefix --since=2m | grep -c webhook   # tuỳ log hiện có
kp -n qltrungtam exec deploy/qltrungtam-valkey -- sh -c 'valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning --scan --pattern "rl:*"'
```

Đối chứng (tuỳ chọn, trên staging): tạm xoá `REDIS_URL` khỏi secret staging → 2 replica → thấy khoảng
`30 401` (mỗi pod đếm riêng 20). Khôi phục ngay sau đó.

---

## 3. F5 · CronJob đối soát tài chính

### 3.1 Pushgateway

Thêm addon vào `gitops/bootstrap/apps/values.yaml`:

```yaml
  - name: prometheus-pushgateway
    namespace: monitoring
    wave: 0
    clusters: [prod]
    repoURL: https://prometheus-community.github.io/helm-charts
    chart: prometheus-pushgateway
    version: "<PUSHGATEWAY_CHART_VERSION>"
```

```yaml
# gitops/platform/prometheus-pushgateway/values-prod.yaml
nodeSelector: { qltt/pool: obs }
tolerations: [{ key: qltt/pool, operator: Equal, value: obs, effect: NoSchedule }]
serviceMonitor:
  enabled: false      # Day 6 bật
```

### 3.2 Đẩy kết quả từ script

Cuối hàm `main()` của `scripts/audit-financial-data.ts`, sau khối "KẾT LUẬN":

```ts
  await pushAuditMetrics({ critical: criticalCount, warning: warningCount, success: 1 });
```

Trong khối `.catch` ở cuối file (trước `process.exitCode = 2`):

```ts
    await pushAuditMetrics({ critical: 0, warning: 0, success: 0 });
```

Hàm, đặt cạnh `safeErrorCode`:

```ts
/** Đẩy kết quả lên Pushgateway nếu có PUSHGATEWAY_URL. Không bao giờ làm script thất bại. */
async function pushAuditMetrics(result: { critical: number; warning: number; success: 0 | 1 }) {
  const base = process.env.PUSHGATEWAY_URL;
  if (!base) return;
  const env = process.env.LAB_ENV ?? "unknown";
  const body = [
    "# TYPE qltt_financial_audit_critical_findings gauge",
    `qltt_financial_audit_critical_findings ${result.critical}`,
    "# TYPE qltt_financial_audit_warning_findings gauge",
    `qltt_financial_audit_warning_findings ${result.warning}`,
    "# TYPE qltt_financial_audit_success gauge",
    `qltt_financial_audit_success ${result.success}`,
    "# TYPE qltt_financial_audit_last_run_timestamp_seconds gauge",
    `qltt_financial_audit_last_run_timestamp_seconds ${Math.floor(Date.now() / 1000)}`,
    ""
  ].join("\n");
  try {
    await fetch(`${base}/metrics/job/qltt_financial_audit/env/${env}`, {
      method: "PUT",
      headers: { "Content-Type": "text/plain; version=0.0.4" },
      body,
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    console.error("Không đẩy được metric đối soát lên Pushgateway.");
  }
}
```

### 3.3 CronJob trong chart app

```yaml
# gitops/apps/qltrungtam/chart/values.yaml (bổ sung)
audit:
  enabled: true
  schedule: "7 * * * *"
  pushgatewayUrl: ""
```

```yaml
# gitops/envs/prod/values.yaml (bổ sung)
audit:
  pushgatewayUrl: http://prometheus-pushgateway.monitoring:9091
```

```yaml
# gitops/apps/qltrungtam/chart/templates/audit-cronjob.yaml
{{- if .Values.audit.enabled }}
apiVersion: batch/v1
kind: CronJob
metadata:
  name: qltrungtam-financial-audit
spec:
  schedule: {{ .Values.audit.schedule | quote }}
  timeZone: Asia/Ho_Chi_Minh
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  jobTemplate:
    spec:
      backoffLimit: 0
      activeDeadlineSeconds: 900
      template:
        spec:
          restartPolicy: Never
          imagePullSecrets: [{ name: ocir-pull }]
          {{- with .Values.nodeSelector }}
          nodeSelector: {{- toYaml . | nindent 12 }}
          {{- end }}
          containers:
            - name: audit
              image: "{{ .Values.image.migrateRepository }}:{{ .Values.image.tag }}"
              command: ["npx", "tsx", "scripts/audit-financial-data.ts"]
              env:
                - { name: PUSHGATEWAY_URL, value: {{ .Values.audit.pushgatewayUrl | quote }} }
                - { name: LAB_ENV, value: {{ .Release.Namespace | quote }} }
              envFrom:
                - secretRef: { name: qltrungtam-app }
              resources:
                requests: { cpu: 200m, memory: 256Mi }
                limits: { memory: 768Mi }
{{- end }}
```

> Script chỉ đọc (`findMany`), nên đi qua pooler là được. Với 2.000 học sinh và vài nghìn giao dịch,
> đo thời gian chạy: nếu > 1 phút, đó là tín hiệu query cần index trước khi scale lên 20.000.

Chạy thử ngay không chờ lịch:

```bash
kp -n qltrungtam create job audit-now --from=cronjob/qltrungtam-financial-audit
kp -n qltrungtam logs -f job/audit-now
kp -n monitoring port-forward svc/prometheus-pushgateway 9091 &
curl -s localhost:9091/metrics | grep qltt_financial_audit
```

Day 6 tạo alert `FinancialAuditMismatch` (critical > 0) và `FinancialAuditStale` (không chạy > 2 giờ).

---

## 4. F6 (stretch) · Fault flag

Module nạp trước `server.js`, **chỉ có trong image lab** (`deploy/oci-lab/`). Image production build từ
root `Dockerfile` không chứa file này.

```js
// deploy/oci-lab/runtime/fault.cjs
"use strict";
// Lab-only: chèn độ trễ / lỗi 500 giả cho các route thanh toán để canary analysis có cái mà bắt.
// Bọc request listener truyền vào http.createServer, nên instrumentation HTTP (nạp trước) vẫn đo
// được cả độ trễ và lỗi giả.
const latencyMs = Number(process.env.LAB_FAULT_LATENCY_MS || 0);
const errorRate = Number(process.env.LAB_FAULT_ERROR_RATE || 0);
const allowed = (process.env.LAB_FAULT_ALLOWED_NAMESPACES || "qltrungtam").split(",");
const namespace = process.env.POD_NAMESPACE || "";
const pathRe = new RegExp(process.env.LAB_FAULT_PATH_REGEX || "^/(pay|api/pay)(/|\\?|$)");

if (latencyMs > 0 || errorRate > 0) {
  if (!allowed.includes(namespace)) {
    console.warn(JSON.stringify({ level: "warn", msg: "lab_fault_ignored", namespace }));
  } else {
    const http = require("node:http");
    const originalCreateServer = http.createServer;
    http.createServer = function createServer(...args) {
      const i = args.findIndex((a) => typeof a === "function");
      if (i >= 0) {
        const listener = args[i];
        args[i] = function faultyListener(req, res) {
          if (!pathRe.test(req.url || "")) return listener.call(this, req, res);
          const proceed = () => {
            if (errorRate > 0 && Math.random() < errorRate) {
              res.statusCode = 500;
              res.setHeader("content-type", "text/plain");
              res.end("lab fault injected");
              return;
            }
            listener.call(this, req, res);
          };
          if (latencyMs > 0) setTimeout(proceed, latencyMs);
          else proceed();
        };
      }
      return originalCreateServer.apply(this, args);
    };
    console.warn(JSON.stringify({ level: "warn", msg: "LAB_FAULT_ACTIVE", latencyMs, errorRate, namespace }));
  }
}
```

Sửa cuối `deploy/oci-lab/Dockerfile`:

```dockerfile
COPY deploy/oci-lab/runtime ./runtime
CMD ["node", "--require", "./runtime/fault.cjs", "server.js"]
```

Chart app thêm `extraEnv`:

```yaml
# values.yaml
extraEnv: []
```

```yaml
# rollout.yaml, trong container app, sau khối env hiện có
            {{- with .Values.extraEnv }}
            {{- toYaml . | nindent 12 }}
            {{- end }}
```

Thử trên staging bằng PR sửa `gitops/envs/staging/values.yaml`:

```yaml
extraEnv:
  - { name: LAB_FAULT_LATENCY_MS, value: "1500" }
  - { name: LAB_FAULT_ERROR_RATE, value: "0.05" }
```

```bash
for i in $(seq 40); do curl -s -o /dev/null -w '%{http_code} %{time_total}\n' "https://qltt-stg.${LAB_DOMAIN}/pay/<token>"; done \
  | awk '{c[$1]++; t+=$2} END {for (k in c) print k, c[k]; print "avg", t/NR}'
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' "https://qltt-stg.${LAB_DOMAIN}/api/health"   # không bị ảnh hưởng
```

Kỳ vọng: ~5% `500`, thời gian trung bình ≥ 1,5 s; `/api/health` nhanh, nên pod vẫn `Ready`. **Revert PR**
sau khi thử. Day 8 sẽ dùng cờ này trên prod trong một bản canary.

---

## 5. Thứ tự PR trong ngày

| PR | Nội dung | Kiểm tra trước khi merge |
| --- | --- | --- |
| 1 | F3 code + test + CI service | CI xanh; typecheck |
| 2 | Valkey + `REDIS_URL` trong chart base | `helm template` render đúng template ESO |
| 3 | F4 scripts + Job + simulator | Chạy trên staging trước (`qltt-staging`), rồi prod |
| 4 | F5 Pushgateway + CronJob + đẩy metric | Job thủ công chạy xong |
| 5 | F6 (stretch) | Thử staging, revert |

Sau mỗi PR merge: đợi staging `Healthy`, promote prod bằng `promote-prod`.

## Lỗi hay gặp

| Triệu chứng | Nguyên nhân | Xử lý |
| --- | --- | --- |
| `30 401` thay vì 20/10 | `REDIS_URL` chưa có trong pod, hoặc app vẫn lấy IP phần tử đầu | `kp -n qltrungtam exec <pod> -- printenv REDIS_URL \| sed 's/:[^@]*@/:***@/'` |
| Toàn bộ `429` ngay từ đầu | Tất cả request thấy cùng một IP (NLB không giữ IP nguồn) và bộ đếm cũ còn | Day 3 §6 kiểm tra IP; xoá key `rl:*` |
| Đăng nhập chậm thêm ~300 ms | Valkey không kết nối được, mỗi lệnh chờ `commandTimeout` | Xem log `rate_limit_backend_error`; kiểm tra Service/password |
| `createManyAndReturn is not a function` | Prisma < 5.14 | Repo dùng Prisma 6, kiểm tra image migrate đúng tag |
| Seed báo `Từ chối chạy` | Thiếu `LAB_ENVIRONMENT` hoặc chạy ngoài cluster | Đúng như thiết kế; chỉ chạy qua Job |
| Webhook trả `"ignored":true,"reason":"account_mismatch"` | `BANK_ACCOUNT_NUMBER` trong AppSetting khác payload | Seed bootstrap tạo AppSetting từ ConfigMap; kiểm tra trang Cài đặt |
| Webhook `"matched":false` với "Sai cu phap memo" | Memo trong fixtures không khớp regex `parseMemo` | Kiểm tra `shortCode` chỉ gồm `A-Z0-9_-` |
