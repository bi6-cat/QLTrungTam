#!/usr/bin/env bash
set -Eeuo pipefail

backup_type="${1:-}"

case "$backup_type" in
  full|diff) ;;
  *)
    echo "Usage: $0 full|diff" >&2
    exit 64
    ;;
esac

repo_root="/opt/QLTrungTam"
state_dir="/var/lib/qltrungtam-pgbackrest"
metric_file="$state_dir/qltrungtam_pgbackrest.prom"
state_file="$state_dir/${backup_type}.state"
lock_file="/run/lock/qltrungtam-pgbackrest.lock"

write_state() {
  local last_run="$1"
  local last_success="$2"
  local success="$3"
  local duration="$4"
  local exit_code="$5"
  local temporary_file

  temporary_file="$(mktemp "$state_dir/.${backup_type}.state.XXXXXX")"

  printf '%s %s %s %s %s\n' \
    "$last_run" \
    "$last_success" \
    "$success" \
    "$duration" \
    "$exit_code" >"$temporary_file"

  chmod 0644 "$temporary_file"
  mv -f "$temporary_file" "$state_file"
}

render_metrics() {
  local temporary_file
  local kind
  local last_run
  local last_success
  local success
  local duration
  local exit_code

  temporary_file="$(mktemp "$state_dir/.pgbackrest.prom.XXXXXX")"

  {
    echo '# HELP qltrungtam_pgbackrest_backup_last_run_timestamp_seconds Unix timestamp of the most recent backup attempt.'
    echo '# TYPE qltrungtam_pgbackrest_backup_last_run_timestamp_seconds gauge'
    echo '# HELP qltrungtam_pgbackrest_backup_last_success_timestamp_seconds Unix timestamp of the most recent successful backup.'
    echo '# TYPE qltrungtam_pgbackrest_backup_last_success_timestamp_seconds gauge'
    echo '# HELP qltrungtam_pgbackrest_backup_last_run_success Whether the most recent backup attempt succeeded.'
    echo '# TYPE qltrungtam_pgbackrest_backup_last_run_success gauge'
    echo '# HELP qltrungtam_pgbackrest_backup_duration_seconds Duration of the most recent backup attempt.'
    echo '# TYPE qltrungtam_pgbackrest_backup_duration_seconds gauge'
    echo '# HELP qltrungtam_pgbackrest_backup_last_exit_code Exit code of the most recent backup attempt.'
    echo '# TYPE qltrungtam_pgbackrest_backup_last_exit_code gauge'

    for kind in full diff; do
      test -r "$state_dir/${kind}.state" || continue

      read -r last_run last_success success duration exit_code \
        <"$state_dir/${kind}.state"

      for value in \
        "$last_run" "$last_success" "$success" "$duration" "$exit_code"
      do
        [[ "$value" =~ ^[0-9]+$ ]] || {
          echo "Invalid state for backup type $kind" >&2
          return 1
        }
      done

      printf 'qltrungtam_pgbackrest_backup_last_run_timestamp_seconds{type="%s"} %s\n' "$kind" "$last_run"
      printf 'qltrungtam_pgbackrest_backup_last_success_timestamp_seconds{type="%s"} %s\n' "$kind" "$last_success"
      printf 'qltrungtam_pgbackrest_backup_last_run_success{type="%s"} %s\n' "$kind" "$success"
      printf 'qltrungtam_pgbackrest_backup_duration_seconds{type="%s"} %s\n' "$kind" "$duration"
      printf 'qltrungtam_pgbackrest_backup_last_exit_code{type="%s"} %s\n' "$kind" "$exit_code"
    done
  } >"$temporary_file"

  chmod 0644 "$temporary_file"
  mv -f "$temporary_file" "$metric_file"
}

start_timestamp="$(date +%s)"
previous_success=0

if test -r "$state_file"; then
  read -r _ previous_success _ _ _ <"$state_file" || true
  [[ "$previous_success" =~ ^[0-9]+$ ]] || previous_success=0
fi

exec 9>"$lock_file"

if ! /usr/bin/flock --nonblock 9; then
  end_timestamp="$(date +%s)"
  write_state "$end_timestamp" "$previous_success" 0 0 75
  render_metrics
  echo "Another pgBackRest backup is already running" >&2
  exit 75
fi

if /usr/bin/docker compose \
  --env-file "$repo_root/.env" \
  -f "$repo_root/deploy/app/docker-compose.yml" \
  exec -T --user postgres db \
  pgbackrest --stanza=qltrungtam --type="$backup_type" backup
then
  exit_code=0
  success=1
else
  exit_code=$?
  success=0
fi

end_timestamp="$(date +%s)"
duration=$((end_timestamp - start_timestamp))

if (( success == 1 )); then
  previous_success="$end_timestamp"
fi

write_state \
  "$end_timestamp" \
  "$previous_success" \
  "$success" \
  "$duration" \
  "$exit_code"

render_metrics
exit "$exit_code"