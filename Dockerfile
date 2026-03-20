FROM --platform=$BUILDPLATFORM rust:1.64 AS buildbase
WORKDIR /src
RUN <<EOT bash
    set -ex
    apt-get update
    apt-get install -y \
        ca-certificates \
        curl \
        patch \
        zip
    update-ca-certificates
EOT
RUN curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash

FROM buildbase AS build
ARG ENABLE_AOT=0
COPY server.js .
COPY wasmedge-quickjs.lock .
COPY scripts/container-entrypoint.sh ./scripts/container-entrypoint.sh
COPY scripts/sync-wasmedge-quickjs.sh ./scripts/sync-wasmedge-quickjs.sh
COPY patches/wasmedge-quickjs-http.patch ./patches/wasmedge-quickjs-http.patch
RUN ./scripts/sync-wasmedge-quickjs.sh
RUN if [ "${ENABLE_AOT}" = "1" ]; then /root/.wasmedge/bin/wasmedgec wasmedge_quickjs.wasm wasmedge_quickjs.wasm; fi

FROM debian:bullseye-slim
RUN <<EOT bash
    set -ex
    apt-get update
    apt-get install -y --no-install-recommends \
        ca-certificates \
        libstdc++6 \
        netbase \
        zlib1g
    rm -rf /var/lib/apt/lists/*
    mkdir -p /app /data /modules
EOT
WORKDIR /
ENV PATH=/root/.wasmedge/bin:${PATH}
ENV LD_LIBRARY_PATH=/root/.wasmedge/lib
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
EXPOSE 8080
ENTRYPOINT [ "/app/container-entrypoint.sh" ]
COPY --link --from=buildbase /root/.wasmedge /root/.wasmedge
COPY --link --from=buildbase /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --link --from=build /src/wasmedge_quickjs.wasm /app/wasmedge_quickjs.wasm
COPY --link --from=build /src/server.js /app/server.js
COPY --link --from=build /src/modules /app/modules
COPY --link --from=build /src/scripts/container-entrypoint.sh /app/container-entrypoint.sh
