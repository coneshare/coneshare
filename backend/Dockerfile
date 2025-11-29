#-------------------- core
FROM coneshare-core:latest AS core-serv

#-------------------- frontend dist
FROM coneshare-frontend:latest AS frontend

#-------------------- web app
FROM python:3.12-slim-bookworm

LABEL maintainer="dev@coneshare.com"
LABEL org.opencontainers.image.title="Coneshare"
LABEL org.opencontainers.image.description="Coneshare runtime image"
LABEL org.opencontainers.image.url="https://www.coneshare.com/"
LABEL org.opencontainers.image.vendor="Coneshare Ltd."
LABEL org.opencontainers.image.authors="dev@coneshare.com"

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libreoffice \
    supervisor \
    nginx \
    wget \
    curl \
    nano \
&& rm -rf /var/lib/apt/lists/*

# add our user and group first to make sure their IDs get assigned consistently
#RUN set -eux; \
#        groupadd -g 1002 coneshare; \
#        useradd -g coneshare -u 1001 coneshare
RUN groupadd coneshare && useradd -m -g coneshare coneshare

# grab gosu for easy step-down from root
ARG GOSU_VERSION=1.19
RUN dpkgArch="$(dpkg --print-architecture)" \
    && case "$dpkgArch" in \
        'amd64') GOSU_SHA256='52c8749d0142edd234e9d6bd5237dff2d81e71f43537e2f4f66f75dd4b243dd0'; ;; \
        'arm64') GOSU_SHA256='3a8ef022d82c0bc4a98bcb144e77da714c25fcfa64dccc57f6aba7ae47ff1a44'; ;; \
        *) echo >&2 "unsupported architecture: $dpkgArch"; exit 1; ;; \
    esac \
    && wget --quiet -O /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$dpkgArch" \
    && echo "$GOSU_SHA256 /usr/local/bin/gosu" | sha256sum --check --status \
    && chmod +x /usr/local/bin/gosu

ENV HOME_DIR="/home/coneshare"
ENV LOG_DIR="${HOME_DIR}/logs"
ENV BUILD_DIR="${HOME_DIR}/build"
ENV RUNTIME_DIR="${HOME_DIR}/runtime"
ENV APP_DIR="${HOME_DIR}/app"

# SET work dir
WORKDIR ${HOME_DIR}
RUN mkdir -p ${LOG_DIR}

# Download GeoIP database
RUN mkdir -p /geoip && \
    curl -L 'https://git.io/GeoLite2-City.mmdb' -o /geoip/GeoLite2-City.mmdb

# Install python requirements
COPY requirements.txt ${APP_DIR}/requirements.txt
RUN pip install --no-cache-dir -r ${APP_DIR}/requirements.txt

# Copy application code
COPY . ${APP_DIR}

# Set up application and its running environment
COPY docker.dist/build/ ${BUILD_DIR}/
COPY docker.dist/runtime/ ${RUNTIME_DIR}/

# Copy the binary to the production image from the builder stage.
COPY --from=core-serv /app/server ${APP_DIR}/core-serv
COPY --from=frontend /app/dist ${APP_DIR}/frontend/dist

RUN chown -R coneshare:coneshare ${HOME_DIR}
RUN chmod -R 755 ${HOME_DIR}
RUN chmod 755 ${BUILD_DIR}/entrypoint.py

WORKDIR ${APP_DIR}

RUN mkdir /data && chown coneshare:coneshare /data
VOLUME /data

EXPOSE 80/tcp

ENTRYPOINT ["/home/coneshare/build/entrypoint.py"]
CMD ["coneshare"]
