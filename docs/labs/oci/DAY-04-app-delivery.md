# Day 4 · Pipeline đưa ứng dụng lên staging và prod

> Thời lượng: ~5–6 giờ · Chi phí: ~$16 · Đầu vào: Day 3 mọi app platform `Healthy` trên cả 2 cluster.

## Kết quả cuối ngày (DoD)

- [ ] Image app + migrate multi-arch (amd64 + arm64) trên OCIR, tag = git SHA, đã quét Trivy.
- [ ] CNPG prod 3 instance ở 3 FD, Pooler PgBouncer, WAL archive + backup hằng ngày lên
      `qltt-cnpg-backup`. Staging 1 instance.
- [ ] Migration chạy bằng PreSync hook; seed bootstrap (admin + AppSetting) chạy bằng PostSync hook.
- [ ] Merge code vào `oci-lab` → staging chạy bản mới trong **≤ 10 phút**, không thao tác tay.
- [ ] Promote prod bằng **1 PR**. `git revert` PR đó → prod về bản cũ, không dùng `kubectl`.
- [ ] Đã kết luận về `NEXT_PUBLIC_APP_URL` và về việc NetworkPolicy có được enforce hay không.

```text
push oci-lab ─► app-lab.yml
                 ├─ build amd64 (ubuntu-24.04)     ─┐ push theo digest
                 ├─ build arm64 (ubuntu-24.04-arm) ─┘
                 ├─ merge manifest  :<sha12>
                 ├─ trivy image (CRITICAL = fail)
                 └─ commit gitops/envs/staging/values.yaml (deploy key, bypass ruleset)
                                   │ Argo CD poll ≤ 2 phút
                                   ▼
staging: base app (secret, DB, pooler, backup) ─► app (PreSync migrate → Rollout → PostSync seed)

promote.yml (workflow_dispatch, environment lab-prod cần duyệt) ─► PR sửa gitops/envs/prod/values.yaml
```

---

## 1. Image riêng cho lab

Production build từ root `Dockerfile` (`deploy/app/docker-compose.yml`), nên lab dùng file riêng (README D7).

```bash
cd "$LAB_REPO" && git switch oci-lab && git pull && git switch -c feat/oci-app-delivery
mkdir -p deploy/oci-lab
cp Dockerfile deploy/oci-lab/Dockerfile
cp deploy/k8s-lab/Dockerfile.migrate deploy/oci-lab/Dockerfile.migrate
```

Sửa `deploy/oci-lab/Dockerfile.migrate`: thêm `scripts/` (Day 5 CronJob đối soát và seed quy mô lớn
chạy bằng image này) và chạy không root.

```dockerfile
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Ho_Chi_Minh

RUN apk add --no-cache tzdata

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY prisma ./prisma
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./

RUN npx prisma generate && chown -R node:node /app
USER node

CMD ["npx", "prisma", "migrate", "deploy"]
```

Kiểm tra build cục bộ (máy bạn không có Node, nhưng có Docker Desktop với WSL integration):

```bash
docker buildx build -f deploy/oci-lab/Dockerfile -t qltt-app:local --load .
docker buildx build -f deploy/oci-lab/Dockerfile.migrate -t qltt-migrate:local --load .
docker run --rm --entrypoint id qltt-app:local
```

### 1.1 Kiểm tra `NEXT_PUBLIC_APP_URL`

Biến `NEXT_PUBLIC_*` bị Next.js thay bằng giá trị cố định **nếu có mặt lúc build**. Code dùng nó ở
`src/lib/settings.ts` (giá trị mặc định khi DB chưa có setting).

```bash
# Build KHÔNG có biến (giống CI)
docker run --rm --entrypoint sh qltt-app:local -c \
  'grep -rhoE "process\.env\.NEXT_PUBLIC_APP_URL|http://localhost:3001" /app/.next/server | sort | uniq -c'
```

| Kết quả | Kết luận |
| --- | --- |
| Còn chuỗi `process.env.NEXT_PUBLIC_APP_URL` | Đọc lúc runtime. Build once, deploy many vẫn đúng. |
| Chỉ còn `http://localhost:3001` và không còn tham chiếu `process.env` | Đã bị inline. Cần sửa code (dưới). |

Dù kết quả nào, **giá trị thật app dùng là dòng `NEXT_PUBLIC_APP_URL` trong bảng `AppSetting`**:
`getAppSettings()` đọc DB trước, env chỉ là fallback. `prisma/seed.ts` tạo dòng đó từ env **chỉ khi
chưa có** (`update: {}`). Hệ quả:

1. PostSync seed (mục 4.6) phải chạy với `NEXT_PUBLIC_APP_URL` đúng của từng môi trường.
2. Đổi hostname sau này phải sửa trong trang **Cài đặt** của admin hoặc SQL, đổi env không có tác dụng.
3. Điều tương tự áp dụng cho `SEPAY_WEBHOOK_SECRET`: xoay secret trong Vault **không** đổi secret app
   đang dùng. Ghi vào journal, Day 9 sẽ cần.

Nếu bị inline, sửa nhỏ để có biến runtime (PR riêng):

```ts
// src/lib/settings.ts
appUrl: process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
```

---

## 2. Chart `qltrungtam-base`: namespace, secret, DB, pooler, backup

Tách khỏi chart app để migration PreSync có sẵn DB và secret (README D5). Application này **không có
finalizer** xoá tài nguyên: xoá nhầm Application không kéo theo DB.

```bash
mkdir -p gitops/apps/qltrungtam-base/templates gitops/apps/qltrungtam/chart/templates gitops/envs/{staging,prod}
```

```yaml
# gitops/apps/qltrungtam-base/Chart.yaml
apiVersion: v2
name: qltrungtam-base
version: 0.1.0
```

```yaml
# gitops/apps/qltrungtam-base/values.yaml
env: staging
s3Endpoint: https://<OS_NAMESPACE>.compat.objectstorage.ap-kulai-2.oraclecloud.com
postgres:
  instances: 1
  storageSize: 50Gi              # Block Volume OCI tối thiểu 50 GB
  topologyKey: kubernetes.io/hostname
  nodeSelector: {}
  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits: { memory: 1Gi }
  maxConnections: "100"
  sharedBuffers: 256MB
pooler:
  instances: 1
  defaultPoolSize: "20"
backup:
  serverName: qltrungtam-postgres        # đổi khi restore (Day 9, Day 10)
  retention: 7d
  schedule: "0 0 19 * * *"               # 6 trường, UTC → 02:00 giờ VN
bootstrap:
  mode: initdb                           # initdb | recovery
  recoveryServerName: ""
  recoveryTargetTime: ""
secrets:
  sessionSecret: qltt-session-secret-staging
  dbPassword: qltt-db-app-password-staging
appConfig:
  appUrl: https://qltt-stg.lab.example.com
  bankAccountNumber: "00000000000000"    # số tài khoản giả, KHÔNG dùng số production
  bankAccountName: TRUNG TAM LAB
  bankBin: "970407"
```

```yaml
# gitops/envs/prod/base-values.yaml
env: prod
postgres:
  instances: 3
  topologyKey: oci.oraclecloud.com/fault-domain
  nodeSelector: { qltt/pool: app }
  resources:
    requests: { cpu: 500m, memory: 2Gi }
    limits: { memory: 3Gi }
  maxConnections: "200"
  sharedBuffers: 768MB
pooler:
  instances: 2
  defaultPoolSize: "40"
secrets:
  sessionSecret: qltt-session-secret-prod
  dbPassword: qltt-db-app-password-prod
appConfig:
  appUrl: https://qltt.lab.example.com
```

`gitops/envs/staging/base-values.yaml` để trống (`{}`) vì mặc định đã là staging.

### 2.1 ExternalSecret

> **Bẫy Helm**: cú pháp template của ESO (`{{ .dbPassword }}`) trùng với Helm. Trong chart phải bọc
> thành `{{ "{{ .dbPassword }}" }}`, nếu không Helm sẽ render thành chuỗi rỗng và app nhận
> `DATABASE_URL` thiếu mật khẩu.

```yaml
# gitops/apps/qltrungtam-base/templates/externalsecrets.yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: qltrungtam-app
spec:
  refreshInterval: 1h
  secretStoreRef: { kind: ClusterSecretStore, name: oci-vault }
  target:
    name: qltrungtam-app
    template:
      engineVersion: v2
      data:
        # App đi qua PgBouncer (transaction mode) → pgbouncer=true tắt prepared statement của Prisma
        DATABASE_URL: 'postgresql://qltrungtam:{{ "{{ .dbPassword }}" }}@qltrungtam-pooler-rw:5432/qltrungtam?schema=public&sslmode=require&pgbouncer=true&connection_limit=10'
        # Migration đi thẳng primary (DDL + advisory lock không chạy qua transaction pooling)
        DIRECT_DATABASE_URL: 'postgresql://qltrungtam:{{ "{{ .dbPassword }}" }}@qltrungtam-postgres-rw:5432/qltrungtam?schema=public&sslmode=require'
        SESSION_SECRET: '{{ "{{ .sessionSecret }}" }}'
        ADMIN_USERNAME: admin
        ADMIN_PASSWORD: '{{ "{{ .adminPassword }}" }}'
        SEPAY_WEBHOOK_SECRET: '{{ "{{ .sepayWebhookSecret }}" }}'
  data:
    - secretKey: dbPassword
      remoteRef: { key: {{ .Values.secrets.dbPassword }} }
    - secretKey: sessionSecret
      remoteRef: { key: {{ .Values.secrets.sessionSecret }} }
    - secretKey: adminPassword
      remoteRef: { key: qltt-admin-password }
    - secretKey: sepayWebhookSecret
      remoteRef: { key: qltt-sepay-webhook-secret }
---
# CNPG initdb cần secret kiểu basic-auth với khoá username/password
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: qltrungtam-db-app
spec:
  refreshInterval: 1h
  secretStoreRef: { kind: ClusterSecretStore, name: oci-vault }
  target:
    name: qltrungtam-db-app
    template:
      type: kubernetes.io/basic-auth
      data:
        username: qltrungtam
        password: '{{ "{{ .p }}" }}'
  data:
    - secretKey: p
      remoteRef: { key: {{ .Values.secrets.dbPassword }} }
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: qltt-s3
spec:
  refreshInterval: 1h
  secretStoreRef: { kind: ClusterSecretStore, name: oci-vault }
  target:
    name: qltt-s3
  data:
    - secretKey: ACCESS_KEY_ID
      remoteRef: { key: qltt-s3-access-key-id }
    - secretKey: ACCESS_SECRET_KEY
      remoteRef: { key: qltt-s3-secret-access-key }
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: ocir-pull
spec:
  refreshInterval: 1h
  secretStoreRef: { kind: ClusterSecretStore, name: oci-vault }
  target:
    name: ocir-pull
    template:
      type: kubernetes.io/dockerconfigjson
      data:
        .dockerconfigjson: '{{ "{{ .cfg }}" }}'
  data:
    - secretKey: cfg
      remoteRef: { key: qltt-ocir-dockerconfigjson }
```

```yaml
# gitops/apps/qltrungtam-base/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: qltrungtam-config
data:
  NODE_ENV: production
  TZ: Asia/Ho_Chi_Minh
  NEXT_PUBLIC_APP_URL: {{ .Values.appConfig.appUrl | quote }}
  APP_URL: {{ .Values.appConfig.appUrl | quote }}
  BANK_ACCOUNT_NUMBER: {{ .Values.appConfig.bankAccountNumber | quote }}
  BANK_ACCOUNT_NAME: {{ .Values.appConfig.bankAccountName | quote }}
  BANK_BIN: {{ .Values.appConfig.bankBin | quote }}
  SEED_DEMO: "false"            # BẮT BUỘC: mặc định seed.ts XOÁ toàn bộ dữ liệu nghiệp vụ
```

### 2.2 CNPG Cluster, ObjectStore, backup, pooler

```yaml
# gitops/apps/qltrungtam-base/templates/objectstore.yaml
apiVersion: barmancloud.cnpg.io/v1
kind: ObjectStore
metadata:
  name: qltt-backup
spec:
  retentionPolicy: {{ .Values.backup.retention | quote }}
  configuration:
    destinationPath: s3://qltt-cnpg-backup/{{ .Values.env }}
    endpointURL: {{ .Values.s3Endpoint }}
    s3Credentials:
      accessKeyId: { name: qltt-s3, key: ACCESS_KEY_ID }
      secretAccessKey: { name: qltt-s3, key: ACCESS_SECRET_KEY }
    wal:
      compression: gzip
      maxParallel: 4
    data:
      compression: gzip
      jobs: 2
  instanceSidecarConfiguration:
    env:
      # boto3 mới gửi checksum header mà S3-compat của OCI có thể từ chối
      - { name: AWS_REQUEST_CHECKSUM_CALCULATION, value: when_required }
      - { name: AWS_RESPONSE_CHECKSUM_VALIDATION, value: when_required }
```

```yaml
# gitops/apps/qltrungtam-base/templates/cluster.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: qltrungtam-postgres
spec:
  instances: {{ .Values.postgres.instances }}
  imageName: ghcr.io/cloudnative-pg/postgresql:16-minimal-trixie
  primaryUpdateStrategy: unsupervised

  bootstrap:
  {{- if eq .Values.bootstrap.mode "recovery" }}
    recovery:
      source: origin
      database: qltrungtam
      owner: qltrungtam
      secret: { name: qltrungtam-db-app }
      {{- with .Values.bootstrap.recoveryTargetTime }}
      recoveryTarget:
        targetTime: {{ . | quote }}
      {{- end }}
  externalClusters:
    - name: origin
      plugin:
        name: barman-cloud.cloudnative-pg.io
        parameters:
          barmanObjectName: qltt-backup
          serverName: {{ required "bootstrap.recoveryServerName" .Values.bootstrap.recoveryServerName }}
  {{- else }}
    initdb:
      database: qltrungtam
      owner: qltrungtam
      secret: { name: qltrungtam-db-app }
  {{- end }}

  plugins:
    - name: barman-cloud.cloudnative-pg.io
      isWALArchiver: true
      parameters:
        barmanObjectName: qltt-backup
        serverName: {{ .Values.backup.serverName }}

  storage:
    storageClass: oci-bv
    size: {{ .Values.postgres.storageSize }}

  affinity:
    enablePodAntiAffinity: true
    podAntiAffinityType: required
    topologyKey: {{ .Values.postgres.topologyKey }}
    {{- with .Values.postgres.nodeSelector }}
    nodeSelector: {{ toYaml . | nindent 6 }}
    {{- end }}

  resources: {{ toYaml .Values.postgres.resources | nindent 4 }}

  postgresql:
    parameters:
      max_connections: {{ .Values.postgres.maxConnections | quote }}
      shared_buffers: {{ .Values.postgres.sharedBuffers }}
      timezone: Asia/Ho_Chi_Minh
      archive_timeout: "5min"          # RPO ≤ 5 phút ngay cả khi ít ghi

  monitoring:
    enablePodMonitor: false            # Day 6 bật
---
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata:
  name: qltrungtam-daily
spec:
  schedule: {{ .Values.backup.schedule | quote }}
  immediate: true
  backupOwnerReference: self
  cluster: { name: qltrungtam-postgres }
  method: plugin
  pluginConfiguration:
    name: barman-cloud.cloudnative-pg.io
---
apiVersion: postgresql.cnpg.io/v1
kind: Pooler
metadata:
  name: qltrungtam-pooler-rw
spec:
  cluster: { name: qltrungtam-postgres }
  instances: {{ .Values.pooler.instances }}
  type: rw
  pgbouncer:
    poolMode: transaction
    parameters:
      max_client_conn: "1000"
      default_pool_size: {{ .Values.pooler.defaultPoolSize | quote }}
  template:
    spec:
      {{- with .Values.postgres.nodeSelector }}
      nodeSelector: {{ toYaml . | nindent 8 }}
      {{- end }}
      containers: []
```

> `archive_timeout: 5min` ép PostgreSQL đóng WAL segment ít nhất 5 phút một lần, nên RPO thực tế
> không vượt 5 phút dù traffic thấp. Đây là tham số ánh xạ trực tiếp vào mục tiêu RPO ở bản đề xuất.

---

## 3. Chart ứng dụng `qltrungtam`

Chuyển từ `deploy/k8s-lab/manifests/30-app.yaml`, giữ nguyên securityContext và probe.

```yaml
# gitops/apps/qltrungtam/chart/Chart.yaml
apiVersion: v2
name: qltrungtam
version: 0.1.0
```

```yaml
# gitops/apps/qltrungtam/chart/values.yaml
image:
  repository: ap-kulai-2.ocir.io/<OS_NAMESPACE>/qltrungtam
  migrateRepository: ap-kulai-2.ocir.io/<OS_NAMESPACE>/qltrungtam-migrate
  tag: ""                      # bắt buộc đặt ở envs/*/values.yaml
host: qltt-stg.lab.example.com
replicas: 2
hpa:
  enabled: false
  min: 3
  max: 10
  cpu: 70
pdb:
  minAvailable: 1
nodeSelector: {}
resources:
  requests: { cpu: 250m, memory: 256Mi }
  limits: { cpu: "1", memory: 768Mi }
canary:
  steps:
    - setWeight: 10
    - pause: { duration: 2m }
    - setWeight: 30
    - pause: { duration: 3m }
    - setWeight: 100
networkPolicy:
  enabled: true
```

```yaml
# gitops/envs/staging/values.yaml
image:
  tag: "000000000000"          # CI ghi đè
```

```yaml
# gitops/envs/prod/values.yaml
image:
  tag: "000000000000"          # chỉ đổi qua PR promote
host: qltt.lab.example.com
hpa:
  enabled: true
pdb:
  minAvailable: 2
nodeSelector: { qltt/pool: app }
resources:
  requests: { cpu: 500m, memory: 384Mi }
  limits: { cpu: "1500m", memory: 1Gi }
```

### 3.1 Rollout và Service

```yaml
# gitops/apps/qltrungtam/chart/templates/_helpers.tpl
{{- define "qltt.selector" -}}
app.kubernetes.io/name: qltrungtam
app.kubernetes.io/component: web
{{- end }}
```

```yaml
# gitops/apps/qltrungtam/chart/templates/rollout.yaml
{{- if not .Values.image.tag }}{{ fail "image.tag bắt buộc" }}{{ end }}
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: qltrungtam
  labels: {{- include "qltt.selector" . | nindent 4 }}
spec:
  {{- if not .Values.hpa.enabled }}
  replicas: {{ .Values.replicas }}
  {{- end }}
  revisionHistoryLimit: 5
  # Quay về 1 trong 3 bản gần nhất thì bỏ qua các bước canary (rollback nhanh)
  rollbackWindow:
    revisions: 3
  selector:
    matchLabels: {{- include "qltt.selector" . | nindent 6 }}
  strategy:
    canary:
      stableService: qltrungtam-stable
      canaryService: qltrungtam-canary
      trafficRouting:
        plugins:
          argoproj-labs/gatewayAPI:
            httpRoutes:
              - name: qltrungtam
            namespace: {{ .Release.Namespace }}
      steps: {{- toYaml .Values.canary.steps | nindent 8 }}
  template:
    metadata:
      labels: {{- include "qltt.selector" . | nindent 8 }}
    spec:
      terminationGracePeriodSeconds: 30
      imagePullSecrets:
        - name: ocir-pull
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        fsGroup: 10001
        seccompProfile: { type: RuntimeDefault }
      {{- with .Values.nodeSelector }}
      nodeSelector: {{- toYaml . | nindent 8 }}
      {{- end }}
      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: oci.oraclecloud.com/fault-domain
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels: {{- include "qltt.selector" . | nindent 14 }}
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels: {{- include "qltt.selector" . | nindent 14 }}
      containers:
        - name: app
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - { name: http, containerPort: 3000, protocol: TCP }
          envFrom:
            - configMapRef: { name: qltrungtam-config }
            - secretRef: { name: qltrungtam-app }
          env:
            - name: POD_NAMESPACE
              valueFrom: { fieldRef: { fieldPath: metadata.namespace } }
          startupProbe:
            httpGet: { path: /api/health, port: http }
            failureThreshold: 30
            periodSeconds: 5
            timeoutSeconds: 3
          readinessProbe:
            httpGet: { path: /api/health, port: http }
            periodSeconds: 10
            timeoutSeconds: 3
            failureThreshold: 3
          livenessProbe:
            tcpSocket: { port: http }
            periodSeconds: 20
            timeoutSeconds: 3
            failureThreshold: 3
          lifecycle:
            preStop:
              # Cho Envoy kịp bỏ endpoint trước khi Next.js dừng nhận request
              sleep: { seconds: 10 }
          resources: {{- toYaml .Values.resources | nindent 12 }}
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: ["ALL"] }
            readOnlyRootFilesystem: true
          volumeMounts:
            - { name: tmp, mountPath: /tmp }
      volumes:
        - name: tmp
          emptyDir: { sizeLimit: 128Mi }
---
{{- range $svc := list "stable" "canary" }}
apiVersion: v1
kind: Service
metadata:
  name: qltrungtam-{{ $svc }}
  labels: {{- include "qltt.selector" $ | nindent 4 }}
spec:
  selector: {{- include "qltt.selector" $ | nindent 4 }}
  ports:
    - { name: http, port: 3000, targetPort: http, protocol: TCP }
---
{{- end }}
```

> `lifecycle.preStop.sleep` là tính năng Kubernetes ≥ 1.30. Image Next.js không có `sh`/`sleep` ngoài
> busybox của alpine nên dùng kiểu `sleep` gốc là gọn nhất.

### 3.2 HTTPRoute tách rule theo nhóm nghiệp vụ

Mỗi rule trở thành một cluster riêng trong Envoy, nên Day 6/7 có metrics độ trễ/lỗi **theo nhóm route**
ngay ở edge mà không sửa app. Mọi rule phải liệt kê cả `stable` và `canary` để plugin Rollouts chỉnh
weight.

```yaml
# gitops/apps/qltrungtam/chart/templates/httproute.yaml
{{- $backends := list (dict "name" "qltrungtam-stable" "port" 3000 "weight" 100) (dict "name" "qltrungtam-canary" "port" 3000 "weight" 0) }}
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: qltrungtam
spec:
  parentRefs:
    - name: edge
      namespace: gateway
      sectionName: https
  hostnames:
    - {{ .Values.host }}
  rules:
    - name: pay-page
      matches: [{ path: { type: PathPrefix, value: /pay } }]
      backendRefs: {{- toYaml $backends | nindent 8 }}
    - name: pay-api
      matches: [{ path: { type: PathPrefix, value: /api/pay } }]
      backendRefs: {{- toYaml $backends | nindent 8 }}
    - name: sepay-webhook
      matches: [{ path: { type: PathPrefix, value: /api/webhook/sepay } }]
      timeouts: { request: 30s }
      backendRefs: {{- toYaml $backends | nindent 8 }}
    - name: default
      matches: [{ path: { type: PathPrefix, value: / } }]
      backendRefs: {{- toYaml $backends | nindent 8 }}
```

> Trường `name` của rule có từ Gateway API v1.3 (standard). Nếu CRD bản cũ hơn báo lỗi, xoá các
> dòng `name:`.

### 3.3 PDB, HPA, NetworkPolicy

```yaml
# gitops/apps/qltrungtam/chart/templates/policy.yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: qltrungtam
spec:
  minAvailable: {{ .Values.pdb.minAvailable }}
  selector:
    matchLabels: {{- include "qltt.selector" . | nindent 6 }}
{{- if .Values.hpa.enabled }}
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: qltrungtam
spec:
  scaleTargetRef:
    apiVersion: argoproj.io/v1alpha1
    kind: Rollout
    name: qltrungtam
  minReplicas: {{ .Values.hpa.min }}
  maxReplicas: {{ .Values.hpa.max }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: {{ .Values.hpa.cpu }} }
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
{{- end }}
{{- if .Values.networkPolicy.enabled }}
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
spec:
  podSelector: {}
  policyTypes: [Ingress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-from-gateway
spec:
  podSelector:
    matchLabels: {{- include "qltt.selector" . | nindent 6 }}
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: envoy-gateway-system }
      ports: [{ port: 3000 }]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: postgres-from-app-and-operator
spec:
  podSelector:
    matchLabels: { cnpg.io/cluster: qltrungtam-postgres }
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector: {}                                  # pooler, migrate job, instance khác
        - namespaceSelector:
            matchLabels: { kubernetes.io/metadata.name: cnpg-system }
      ports: [{ port: 5432 }, { port: 8000 }]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: pooler-from-namespace
spec:
  podSelector:
    matchLabels: { cnpg.io/poolerName: qltrungtam-pooler-rw }
  policyTypes: [Ingress]
  ingress:
    - from: [{ podSelector: {} }]
      ports: [{ port: 5432 }]
{{- end }}
```

### 3.4 Migration (PreSync) và seed bootstrap (PostSync)

```yaml
# gitops/apps/qltrungtam/chart/templates/hooks.yaml
{{- $image := printf "%s:%s" .Values.image.migrateRepository .Values.image.tag }}
apiVersion: batch/v1
kind: Job
metadata:
  name: qltrungtam-migrate
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 600
  template:
    spec:
      restartPolicy: Never
      imagePullSecrets: [{ name: ocir-pull }]
      {{- with .Values.nodeSelector }}
      nodeSelector: {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: migrate
          image: {{ $image }}
          command: ["sh", "-ec", 'DATABASE_URL="$DIRECT_DATABASE_URL" exec npx prisma migrate deploy']
          envFrom:
            - secretRef: { name: qltrungtam-app }
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits: { memory: 768Mi }
---
apiVersion: batch/v1
kind: Job
metadata:
  name: qltrungtam-seed-bootstrap
  annotations:
    argocd.argoproj.io/hook: PostSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      imagePullSecrets: [{ name: ocir-pull }]
      {{- with .Values.nodeSelector }}
      nodeSelector: {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: seed
          image: {{ $image }}
          # SEED_DEMO=false từ ConfigMap: chỉ upsert admin + AppSetting, không xoá dữ liệu
          command: ["sh", "-ec", 'test "$SEED_DEMO" = "false" && DATABASE_URL="$DIRECT_DATABASE_URL" exec npx tsx prisma/seed.ts']
          envFrom:
            - configMapRef: { name: qltrungtam-config }
            - secretRef: { name: qltrungtam-app }
```

> **Quy tắc migration với canary**: PreSync chạy migration *trước khi* canary bắt đầu, trong lúc bản cũ
> vẫn nhận 90–100% traffic. Mọi migration trong lab phải **tương thích ngược** (expand trước, contract ở
> release sau). `git revert` image **không** revert schema.

---

## 4. Application cho workload

```yaml
# gitops/bootstrap/apps/templates/workloads.yaml
{{- range $env := list "staging" "prod" }}
{{- $cluster := index $.Values.clusterInfo $env }}
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: qltrungtam-base-{{ $env }}
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "10"
  # cố ý KHÔNG có finalizer: xoá Application không xoá DB
spec:
  project: default
  destination:
    server: {{ $cluster.server }}
    namespace: qltrungtam
  source:
    repoURL: {{ $.Values.repoURL }}
    targetRevision: {{ $.Values.revision }}
    path: gitops/apps/qltrungtam-base
    helm:
      valueFiles:
        - values.yaml
        - ../../envs/{{ $env }}/base-values.yaml
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true, ServerSideApply=true]
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: qltrungtam-{{ $env }}
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: "20"
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  destination:
    server: {{ $cluster.server }}
    namespace: qltrungtam
  source:
    repoURL: {{ $.Values.repoURL }}
    targetRevision: {{ $.Values.revision }}
    path: gitops/apps/qltrungtam/chart
    helm:
      valueFiles:
        - values.yaml
        - ../../../envs/{{ $env }}/values.yaml
  # Rollouts sửa weight trong HTTPRoute khi canary; Argo CD không được "sửa lại"
  ignoreDifferences:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      jqPathExpressions:
        - .spec.rules[].backendRefs[].weight
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [ServerSideApply=true, RespectIgnoreDifferences=true]
{{- end }}
```

Thay `<OS_NAMESPACE>` và `example.com` rồi render thử cục bộ:

```bash
helm template t gitops/apps/qltrungtam-base -f gitops/envs/prod/base-values.yaml | grep -n 'DATABASE_URL'   # phải còn {{ .dbPassword }}
helm template t gitops/apps/qltrungtam/chart -f gitops/envs/prod/values.yaml --set image.tag=abc | kubectl apply --dry-run=client -f - 2>&1 | tail -3
```

---

## 5. Pipeline `app-lab.yml`

### 5.1 Chuẩn bị GitHub

```bash
source ~/.qltt-lab.env
cd "$LAB_REPO/infra/oci/envs/foundation"
CI=$(tofu output -json ci)
gh secret set OCIR_TOKEN --env lab-build --body "$(jq -r .ocir_token <<<"$CI")"
gh variable set OCIR_USERNAME --env lab-build --body "$OS_NAMESPACE/$(jq -r .ocir_username <<<"$CI")"
gh variable set OS_NAMESPACE --body "$OS_NAMESPACE"
unset CI

# Deploy key có quyền ghi, chỉ dùng để bot commit gitops/envs/staging
ssh-keygen -t ed25519 -N '' -C qltt-lab-bot -f /tmp/qltt-bot
gh repo deploy-key add /tmp/qltt-bot.pub --title qltt-lab-bot --allow-write
gh secret set BOT_DEPLOY_KEY --env lab-build < /tmp/qltt-bot
shred -u /tmp/qltt-bot /tmp/qltt-bot.pub
```

- Tạo Environment `lab-build` (chỉ branch `oci-lab`) và `lab-prod` (Required reviewers: chính bạn;
  bỏ chọn "Prevent self-review").
- **Settings → Rules → Rulesets** cho `oci-lab`: thêm **Deploy keys** vào Bypass list. Bot đẩy thẳng
  bản cập nhật staging, không cần PR; con người vẫn phải qua PR.
- Repo **private**: runner `ubuntu-24.04-arm` có thể không khả dụng với gói của bạn. Khi đó bỏ job arm64
  và build arm64 bằng QEMU trên runner amd64 (chậm 3–5 lần, Next.js build có thể mất 20+ phút).

### 5.2 Workflow

```yaml
# .github/workflows/app-lab.yml
name: app-lab
on:
  push:
    branches: [oci-lab]
    paths:
      - "src/**"
      - "prisma/**"
      - "public/**"
      - "scripts/**"
      - "package.json"
      - "package-lock.json"
      - "next.config.ts"
      - "deploy/oci-lab/**"
      - ".github/workflows/app-lab.yml"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: app-lab
  cancel-in-progress: false

env:
  REGISTRY: ap-kulai-2.ocir.io
  IMAGE_APP: ap-kulai-2.ocir.io/${{ vars.OS_NAMESPACE }}/qltrungtam
  IMAGE_MIGRATE: ap-kulai-2.ocir.io/${{ vars.OS_NAMESPACE }}/qltrungtam-migrate

jobs:
  build:
    strategy:
      matrix:
        include:
          - { arch: amd64, runner: ubuntu-24.04 }
          - { arch: arm64, runner: ubuntu-24.04-arm }
    runs-on: ${{ matrix.runner }}
    environment: lab-build
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ vars.OCIR_USERNAME }}
          password: ${{ secrets.OCIR_TOKEN }}
      - id: app
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deploy/oci-lab/Dockerfile
          platforms: linux/${{ matrix.arch }}
          outputs: type=image,name=${{ env.IMAGE_APP }},push-by-digest=true,name-canonical=true,push=true
          cache-from: type=gha,scope=app-${{ matrix.arch }}
          cache-to: type=gha,mode=max,scope=app-${{ matrix.arch }}
          provenance: false
      - id: migrate
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deploy/oci-lab/Dockerfile.migrate
          platforms: linux/${{ matrix.arch }}
          outputs: type=image,name=${{ env.IMAGE_MIGRATE }},push-by-digest=true,name-canonical=true,push=true
          cache-from: type=gha,scope=migrate-${{ matrix.arch }}
          cache-to: type=gha,mode=max,scope=migrate-${{ matrix.arch }}
          provenance: false
      - run: |
          mkdir -p digests
          echo "${{ steps.app.outputs.digest }}" > digests/app-${{ matrix.arch }}
          echo "${{ steps.migrate.outputs.digest }}" > digests/migrate-${{ matrix.arch }}
      - uses: actions/upload-artifact@v4
        with:
          name: digests-${{ matrix.arch }}
          path: digests/

  publish:
    needs: build
    runs-on: ubuntu-24.04
    environment: lab-build
    outputs:
      tag: ${{ steps.tag.outputs.tag }}
    steps:
      - id: tag
        run: echo "tag=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"
      - uses: actions/download-artifact@v4
        with: { pattern: digests-*, merge-multiple: true, path: digests }
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ vars.OCIR_USERNAME }}
          password: ${{ secrets.OCIR_TOKEN }}
      - name: Manifest list
        run: |
          T=${{ steps.tag.outputs.tag }}
          docker buildx imagetools create -t "$IMAGE_APP:$T" \
            "$IMAGE_APP@$(cat digests/app-amd64)" "$IMAGE_APP@$(cat digests/app-arm64)"
          docker buildx imagetools create -t "$IMAGE_MIGRATE:$T" \
            "$IMAGE_MIGRATE@$(cat digests/migrate-amd64)" "$IMAGE_MIGRATE@$(cat digests/migrate-arm64)"
          docker buildx imagetools inspect "$IMAGE_APP:$T"
      - name: Trivy
        uses: aquasecurity/trivy-action@0.33.1
        env:
          TRIVY_USERNAME: ${{ vars.OCIR_USERNAME }}
          TRIVY_PASSWORD: ${{ secrets.OCIR_TOKEN }}
        with:
          image-ref: ${{ env.IMAGE_APP }}:${{ steps.tag.outputs.tag }}
          severity: CRITICAL
          ignore-unfixed: true
          exit-code: "1"

  deploy-staging:
    needs: publish
    runs-on: ubuntu-24.04
    environment: lab-build
    steps:
      - uses: actions/checkout@v4
        with:
          ref: oci-lab
          ssh-key: ${{ secrets.BOT_DEPLOY_KEY }}
      - name: Bump staging
        run: |
          T=${{ needs.publish.outputs.tag }}
          yq -i ".image.tag = \"$T\"" gitops/envs/staging/values.yaml
          git config user.name qltt-lab-bot
          git config user.email qltt-lab-bot@users.noreply.github.com
          git commit -am "deploy(staging): qltrungtam $T"
          git push origin HEAD:oci-lab
```

> Commit của bot chỉ sửa `gitops/`, nằm ngoài `paths` của workflow nên không tạo vòng lặp build.

### 5.3 Promote prod

```yaml
# .github/workflows/promote.yml
name: promote-prod
on:
  workflow_dispatch:
    inputs:
      tag:
        description: "Tag cần promote (để trống = tag đang chạy ở staging)"
        required: false

permissions:
  contents: write
  pull-requests: write

jobs:
  promote:
    runs-on: ubuntu-24.04
    environment: lab-prod          # dừng chờ bạn duyệt
    steps:
      - uses: actions/checkout@v4
        with: { ref: oci-lab }
      - id: t
        run: |
          T="${{ inputs.tag }}"
          [ -z "$T" ] && T=$(yq '.image.tag' gitops/envs/staging/values.yaml)
          CUR=$(yq '.image.tag' gitops/envs/prod/values.yaml)
          echo "tag=$T" >> "$GITHUB_OUTPUT"; echo "cur=$CUR" >> "$GITHUB_OUTPUT"
          yq -i ".image.tag = \"$T\"" gitops/envs/prod/values.yaml
      - uses: peter-evans/create-pull-request@v7
        with:
          token: ${{ secrets.PROMOTE_PAT }}      # PAT fine-grained: để CI chạy trên PR
          branch: promote/prod-${{ steps.t.outputs.tag }}
          base: oci-lab
          title: "promote(prod): qltrungtam ${{ steps.t.outputs.tag }}"
          commit-message: "promote(prod): qltrungtam ${{ steps.t.outputs.tag }}"
          body: |
            ${{ steps.t.outputs.cur }} → ${{ steps.t.outputs.tag }}

            - [ ] Staging đang chạy tag này, Rollout `Healthy`
            - [ ] Migration trong bản này tương thích ngược
            - [ ] Không có alert đang firing ở staging

            Rollback: revert PR này.
```

PR tạo bằng `GITHUB_TOKEN` không kích hoạt workflow khác, nên required checks không chạy và PR không
merge được. Dùng PAT fine-grained (quyền `Contents` + `Pull requests` trên repo này, hết hạn sau lab),
lưu vào secret `PROMOTE_PAT` của environment `lab-prod`.

---

## 6. Lần deploy đầu

```bash
cd "$LAB_REPO"
git add deploy/oci-lab gitops .github/workflows/{app-lab,promote}.yml
git commit -m "feat(oci-lab): app chart, cnpg base, build and promote pipelines"
git push -u origin feat/oci-app-delivery
gh pr create --base oci-lab --fill && gh pr merge --squash --auto
```

Sau khi merge, `app-lab` chạy (lần đầu không cache ~15–20 phút). Theo dõi:

```bash
gh run watch
argocd app list | grep qltrungtam
ks -n qltrungtam get cluster,pooler,externalsecret,pods
ks -n qltrungtam get jobs
kubectl argo rollouts --context qltt-staging -n qltrungtam get rollout qltrungtam --watch
```

Base app lần đầu tạo DB mất 3–5 phút. App wave 20 chờ base `Healthy`.

Promote prod lần đầu: **Actions → promote-prod → Run workflow** → duyệt environment → merge PR.

```bash
kp -n qltrungtam get cluster qltrungtam-postgres -o jsonpath='{.status.instancesStatus}{"\n"}'
kp -n qltrungtam get pods -l cnpg.io/cluster=qltrungtam-postgres -o wide \
  | awk 'NR>1{print $1, $7}' | while read p n; do
      echo "$p $(kp get node $n -o jsonpath='{.metadata.labels.oci\.oraclecloud\.com/fault-domain}')"; done
kubectl cnpg --context qltt-prod -n qltrungtam status qltrungtam-postgres
```

Kỳ vọng: 3 instance ở 3 FD khác nhau, `Continuous Backup status: OK`, `First Point of Recoverability`
có giá trị sau khi backup `immediate` xong.

Smoke test:

```bash
curl -s "https://qltt.${LAB_DOMAIN}/api/health"                  # {"status":"ok","database":"reachable"}
curl -s -o /dev/null -w '%{http_code}\n' "https://qltt.${LAB_DOMAIN}/login"
PASS=$(oci secrets secret-bundle get-secret-bundle-by-name --vault-id "$(cd infra/oci/envs/foundation && tofu output -raw vault_id)" \
  --secret-name qltt-admin-password --query 'data."secret-bundle-content".content' --raw-output | base64 -d)
echo "Đăng nhập https://qltt.${LAB_DOMAIN}/login bằng admin / (mật khẩu vừa lấy)"
```

---

## 7. Kiểm tra DoD

### 7.1 Merge → staging ≤ 10 phút

Tạo thay đổi nhỏ nhìn thấy được (ví dụ chữ trong footer), merge PR, rồi:

```bash
PR=<số PR>
MERGED=$(gh pr view $PR --json mergedAt -q .mergedAt)
T=$(git rev-parse --short=12 "$(gh pr view $PR --json mergeCommit -q .mergeCommit.oid)")
until kubectl argo rollouts --context qltt-staging -n qltrungtam get rollout qltrungtam 2>/dev/null \
      | grep -q "Images:.*$T.*stable"; do sleep 15; done
echo "merge: $MERGED  →  staging stable: $(date -u +%FT%TZ)"
```

Nếu vượt 10 phút, tìm chỗ chậm: build (cache GHA), Argo poll (`timeout.reconciliation`), canary pause
(staging có thể dùng `canary.steps` ngắn hơn trong `envs/staging/values.yaml`).

### 7.2 Rollback bằng `git revert`

```bash
git switch oci-lab && git pull
git log --oneline -3 -- gitops/envs/prod/values.yaml
git switch -c rollback/prod && git revert --no-edit <commit promote>
git push -u origin rollback/prod && gh pr create --base oci-lab --fill
# merge PR
kubectl argo rollouts --context qltt-prod -n qltrungtam get rollout qltrungtam --watch
```

Kỳ vọng: vì bản cũ nằm trong `rollbackWindow`, Rollout chuyển thẳng về stable cũ mà không đi qua các
bước canary. Ghi thời gian từ merge đến khi xong.

### 7.3 NetworkPolicy có được enforce?

```bash
kp -n default run np-test --rm -i --restart=Never --image=busybox:1.36 -- \
  sh -c 'nc -zvw3 qltrungtam-stable.qltrungtam.svc 3000; nc -zvw3 qltrungtam-postgres-rw.qltrungtam.svc 5432'
```

| Kết quả | Ý nghĩa | Việc cần làm |
| --- | --- | --- |
| `Connection timed out` cả hai | Policy được enforce | Ghi nhận |
| `open` | OKE VCN-native trong cấu hình này **không enforce** NetworkPolicy | Ghi vào báo cáo như giới hạn đã biết. Giữ manifest (portable). Lớp bảo vệ thực tế là NSG + mật khẩu DB + TLS. Stretch: tìm hiểu tuỳ chọn network policy engine mà OKE hỗ trợ cho VCN-native tại thời điểm làm lab. |

---

## Lỗi hay gặp

| Triệu chứng | Nguyên nhân | Xử lý |
| --- | --- | --- |
| `ImagePullBackOff` 401 | Secret `ocir-pull` sai định dạng username (`<namespace>/<user>`) hoặc auth token mới chưa có hiệu lực | `ks -n qltrungtam get secret ocir-pull -o jsonpath='{.data.\.dockerconfigjson}' \| base64 -d` |
| `exec format error` trên staging | Manifest list thiếu arm64 | `docker buildx imagetools inspect` |
| Prisma báo `Query engine library for current platform "linux-musl-arm64-openssl-3.0.x" could not be found` | `prisma generate` chạy trên kiến trúc khác kiến trúc image | Build native từng arch (như workflow) hoặc thêm `binaryTargets` |
| Migrate job `P1001` | Base app chưa `Healthy`, hoặc `DIRECT_DATABASE_URL` rỗng do quên escape template ESO | `ks -n qltrungtam get secret qltrungtam-app -o jsonpath='{.data.DIRECT_DATABASE_URL}' \| base64 -d \| sed 's/:[^:@]*@/:***@/'` |
| `prepared statement "s0" already exists` | Thiếu `pgbouncer=true` | Kiểm tra `DATABASE_URL` |
| CNPG instance thứ 3 `Pending` | Anti-affinity `required` theo FD mà pool `app` chưa đủ 3 FD | Xem Day 2 §8 |
| Backup `failed` với lỗi checksum / `InvalidArgument` | Thiếu env checksum ở `instanceSidecarConfiguration` | Xem ObjectStore §2.2 |
| Canary treo ở 10% mãi, app Argo `OutOfSync` | Thiếu `ignoreDifferences` cho weight, Argo và Rollouts giằng co | Xem §4 |
| HTTPRoute `Accepted=False` với `NotAllowedByListeners` | Listener `https` chưa `allowedRoutes: All` | Day 3 §3.4 |
| Mất toàn bộ dữ liệu sau deploy | Seed chạy với `SEED_DEMO` khác `false` | Kiểm tra ConfigMap; restore theo Day 9 G4 |
