# Runbook monitoring production

## Trạng thái thiết kế

- Grafana: `https://monitor.zett.io.vn`, Caddy proxy tới `127.0.0.1:3000`.
- Prometheus: private `127.0.0.1:9090`.
- Alertmanager: private `127.0.0.1:9093`.
- Blackbox exporter: chỉ trong Docker network.
- Retention Prometheus: 7 ngày hoặc tối đa 1 GB.
- Alertmanager hiện dùng `null-receiver`; notification thật chưa production-ready.

## Lệnh Compose chuẩn

```bash
cd /opt/QLTrungTam
docker compose \
  -f /opt/QLTrungTam/deploy/monitoring/docker-compose.yml \
  ps
```

## Targets

```bash
curl --silent --get \
  --data-urlencode 'query=up' \
  http://127.0.0.1:9090/api/v1/query \
| jq -r '.data.result[] | [.metric.job, .metric.instance, .value[1]] | @tsv' \
| sort
```

Kỳ vọng năm job đều `1`: `prometheus`, `node`, `postgres`, `blackbox`, `app-probe`.
`up=1` chỉ chứng minh scrape; kiểm tra chức năng riêng:

```promql
pg_up{job="postgres"}
probe_success{job="app-probe"}
node_textfile_scrape_error{job="node"}
```

Kỳ vọng lần lượt `1`, `1`, `0`.

## Backup metrics

```bash
curl --silent --get \
  --data-urlencode 'query={job="node",__name__=~"qltrungtam_pgbackrest_backup_.*"}' \
  http://127.0.0.1:9090/api/v1/query \
| jq -r '.data.result[] | [.metric.__name__, (.metric.type // "-"), .value[1]] | @tsv' \
| sort
```

Kỳ vọng 10 series: năm metric nhân hai loại `full`/`diff`. Không ghép các metric có
label set giống nhau bằng PromQL `or` khi mục đích là kiểm kê; binary matching có thể
làm kết quả khó hiểu.

## Alert rules

```bash
curl --silent \
  'http://127.0.0.1:9090/api/v1/rules?type=alert' \
| jq '
    [.data.groups[].rules[]] as $rules
    | {
        total: ($rules | length),
        healthy: ($rules | map(select(.health == "ok")) | length),
        inactive: ($rules | map(select(.state == "inactive")) | length),
        unhealthy_rules: ($rules | map(select(.health != "ok")) | map({name, health, lastError})),
        active_rules: ($rules | map(select(.state != "inactive")) | map({name, state}))
      }
  '
```

Baseline hiện tại: 10 rules, tất cả `health=ok`; trạng thái bình thường là inactive.
`pending` nghĩa điều kiện đúng nhưng chưa đủ thời gian `for`; `firing` nghĩa đã đủ.

## Alertmanager discovery

```bash
curl --silent \
  http://127.0.0.1:9090/api/v1/alertmanagers \
| jq '{active: [.data.activeAlertmanagers[].url], dropped: [.data.droppedAlertmanagers[].url]}'
```

Phải có `http://alertmanager:9093/api/v2/alerts` trong `active`, `dropped` rỗng.

## Validate config trước deploy

```bash
docker compose \
  -f /opt/QLTrungTam/deploy/monitoring/docker-compose.yml \
  exec -T prometheus \
  promtool check config /etc/prometheus/prometheus.yml

docker compose \
  -f /opt/QLTrungTam/deploy/monitoring/docker-compose.yml \
  exec -T alertmanager \
  amtool check-config /etc/alertmanager/alertmanager.yml

docker compose \
  -f /opt/QLTrungTam/deploy/monitoring/docker-compose.yml \
  config --quiet
```

Các lệnh `exec` dùng đúng binary của container đang chạy và config read-only đang
mount, tránh lệch schema giữa tài liệu latest và phiên bản production.

## Grafana và Caddy

Dashboard `QLTrungTam SRE Overview` được quản lý tại
`monitoring/grafana/dashboards/sre-overview.json` và gồm:

- Target, PostgreSQL, application, firing alert và textfile health.
- Full/diff backup status, age và duration.
- CPU, memory, root filesystem và network throughput.
- HTTP status/probe duration.
- PostgreSQL connections/size và WAL archive health.

Grafana provider quét file mỗi 30 giây. Sau khi pull commit mới trên Monitoring VM,
dashboard sẽ tự cập nhật mà không cần sửa trực tiếp trong UI hoặc restart Grafana.
Nếu không cập nhật, kiểm tra Grafana logs và mount `/etc/grafana/dashboards`.

```bash
systemctl is-active caddy
sudo caddy validate \
  --config /etc/caddy/Caddyfile \
  --adapter caddyfile
curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/health \
| jq
```

Chỉ `80/443` public. Không mở `3000/9090/9093`. Dùng Viewer cho xem thường ngày;
admin chỉ dùng khi cấu hình.

Deploy thay đổi Grafana/Caddy theo thứ tự backend trước, proxy sau:

```bash
docker compose \
  -f /opt/QLTrungTam/deploy/monitoring/docker-compose.yml \
  up -d --no-deps grafana

curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/health \
| jq

sudo install -o root -g root -m 0644 \
  /opt/QLTrungTam/deploy/monitoring/caddy/Caddyfile \
  /etc/caddy/Caddyfile.new

sudo caddy validate \
  --config /etc/caddy/Caddyfile.new \
  --adapter caddyfile

sudo mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Backup `/etc/caddy/Caddyfile` trước lần thay đổi đầu tiên. `reload` giữ process hiện
tại và chỉ nhận config mới sau khi parse thành công; vẫn phải smoke test từ ngoài VM.

## Receiver và controlled test

Chưa coi alerting production-ready cho tới khi:

1. Receiver thật đọc secret ngoài Git.
2. `amtool check-config` thành công bằng đúng binary đang chạy.
3. Controlled alert đi qua Prometheus -> Alertmanager -> receiver.
4. Nhận cả notification `firing` và `resolved`.
5. Runbook ghi cách rotate/revoke credential receiver.

Không test bằng cách làm hỏng production database hoặc xóa backup metrics. Dùng rule
test riêng có thời hạn hoặc gửi alert API có nhãn rõ `severity=test`, rồi xóa sau test.
