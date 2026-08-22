FROM postgres:16-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends pgbackrest ca-certificates \
    && mkdir -p /etc/pgbackrest \
    && rm -rf /var/lib/apt/lists/*