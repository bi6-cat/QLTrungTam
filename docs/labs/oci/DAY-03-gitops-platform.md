# Day 3 · Bootstrap GitOps và platform

> Thời lượng: ~5 giờ · Chi phí: ~$16 · Đầu vào: 2 cluster Day 2 `Ready`, context `qltt-prod`/`qltt-staging`.

## Kết quả cuối ngày (DoD)

- [ ] Argo CD chạy trên pool `system` của prod, **tự quản lý chính nó**, quản lý thêm cluster staging.
- [ ] Toàn bộ platform cài qua Argo CD theo sync wave, trạng thái `Synced/Healthy` trên cả 2 cluster.
- [ ] `https://argocd.${LAB_DOMAIN}` có chứng chỉ Let's Encrypt hợp lệ (wildcard), DNS record do
      external-dns tạo.
- [ ] Không có secret nào trong Git: token Cloudflare đi từ OCI Vault → ESO → Secret.
- [ ] Xoá tay Deployment `external-dns` trên prod, Argo CD dựng lại trong **< 3 phút**.

## Bức tranh tổng

```text
bootstrap-argocd.sh (chạy 1 lần từ máy bạn)
  ├─ helm install argo-cd (values trong Git)
  ├─ đăng ký cluster staging (Secret cluster, không nằm trong Git)
  └─ apply root Application  ──► gitops/bootstrap/apps (Helm chart sinh Application)
                                   │  valuesObject: OCID NSG/subnet lấy từ tofu output
                                   ▼
wave  -40 argocd (tự quản lý)                          prod
      -30 external-secrets                             prod, staging
      -25 secrets-config  (ClusterSecretStore, ExternalSecret Cloudflare)
      -20 envoy-gateway   (kèm Gateway API CRD)
      -15 gateway-config  (EnvoyProxy→NLB, GatewayClass, Gateway, redirect)
      -10 cert-manager, external-dns
       -5 edge-config     (ClusterIssuer, HTTPRoute argocd, RBAC Rollouts)
        0 cloudnative-pg, argo-rollouts
        5 plugin-barman-cloud
       10 ứng dụng (Day 4)
```

Vì sao ESO đứng trước cert-manager và vì sao Argo CD không cài bằng Tofu: xem README D3, D4.

---

## 1. Tofu: quyền đọc Vault cho ESO

### 1.1 Prod (Enhanced): Workload Identity

```hcl
# infra/oci/envs/lab/iam-eso.tf
resource "oci_identity_policy" "eso_prod" {
  provider       = oci.home
  compartment_id = var.compartment_ocid
  name           = "qltt-prod-eso"
  description    = "Workload identity: external-secrets/external-secrets on qltt-prod"
  statements = [
    "Allow any-user to read secret-family in compartment id ${var.compartment_ocid} where ALL {request.principal.type='workload', request.principal.cluster_id='${module.prod.id}', request.principal.namespace='external-secrets', request.principal.service_account='external-secrets'}",
  ]
}
```

### 1.2 Staging (Basic): Instance Principal qua dynamic group

Cluster Basic không có Workload Identity. Node staging mang defined tag `qltt.cluster=staging` (Day 2).

```hcl
resource "oci_identity_dynamic_group" "staging_nodes" {
  provider       = oci.home
  compartment_id = var.tenancy_ocid
  name           = "qltt-staging-nodes"
  description    = "Worker nodes of qltt-staging"
  matching_rule  = "ALL {instance.compartment.id = '${var.compartment_ocid}', tag.${local.tag_ns}.cluster.value = 'staging'}"
}

resource "oci_identity_policy" "eso_staging" {
  provider       = oci.home
  compartment_id = var.compartment_ocid
  name           = "qltt-staging-eso"
  description    = "Instance principal for staging nodes"
  statements = [
    "Allow dynamic-group 'Default'/'qltt-staging-nodes' to read secret-family in compartment id ${var.compartment_ocid}",
  ]
}
```

> **Giới hạn cần ghi vào báo cáo**: Instance Principal cấp quyền cho *mọi pod* trên node staging, và
> policy trên cho đọc *mọi secret* trong compartment, kể cả secret prod. Stretch: thêm điều kiện
> `where target.secret.name = '...'` cho từng secret `*-staging` rồi kiểm tra ESO staging không đọc
> được `qltt-session-secret-prod`.

### 1.3 Output cho bootstrap

```hcl
# infra/oci/envs/lab/outputs.tf (bổ sung)
output "prod_cluster_id" { value = module.prod.id }
output "staging_cluster_id" { value = module.staging.id }
output "staging_private_endpoint" { value = module.staging.private_endpoint }
output "nsg_ids" { value = module.network.nsg_ids }
output "subnet_ids" { value = module.network.subnet_ids }
output "vault_id" { value = local.f.vault_id }
```

```bash
cd "$LAB_REPO/infra/oci/envs/lab" && tofu apply
```

---

## 2. Cấu trúc `gitops/`

```bash
cd "$LAB_REPO" && git switch oci-lab && git pull && git switch -c feat/oci-gitops-platform
mkdir -p gitops/bootstrap/apps/templates \
         gitops/platform/{argocd,external-secrets,envoy-gateway,cert-manager,external-dns,cloudnative-pg,argo-rollouts,plugin-barman-cloud} \
         gitops/platform/{secrets-config,gateway-config,edge-config}/templates
```

```text
gitops/
  bootstrap/
    root-app.yaml.tpl           # envsubst bởi bootstrap script
    repos.yaml                  # repo Helm OCI (không có credential)
    apps/                       # Helm chart sinh Application
      Chart.yaml
      values.yaml               # danh sách addon, wave, cluster
      templates/applications.yaml
  platform/
    <addon upstream>/values.yaml, values-prod.yaml, values-staging.yaml
    <addon cấu hình>/Chart.yaml, values.yaml, templates/*.yaml   # chart cục bộ
```

### 2.1 Chart sinh Application

```yaml
# gitops/bootstrap/apps/Chart.yaml
apiVersion: v2
name: qltt-apps
version: 0.1.0
```

```yaml
# gitops/bootstrap/apps/values.yaml
repoURL: https://github.com/bi6-cat/QLTrungTam.git
revision: oci-lab

# clusterInfo được root-app truyền vào (valuesObject), không commit OCID
clusterInfo: {}

addons:
  - name: argocd
    namespace: argocd
    wave: -40
    clusters: [prod]
    repoURL: https://argoproj.github.io/argo-helm
    chart: argo-cd
    version: "<ARGOCD_CHART_VERSION>"

  - name: external-secrets
    namespace: external-secrets
    wave: -30
    clusters: [prod, staging]
    repoURL: https://charts.external-secrets.io
    chart: external-secrets
    version: "<ESO_CHART_VERSION>"

  - name: secrets-config
    namespace: external-secrets
    wave: -25
    clusters: [prod, staging]
    local: true

  - name: envoy-gateway
    namespace: envoy-gateway-system
    wave: -20
    clusters: [prod, staging]
    repoURL: docker.io/envoyproxy          # Helm OCI, cần repo secret enableOCI (repos.yaml)
    chart: gateway-helm
    version: "<ENVOY_GATEWAY_VERSION>"

  - name: gateway-config
    namespace: gateway
    wave: -15
    clusters: [prod, staging]
    local: true

  - name: cert-manager
    namespace: cert-manager
    wave: -10
    clusters: [prod, staging]
    repoURL: https://charts.jetstack.io
    chart: cert-manager
    version: "<CERT_MANAGER_VERSION>"

  - name: external-dns
    namespace: external-dns
    wave: -10
    clusters: [prod, staging]
    repoURL: https://kubernetes-sigs.github.io/external-dns/
    chart: external-dns
    version: "<EXTERNAL_DNS_CHART_VERSION>"

  - name: edge-config
    namespace: gateway
    wave: -5
    clusters: [prod, staging]
    local: true

  - name: cloudnative-pg
    namespace: cnpg-system
    wave: 0
    clusters: [prod, staging]
    repoURL: https://cloudnative-pg.github.io/charts
    chart: cloudnative-pg
    version: "<CNPG_CHART_VERSION>"

  - name: argo-rollouts
    namespace: argo-rollouts
    wave: 0
    clusters: [prod, staging]
    repoURL: https://argoproj.github.io/argo-helm
    chart: argo-rollouts
    version: "<ROLLOUTS_CHART_VERSION>"

  - name: plugin-barman-cloud
    namespace: cnpg-system
    wave: 5
    clusters: [prod, staging]
    repoURL: https://cloudnative-pg.github.io/charts
    chart: plugin-barman-cloud
    version: "<BARMAN_PLUGIN_CHART_VERSION>"
```

```yaml
# gitops/bootstrap/apps/templates/applications.yaml
{{- range $addon := .Values.addons }}
{{- range $clusterName := $addon.clusters }}
{{- $cluster := index $.Values.clusterInfo $clusterName }}
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{ $addon.name }}-{{ $clusterName }}
  namespace: argocd
  annotations:
    argocd.argoproj.io/sync-wave: {{ $addon.wave | quote }}
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  destination:
    server: {{ $cluster.server }}
    namespace: {{ $addon.namespace }}
  sources:
  {{- if $addon.local }}
    - repoURL: {{ $.Values.repoURL }}
      targetRevision: {{ $.Values.revision }}
      path: gitops/platform/{{ $addon.name }}
      helm:
        ignoreMissingValueFiles: true
        valueFiles:
          - values.yaml
          - values-{{ $clusterName }}.yaml
        valuesObject:
          cluster:
            name: {{ $clusterName }}
            {{- toYaml $cluster | nindent 12 }}
  {{- else }}
    - repoURL: {{ $addon.repoURL }}
      chart: {{ $addon.chart }}
      targetRevision: {{ $addon.version | quote }}
      helm:
        releaseName: {{ $addon.releaseName | default $addon.name }}
        ignoreMissingValueFiles: true
        valueFiles:
          - $values/gitops/platform/{{ $addon.name }}/values.yaml
          - $values/gitops/platform/{{ $addon.name }}/values-{{ $clusterName }}.yaml
    - repoURL: {{ $.Values.repoURL }}
      targetRevision: {{ $.Values.revision }}
      ref: values
  {{- end }}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
    retry:
      limit: 10
      backoff:
        duration: 15s
        factor: 2
        maxDuration: 5m
{{- end }}
{{- end }}
```

Kiểm tra render trước khi commit:

```bash
helm template gitops/bootstrap/apps \
  --set-json 'clusterInfo={"prod":{"server":"https://kubernetes.default.svc"},"staging":{"server":"https://10.60.0.5:6443"}}' \
  | grep -E '^  name:|sync-wave' | paste - - | head -30
```

### 2.2 Argo CD values

```yaml
# gitops/platform/argocd/values.yaml
global:
  domain: argocd.lab.example.com         # đổi thành argocd.${LAB_DOMAIN}
  nodeSelector:
    qltt/pool: system
  tolerations:
    - key: qltt/pool
      operator: Equal
      value: system
      effect: NoSchedule

configs:
  params:
    server.insecure: true                # TLS kết thúc ở Envoy Gateway
  cm:
    timeout.reconciliation: 120s
    # Bắt buộc để sync wave giữa các Application có tác dụng (Argo CD không tính health
    # của Application con theo mặc định)
    resource.customizations.health.argoproj.io_Application: |
      hs = {}
      hs.status = "Progressing"
      hs.message = ""
      if obj.status ~= nil and obj.status.health ~= nil then
        hs.status = obj.status.health.status
        if obj.status.health.message ~= nil then
          hs.message = obj.status.health.message
        end
      end
      return hs

dex:
  enabled: false

redis:
  resources:
    requests: { cpu: 50m, memory: 64Mi }

controller:
  resources:
    requests: { cpu: 250m, memory: 512Mi }
    limits: { memory: 1Gi }
```

> Tự quản lý: Application `argocd-prod` dùng chính file này. Bootstrap cũng cài bằng file này, nên
> lần sync đầu gần như không có diff. Muốn đổi cấu hình Argo CD thì sửa file và merge PR, không
> `helm upgrade` tay nữa.

### 2.3 Repo Helm OCI và root app

```yaml
# gitops/bootstrap/repos.yaml
apiVersion: v1
kind: Secret
metadata:
  name: repo-envoyproxy-oci
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: helm
  name: envoyproxy
  url: docker.io/envoyproxy
  enableOCI: "true"
```

```yaml
# gitops/bootstrap/root-app.yaml.tpl
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/${GITHUB_REPO}.git
    targetRevision: ${LAB_BRANCH}
    path: gitops/bootstrap/apps
    helm:
      valuesObject:
        clusterInfo:
          prod:
            server: https://kubernetes.default.svc
            arch: amd64
            systemPool: true
            nlbNsgId: ${NSG_NLB}
            nlbInternalNsgId: ${NSG_NLB_INTERNAL}
            publicSubnetId: ${SN_PUBLIC}
          staging:
            server: https://${STG_PRIVATE_ENDPOINT}
            arch: arm64
            systemPool: false
            nlbNsgId: ${NSG_NLB}
            nlbInternalNsgId: ${NSG_NLB_INTERNAL}
            publicSubnetId: ${SN_PUBLIC}
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

### 2.4 Script bootstrap

```bash
# infra/oci/scripts/bootstrap-argocd.sh
#!/usr/bin/env bash
set -euo pipefail
source ~/.qltt-lab.env
: "${ARGOCD_CHART_VERSION:?điền theo README §5}"
cd "$LAB_REPO"

[[ "$(kubectl config get-contexts -o name | grep -c '^qltt-')" -ge 2 ]] || { echo "thiếu context"; exit 1; }
KP="kubectl --context qltt-prod"
KS="kubectl --context qltt-staging"

# 1. Thông tin hạ tầng từ Tofu
pushd infra/oci/envs/lab >/dev/null
export STG_PRIVATE_ENDPOINT=$(tofu output -raw staging_private_endpoint)
export NSG_NLB=$(tofu output -json nsg_ids | jq -r .nlb)
export NSG_NLB_INTERNAL=$(tofu output -json nsg_ids | jq -r .nlb_internal)
export SN_PUBLIC=$(tofu output -json subnet_ids | jq -r .public)
popd >/dev/null
export GITHUB_REPO LAB_BRANCH

# 2. Argo CD
helm repo add argo https://argoproj.github.io/argo-helm >/dev/null
helm upgrade --install argocd argo/argo-cd --kube-context qltt-prod \
  --namespace argocd --create-namespace \
  --version "$ARGOCD_CHART_VERSION" \
  -f gitops/platform/argocd/values.yaml --wait --timeout 10m
$KP apply -f gitops/bootstrap/repos.yaml

# 2b. Repo private: deploy key chỉ đọc (bỏ qua nếu repo public)
if [[ -f ~/.ssh/qltt-argocd-deploy-key ]]; then
  $KP -n argocd create secret generic repo-qltt --dry-run=client -o yaml \
    --from-literal=type=git --from-literal=url="git@github.com:${GITHUB_REPO}.git" \
    --from-file=sshPrivateKey="$HOME/.ssh/qltt-argocd-deploy-key" \
  | $KP label --local -f - argocd.argoproj.io/secret-type=repository -o yaml | $KP apply -f -
fi

# 3. Đăng ký cluster staging bằng ServiceAccount + token dài hạn
$KS -n kube-system create serviceaccount argocd-manager --dry-run=client -o yaml | $KS apply -f -
$KS create clusterrolebinding argocd-manager --clusterrole=cluster-admin \
  --serviceaccount=kube-system:argocd-manager --dry-run=client -o yaml | $KS apply -f -
$KS apply -f - <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: argocd-manager-token
  namespace: kube-system
  annotations:
    kubernetes.io/service-account.name: argocd-manager
type: kubernetes.io/service-account-token
EOF
sleep 3
TOKEN=$($KS -n kube-system get secret argocd-manager-token -o jsonpath='{.data.token}' | base64 -d)
CA=$($KS -n kube-system get secret argocd-manager-token -o jsonpath='{.data.ca\.crt}')
$KP -n argocd apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: cluster-staging
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: cluster
type: Opaque
stringData:
  name: staging
  server: https://${STG_PRIVATE_ENDPOINT}
  config: |
    {"bearerToken":"${TOKEN}","tlsClientConfig":{"insecure":false,"caData":"${CA}"}}
EOF
unset TOKEN

# 4. Root app
envsubst < gitops/bootstrap/root-app.yaml.tpl | $KP apply -f -
echo "Mật khẩu admin Argo CD:"
$KP -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
```

> Server staging dùng **private endpoint**: pod Argo CD ở prod đi tới `10.60.0.x:6443` trong VCN, NSG
> `api` đã cho phép 6443 từ `sn-pods`. Không phải mở API staging cho IP NAT gateway.

---

## 3. Values từng addon

`values.yaml` là phần chung, `values-prod.yaml` đặt node pool `system`. Staging không có taint nên
không cần `values-staging.yaml` cho phần lập lịch.

Đường dẫn khoá `nodeSelector`/`tolerations` khác nhau giữa các chart. Luôn kiểm tra:

```bash
helm show values jetstack/cert-manager --version "$CERT_MANAGER_VERSION" | grep -nE '^\s*(nodeSelector|tolerations):' 
```

Snippet dùng lại (YAML anchor không đi qua được nhiều file, nên chép):

```yaml
nodeSelector: { qltt/pool: system }
tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
```

### 3.1 external-secrets

```yaml
# gitops/platform/external-secrets/values.yaml
installCRDs: true
serviceAccount:
  name: external-secrets        # khớp policy Workload Identity
```

```yaml
# gitops/platform/external-secrets/values-prod.yaml
nodeSelector: { qltt/pool: system }
tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
webhook:
  nodeSelector: { qltt/pool: system }
  tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
certController:
  nodeSelector: { qltt/pool: system }
  tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
# OCI SDK cần 2 biến này để dùng OKE Workload Identity
extraEnv:
  - name: OCI_RESOURCE_PRINCIPAL_VERSION
    value: "2.2"
  - name: OCI_RESOURCE_PRINCIPAL_REGION
    value: ap-kulai-2
```

### 3.2 `secrets-config` (chart cục bộ)

```yaml
# gitops/platform/secrets-config/Chart.yaml
apiVersion: v2
name: secrets-config
version: 0.1.0
```

```yaml
# gitops/platform/secrets-config/values.yaml
vaultId: ocid1.vault.oc1.ap-kulai-2.xxxx     # tofu output vault_id (foundation, không đổi khi rebuild)
region: ap-kulai-2
```

```yaml
# gitops/platform/secrets-config/templates/store.yaml
apiVersion: external-secrets.io/v1
kind: ClusterSecretStore
metadata:
  name: oci-vault
spec:
  provider:
    oracle:
      vault: {{ .Values.vaultId }}
      region: {{ .Values.region }}
      {{- if eq .Values.cluster.name "prod" }}
      principalType: Workload
      serviceAccountRef:
        name: external-secrets
        namespace: external-secrets
      {{- else }}
      principalType: InstancePrincipal
      {{- end }}
```

```yaml
# gitops/platform/secrets-config/templates/cloudflare.yaml
{{- range $ns := list "cert-manager" "external-dns" }}
---
apiVersion: v1
kind: Namespace
metadata:
  name: {{ $ns }}
---
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: cloudflare-api-token
  namespace: {{ $ns }}
spec:
  refreshInterval: 1h
  secretStoreRef:
    kind: ClusterSecretStore
    name: oci-vault
  target:
    name: cloudflare-api-token
  data:
    - secretKey: api-token
      remoteRef:
        key: qltt-cloudflare-api-token
{{- end }}
```

> Namespace `cert-manager`/`external-dns` được tạo ở đây (wave -25) vì ExternalSecret phải có chỗ
> nằm trước khi 2 app kia (wave -10) chạy. Hai app đó có `CreateNamespace=true`, không xung đột.

Kiểm tra sau khi sync:

```bash
kp get clustersecretstore oci-vault -o jsonpath='{.status.conditions[0].message}{"\n"}'   # store validated
kp -n cert-manager get externalsecret cloudflare-api-token                                 # SecretSynced
ks get clustersecretstore oci-vault -o jsonpath='{.status.conditions[0].message}{"\n"}'
```

### 3.3 envoy-gateway

```yaml
# gitops/platform/envoy-gateway/values-prod.yaml
deployment:
  pod:
    nodeSelector: { qltt/pool: system }
    tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
```

Chart `gateway-helm` cài kèm Gateway API CRD (bản standard) và CRD của Envoy Gateway. CRD lớn, vì
vậy mọi Application đều bật `ServerSideApply=true`.

### 3.4 `gateway-config` (chart cục bộ)

```yaml
# gitops/platform/gateway-config/values.yaml
domain: lab.example.com                # = LAB_DOMAIN
issuer: letsencrypt-staging            # đổi sang letsencrypt-prod sau khi kiểm tra (mục 5)
nodePorts: { http: 30080, https: 30443 }   # khớp var.envoy_node_ports ở Day 1
```

```yaml
# gitops/platform/gateway-config/templates/envoyproxy.yaml
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: EnvoyProxy
metadata:
  name: oci-nlb
  namespace: gateway
spec:
  provider:
    type: Kubernetes
    kubernetes:
      envoyDeployment:
        replicas: 2
        pod:
          {{- if .Values.cluster.systemPool }}
          nodeSelector: { qltt/pool: system }
          tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
          {{- end }}
          affinity:
            podAntiAffinity:
              requiredDuringSchedulingIgnoredDuringExecution:
                - topologyKey: kubernetes.io/hostname
                  labelSelector:
                    matchLabels:
                      app.kubernetes.io/component: proxy
        container:
          resources:
            requests: { cpu: 200m, memory: 256Mi }
      envoyService:
        type: LoadBalancer
        # Giữ IP client: NLB preserve source chỉ dùng được với Local
        externalTrafficPolicy: Local
        annotations:
          oci.oraclecloud.com/load-balancer-type: "nlb"
          oci-network-load-balancer.oraclecloud.com/subnet: {{ .Values.cluster.publicSubnetId | quote }}
          oci-network-load-balancer.oraclecloud.com/security-list-management-mode: "None"
          oci-network-load-balancer.oraclecloud.com/oci-network-security-groups: {{ .Values.cluster.nlbNsgId | quote }}
          oci-network-load-balancer.oraclecloud.com/is-preserve-source: "true"
        patch:
          type: StrategicMerge
          value:
            spec:
              ports:
                - port: 80
                  nodePort: {{ .Values.nodePorts.http }}
                - port: 443
                  nodePort: {{ .Values.nodePorts.https }}
```

```yaml
# gitops/platform/gateway-config/templates/gateway.yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: envoy
spec:
  controllerName: gateway.envoyproxy.io/gatewayclass-controller
  parametersRef:
    group: gateway.envoyproxy.io
    kind: EnvoyProxy
    name: oci-nlb
    namespace: gateway
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: edge
  namespace: gateway
  annotations:
    cert-manager.io/cluster-issuer: {{ .Values.issuer }}
spec:
  gatewayClassName: envoy
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces: { from: Same }
    - name: https
      protocol: HTTPS
      port: 443
      hostname: "*.{{ .Values.domain }}"
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-lab-tls
      allowedRoutes:
        namespaces: { from: All }
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: http-to-https
  namespace: gateway
spec:
  parentRefs:
    - name: edge
      sectionName: http
  rules:
    - filters:
        - type: RequestRedirect
          requestRedirect:
            scheme: https
            statusCode: 301
```

> Annotation NLB là của OCI Cloud Controller Manager. Nếu NLB không tạo được, `kubectl describe svc`
> trong namespace `envoy-gateway-system` sẽ hiện lỗi từ CCM; đối chiếu tên annotation với trang
> "Provisioning OCI Network Load Balancers for Kubernetes Services" của OKE.

### 3.5 cert-manager

```yaml
# gitops/platform/cert-manager/values.yaml
crds:
  enabled: true
  keep: true
config:
  apiVersion: controller.config.cert-manager.io/v1alpha1
  kind: ControllerConfiguration
  enableGatewayAPI: true
# DNS-01 kiểm tra TXT qua resolver công cộng, tránh cache DNS nội bộ cluster
extraArgs:
  - --dns01-recursive-nameservers-only
  - --dns01-recursive-nameservers=1.1.1.1:53,8.8.8.8:53
prometheus:
  enabled: true
  servicemonitor:
    enabled: false          # Day 6 bật khi đã có CRD ServiceMonitor
```

```yaml
# gitops/platform/cert-manager/values-prod.yaml
nodeSelector: { qltt/pool: system }
tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
webhook:
  nodeSelector: { qltt/pool: system }
  tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
cainjector:
  nodeSelector: { qltt/pool: system }
  tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
startupapicheck:
  nodeSelector: { qltt/pool: system }
  tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
```

### 3.6 external-dns

```yaml
# gitops/platform/external-dns/values.yaml
provider:
  name: cloudflare
env:
  - name: CF_API_TOKEN
    valueFrom:
      secretKeyRef:
        name: cloudflare-api-token
        key: api-token
sources:
  - gateway-httproute
domainFilters:
  - example.com              # zone apex trên Cloudflare (không phải lab.example.com)
policy: sync
registry: txt
txtPrefix: "_extdns-%{record_type}."
interval: 1m
```

```yaml
# gitops/platform/external-dns/values-prod.yaml
txtOwnerId: qltt-prod
nodeSelector: { qltt/pool: system }
tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
```

```yaml
# gitops/platform/external-dns/values-staging.yaml
txtOwnerId: qltt-staging
```

> `policy: sync` cho phép xoá bản ghi, nhưng external-dns **chỉ** xoá bản ghi có TXT owner khớp
> `txtOwnerId`. Bản ghi bạn tạo tay trong zone không bị đụng tới. Hai cluster dùng owner ID khác nhau
> nên không xoá bản ghi của nhau.

### 3.7 `edge-config` (chart cục bộ)

```yaml
# gitops/platform/edge-config/values.yaml
domain: lab.example.com
zone: example.com
acmeEmail: you@example.com
adminCidrs: []            # để trống nếu repo public và bạn không muốn commit IP nhà
```

```yaml
# gitops/platform/edge-config/templates/issuers.yaml
{{- range $name, $server := dict "letsencrypt-staging" "https://acme-staging-v02.api.letsencrypt.org/directory" "letsencrypt-prod" "https://acme-v02.api.letsencrypt.org/directory" }}
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: {{ $name }}
spec:
  acme:
    server: {{ $server }}
    email: {{ $.Values.acmeEmail }}
    privateKeySecretRef:
      name: {{ $name }}-account
    solvers:
      - selector:
          dnsZones: [{{ $.Values.zone | quote }}]
        dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token
              key: api-token
{{- end }}
```

```yaml
# gitops/platform/edge-config/templates/argocd-route.yaml
{{- if eq .Values.cluster.name "prod" }}
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: argocd
  namespace: argocd
spec:
  parentRefs:
    - name: edge
      namespace: gateway
      sectionName: https
  hostnames:
    - argocd.{{ .Values.domain }}
  rules:
    - backendRefs:
        - name: argocd-server
          port: 80
{{- if .Values.adminCidrs }}
---
apiVersion: gateway.envoyproxy.io/v1alpha1
kind: SecurityPolicy
metadata:
  name: argocd-admin-only
  namespace: argocd
spec:
  targetRefs:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      name: argocd
  authorization:
    defaultAction: Deny
    rules:
      - action: Allow
        principal:
          clientCIDRs: {{ toYaml .Values.adminCidrs | nindent 12 }}
{{- end }}
{{- end }}
```

```yaml
# gitops/platform/edge-config/templates/rollouts-gateway-rbac.yaml
# Plugin Gateway API của Argo Rollouts cần sửa weight trong HTTPRoute
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: argo-rollouts-gatewayapi
rules:
  - apiGroups: ["gateway.networking.k8s.io"]
    resources: ["httproutes"]
    verbs: ["get", "list", "watch", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: argo-rollouts-gatewayapi
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: argo-rollouts-gatewayapi
subjects:
  - kind: ServiceAccount
    name: argo-rollouts
    namespace: argo-rollouts
```

### 3.8 cloudnative-pg, plugin-barman-cloud, argo-rollouts

```yaml
# gitops/platform/cloudnative-pg/values-prod.yaml
nodeSelector: { qltt/pool: system }
tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
```

```yaml
# gitops/platform/plugin-barman-cloud/values-prod.yaml
nodeSelector: { qltt/pool: system }
tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
```

Nếu repo `cnpg` không có chart `plugin-barman-cloud` ở phiên bản bạn cần, đổi addon này sang kiểu
`local: true` với thư mục chứa `manifest.yaml` tải từ trang release của
`cloudnative-pg/plugin-barman-cloud` (manifest mặc định cài vào `cnpg-system`, cần cert-manager).

```yaml
# gitops/platform/argo-rollouts/values.yaml
dashboard:
  enabled: true
```

```yaml
# gitops/platform/argo-rollouts/values-prod.yaml
controller:
  nodeSelector: { qltt/pool: system }
  tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
  trafficRouterPlugins:
    - name: argoproj-labs/gatewayAPI
      location: https://github.com/argoproj-labs/rollouts-plugin-trafficrouter-gatewayapi/releases/download/<ROLLOUTS_GATEWAY_PLUGIN_VERSION>/gatewayapi-plugin-linux-amd64
dashboard:
  nodeSelector: { qltt/pool: system }
  tolerations: [{ key: qltt/pool, operator: Equal, value: system, effect: NoSchedule }]
```

```yaml
# gitops/platform/argo-rollouts/values-staging.yaml
controller:
  trafficRouterPlugins:
    - name: argoproj-labs/gatewayAPI
      location: https://github.com/argoproj-labs/rollouts-plugin-trafficrouter-gatewayapi/releases/download/<ROLLOUTS_GATEWAY_PLUGIN_VERSION>/gatewayapi-plugin-linux-arm64
```

> Plugin là binary tải lúc controller khởi động, **khác nhau theo kiến trúc**. Staging arm64 mà dùng
> bản amd64, controller sẽ crash với `exec format error`.

---

## 4. Chạy bootstrap

```bash
cd "$LAB_REPO"
# thay mọi <..._VERSION> và example.com trong gitops/ bằng giá trị thật
grep -rn '<[A-Z_]*VERSION>\|example.com' gitops/ || echo "sạch"

git add gitops infra/oci
git commit -m "feat(oci-lab): argo cd app-of-apps and platform addons"
git push -u origin feat/oci-gitops-platform
gh pr create --base oci-lab --title "OCI lab Day 3: GitOps platform" --body "Argo CD bootstrap + platform addons"
gh pr merge --squash --delete-branch      # sau khi CI xanh; Argo CD theo dõi oci-lab
git switch oci-lab && git pull

chmod +x infra/oci/scripts/bootstrap-argocd.sh
source ~/.qltt-lab.env
export ARGOCD_CHART_VERSION=<giá trị ở README §5>
infra/oci/scripts/bootstrap-argocd.sh
```

Theo dõi:

```bash
kp -n argocd port-forward svc/argocd-server 8080:80 &     # trong lúc chưa có DNS/cert
argocd login localhost:8080 --username admin --password '<mật khẩu in ra>' --plaintext
watch -n5 "argocd app list -o wide | awk '{print \$1, \$5, \$6, \$NF}'"
argocd cluster list          # staging phải ở trạng thái Successful
```

Thứ tự hợp lý bạn sẽ thấy: `argocd-prod` → `external-secrets-*` → `secrets-config-*` →
`envoy-gateway-*` → … Nếu một app đứng ở `Progressing` quá 10 phút, các wave sau sẽ không chạy: xem
mục Lỗi hay gặp.

---

## 5. Chứng chỉ: staging trước, prod sau

Let's Encrypt prod giới hạn số lần cấp lại cho cùng tên miền mỗi tuần. Kiểm tra toàn bộ luồng bằng
issuer staging trước.

```bash
kp -n gateway get certificate,certificaterequest,order,challenge
kp -n gateway describe certificate wildcard-lab-tls | tail -20
```

Khi `READY=True` với issuer staging, đổi `issuer: letsencrypt-prod` trong
`gitops/platform/gateway-config/values.yaml`, merge PR, rồi:

```bash
kp -n gateway get certificate wildcard-lab-tls -w         # READY False → True trong 1–3 phút
```

---

## 6. Kiểm tra DoD

```bash
source ~/.qltt-lab.env

# 6.1 NLB và DNS
kp -n envoy-gateway-system get svc -l gateway.envoyproxy.io/owning-gateway-name=edge
dig +short "argocd.${LAB_DOMAIN}"
kp -n external-dns logs deploy/external-dns --tail=20 | grep -i 'change\|create'

# 6.2 Chứng chỉ
echo | openssl s_client -connect "argocd.${LAB_DOMAIN}:443" -servername "argocd.${LAB_DOMAIN}" 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
curl -sS -o /dev/null -w '%{http_code}\n' "https://argocd.${LAB_DOMAIN}/"
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "http://argocd.${LAB_DOMAIN}/"   # 301 → https

# 6.3 Không có secret trong Git
git grep -nIE '(api[_-]?token|password|secret)\s*[:=]\s*["'\'']?[A-Za-z0-9/_+-]{16,}' -- gitops/ || echo "không thấy"

# 6.4 Self-heal
date +%T; kp -n external-dns delete deploy external-dns
kp -n external-dns get deploy external-dns -w      # ghi thời điểm READY 1/1
```

Kiểm tra IP client đi qua được tới Envoy (quan trọng cho rate limit Day 5):

```bash
kp -n gateway run echo --image=registry.k8s.io/e2e-test-images/agnhost:2.53 --port=8080 -- netexec --http-port=8080
kp -n gateway expose pod echo --port=8080
kp -n gateway apply -f - <<EOF
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata: { name: echo, namespace: gateway }
spec:
  parentRefs: [{ name: edge, sectionName: https }]
  hostnames: ["echo.${LAB_DOMAIN}"]
  rules: [{ backendRefs: [{ name: echo, port: 8080 }] }]
EOF
sleep 90; curl -s "https://echo.${LAB_DOMAIN}/header?key=X-Forwarded-For"; echo "  ← phải là $ADMIN_CIDR (bỏ /32)"
kp -n gateway delete httproute/echo svc/echo pod/echo
```

Nếu thấy IP `10.60.x.x` thay vì IP nhà bạn: NLB chưa giữ IP nguồn (sai annotation hoặc
`externalTrafficPolicy` chưa là `Local`). Sửa trước khi sang Day 4.

## 7. Lỗi hay gặp

| Triệu chứng | Nguyên nhân | Xử lý |
| --- | --- | --- |
| Các app sau wave đầu không bao giờ được tạo | Thiếu health customization cho `Application` | Kiểm tra `argocd-cm` có khoá `resource.customizations.health.argoproj.io_Application` |
| `envoy-gateway-*` báo `repository not found` | Thiếu repo secret `enableOCI` | `kp -n argocd get secret repo-envoyproxy-oci` |
| ClusterSecretStore prod `InvalidProviderConfig` / 401 | Policy chưa propagate, sai tên SA, thiếu env `OCI_RESOURCE_PRINCIPAL_*` | Đợi 2 phút; `kp -n external-secrets get sa`; xem log `deploy/external-secrets` |
| ClusterSecretStore staging 404/401 | Node staging thiếu defined tag, dynamic group chưa khớp | `oci compute instance get --instance-id <id> --query 'data."defined-tags"'` |
| Service Envoy `<pending>` mãi | Annotation NLB sai, NSG OCID sai, hết limit NLB | `kp -n envoy-gateway-system describe svc` xem event CCM |
| NLB có IP nhưng `curl` timeout | NSG `nlb` hoặc rule NodePort 30080/30443 trên `workers`/`pods` | Kiểm tra nodePort thực tế của Service khớp 30080/30443 |
| Challenge DNS-01 `pending` lâu | Token thiếu `Zone:Read`, hoặc sai `dnsZones` | `kp -n gateway describe challenge` |
| external-dns `no zone found` | `domainFilters` là subdomain thay vì zone apex, hoặc token thiếu quyền | Đặt zone apex |
| Argo CD không kết nối staging: `x509: certificate is valid for ..., not 10.60.0.x` | Cert API không có SAN IP private | Dùng `tlsClientConfig.serverName` bằng một SAN có trong cert (`kubernetes`) |
| Argo CD UI loop redirect | `server.insecure` chưa bật | Kiểm tra `argocd-cmd-params-cm` |
| App `argocd-prod` OutOfSync liên tục | Values bootstrap khác values trong Git | Luôn cài bằng cùng file `gitops/platform/argocd/values.yaml` |

## 8. Ghi journal

- Thời gian bootstrap đến khi mọi app `Healthy`.
- Thời gian self-heal ở 6.4.
- Mọi chỗ đã phải sửa so với hướng dẫn (tên annotation, khoá values) — đây là tư liệu tốt cho báo cáo.
