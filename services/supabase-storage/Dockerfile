# Dockerfile for offline-capable Supabase Storage
# Extends official supabase/storage-api with postgresql-client pre-installed
FROM supabase/storage-api:v1.14.5

# postgresql-client at build time for offline capability; nginx terminates the
# internal-CA TLS in front of storage-api (which has no native TLS support);
# curl serves the healthcheck; ca-certificates provides update-ca-certificates.
RUN apk add --no-cache postgresql-client nginx curl ca-certificates \
    && rm -f /etc/nginx/http.d/default.conf

COPY nginx.conf /etc/nginx/http.d/supabase-storage.conf
COPY entrypoint.sh /usr/src/entrypoint.sh
RUN chmod +x /usr/src/entrypoint.sh

ENTRYPOINT ["/usr/src/entrypoint.sh"]
