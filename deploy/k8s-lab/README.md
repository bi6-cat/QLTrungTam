# QLTrungTam Kubernetes HA lab

Lab dùng 5 VM Kubernetes (3 control plane, 2 worker) và 1 VM monitoring độc lập.

- Runbook và sơ đồ: [`docs/labs/K8S-HA-LAB.md`](../../docs/labs/K8S-HA-LAB.md)
- Kubernetes manifests: [`manifests/`](manifests/)
- HA API/MetalLB templates: [`platform/`](platform/)
- External monitoring stack: [`monitoring/`](monitoring/)

Các file `.app.env`, `.db.env`, image tar và secret thật không được commit.
