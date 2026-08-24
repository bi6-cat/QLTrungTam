# Runbook backup và khôi phục PostgreSQL

## Thiết kế hiện tại

- PostgreSQL 16 custom image có pgBackRest.
- pgBackRest stanza: `qltrungtam`.
- Repository: S3, xác thực bằng EC2 IAM Role/IMDSv2.
- Full backup: Chủ nhật 02:00 Asia/Ho_Chi_Minh.
- Differential backup: thứ Hai đến thứ Bảy 02:00.
- Timers dùng `Persistent=true` và randomized delay tối đa 10 phút.
- Retention: 2 full và 7 differential theo `pgbackrest.conf`.
- Logical dump cũ trong `backups/` chỉ là artefact phụ, không phải lịch backup chính.

Mọi lệnh pgBackRest trong container chạy bằng OS user `postgres`. DB role ứng dụng
là `zett`; không dùng DB role thay cho OS user.

## Kiểm tra timer

```bash
systemctl list-timers \
  'qltrungtam-pgbackrest-*' \
  --all

systemctl status \
  qltrungtam-pgbackrest-full.timer \
  qltrungtam-pgbackrest-diff.timer \
  --no-pager
```

`NEXT` cho biết lần dự kiến; `LAST` không tự chứng minh backup thành công, phải xem
service exit status và pgBackRest repository.

## Kiểm tra backup gần nhất

```bash
cd /opt/QLTrungTam

docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  exec -T --user postgres db \
  pgbackrest --stanza=qltrungtam info

docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  exec -T --user postgres db \
  pgbackrest --stanza=qltrungtam check
```

`info` kiểm kê backup/WAL trong repository. `check` kiểm tra stanza, archive và kết
nối cần thiết; không thay thế restore drill.

## Chạy backup có kiểm soát

Ưu tiên gọi systemd unit để dùng đúng lock, state và metrics:

```bash
sudo systemctl start qltrungtam-pgbackrest@diff.service
sudo systemctl status \
  qltrungtam-pgbackrest@diff.service \
  --no-pager
sudo journalctl \
  -u qltrungtam-pgbackrest@diff.service \
  -n 100 \
  --no-pager
```

Không chạy full tùy tiện trong giờ cao điểm; full tốn I/O, network và thời gian hơn.

## Metrics backup

State/metrics host nằm tại `/var/lib/qltrungtam-pgbackrest`. Không sửa file `.prom`
thủ công để làm alert xanh.

Các metric bắt buộc cho cả `type="full"` và `type="diff"`:

```text
qltrungtam_pgbackrest_backup_duration_seconds
qltrungtam_pgbackrest_backup_last_exit_code
qltrungtam_pgbackrest_backup_last_run_success
qltrungtam_pgbackrest_backup_last_run_timestamp_seconds
qltrungtam_pgbackrest_backup_last_success_timestamp_seconds
```

`node_textfile_scrape_error` phải bằng `0`.

## Điều tra backup lỗi

```bash
sudo systemctl status \
  qltrungtam-pgbackrest@diff.service \
  --no-pager
sudo journalctl \
  -u qltrungtam-pgbackrest@diff.service \
  --since '-24 hours' \
  --no-pager
sudo ls -l /var/lib/qltrungtam-pgbackrest
```

Sau đó kiểm tra Docker/DB, IAM Role, IMDSv2, DNS/S3 endpoint và WAL archive. Giá trị
`pg_stat_archiver_failed_count` tích lũy có thể chứa lỗi lịch sử; alert dùng
`increase(...[15m])` để chỉ báo lỗi mới.

## Restore drill

Restore phải diễn ra trong container/volume cô lập:

- Không publish DB port.
- `listen_addresses` rỗng.
- `archive_mode=off` trong drill.
- Không mount production volume vào container thử nghiệm.
- Kiểm tra WAL replay, promote, `pg_is_in_recovery()`, migrations, row-count sanity
  và `pg_dump` toàn database.
- Xóa container/volume drill sau khi ghi bằng chứng; kiểm tra production DB vẫn healthy.

Không chạy restore pgBackRest trực tiếp vào production PGDATA khi chưa có kế hoạch
DR được review. Runbook chi tiết phải được cập nhật từ lần restore drill gần nhất,
bao gồm backup set, timeline và RPO/RTO đo được.

## Restore logical dump khẩn cấp

Chỉ dùng custom dump khi đã xác nhận scope mất dữ liệu:

```bash
cd /opt/QLTrungTam
CONFIRM_DB_RESTORE=YES \
  bash .deploy/restore-db-ec2.sh backups/<file>.dump
```

Script tạo rescue dump trước, dừng App, restore và health check. Không thực hiện nếu
không có maintenance window và người chịu trách nhiệm xác nhận.
