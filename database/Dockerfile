# Database image for the 3-tier app.
# Based on the official PostgreSQL image, with the schema baked in.
#
# The base image automatically runs any *.sql / *.sh files found in
# /docker-entrypoint-initdb.d/ the FIRST time the data directory is empty,
# so copying init.sql there means the tables are created on first startup —
# no external mount or docker-compose needed.
FROM postgres:16-alpine

# Bake the schema into the image.
COPY init.sql /docker-entrypoint-initdb.d/init.sql

# Default connection settings. Override at `docker run` / in Kubernetes.
# POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD are read by the base image's
# entrypoint to create the database and role on first boot.
ENV POSTGRES_DB=appdb \
    POSTGRES_USER=appuser \
    POSTGRES_PASSWORD=apppassword

EXPOSE 5432

# ENTRYPOINT/CMD are inherited from the base postgres image.
