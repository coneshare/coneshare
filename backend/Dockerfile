#-------------------- core
FROM coneshare-core:latest AS core-serv

#-------------------- frontend dist
FROM coneshare-frontend:latest AS frontend

#-------------------- backend
FROM ubuntu:22.04 AS backend

ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1


RUN apt-get update && apt-get install -y \
    python3 \
&& rm -rf /var/lib/apt/lists/*

ENV HOME_DIR="/home/coneshare"
ENV LOG_DIR="${HOME_DIR}/logs"
ENV BUILD_DIR="${HOME_DIR}/build"
ENV RUNTIME_DIR="${HOME_DIR}/runtime"
ENV INSTALL_DIR="${HOME_DIR}/app"

COPY . ${INSTALL_DIR}
COPY docker.dist/utility/ ${BUILD_DIR}/

#-------------------- web app
FROM ubuntu:22.04

LABEL maintainer="dev@coneshare.com"
LABEL org.opencontainers.image.title="Coneshare"
LABEL org.opencontainers.image.description="Coneshare runtime image"
LABEL org.opencontainers.image.url="https://www.coneshare.com/"
LABEL org.opencontainers.image.vendor="Coneshare Ltd."
LABEL org.opencontainers.image.authors="dev@coneshare.com"

ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1

RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    htop \
    supervisor \
    nginx \
    poppler-utils \
    git \
    procps \
    python3 \
    python3-pip \
    wget \
    nano \
&& rm -rf /var/lib/apt/lists/*

# add our user and group first to make sure their IDs get assigned consistently
#RUN set -eux; \
#        groupadd -g 1002 coneshare; \
#        useradd -g coneshare -u 1001 coneshare
RUN groupadd coneshare && useradd -m -g coneshare coneshare

# grab gosu for easy step-down from root
ARG GOSU_VERSION=1.19
ARG GOSU_SHA256=bbc4136d03ab138b1ad66fa4fc051bafc6cc7ffae632b069a53657279a450de3

RUN wget --quiet -O /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-amd64" \
  && echo "$GOSU_SHA256 /usr/local/bin/gosu" | sha256sum --check --status \
  && chmod +x /usr/local/bin/gosu

ENV HOME_DIR="/home/coneshare"
ENV LOG_DIR="${HOME_DIR}/logs"
ENV BUILD_DIR="${HOME_DIR}/build"
ENV RUNTIME_DIR="${HOME_DIR}/runtime"
ENV INSTALL_DIR="${HOME_DIR}/app"

# SET work dir
WORKDIR ${HOME_DIR}
RUN mkdir -p ${LOG_DIR}

# Install python requirements
#COPY docker.dist/pip.conf /etc/pip.conf
COPY requirements.txt ${INSTALL_DIR}/requirements.txt
RUN cd ${INSTALL_DIR} && pip3 install -r requirements.txt && cd -

# Set up application and its running environment
COPY docker.dist/utility/ ${BUILD_DIR}/
COPY docker.dist/runtime/ ${RUNTIME_DIR}/

# Update nginx/uswgi/..etc confs
RUN cd /etc/nginx/sites-enabled/ && rm default && ln -s ${RUNTIME_DIR}/coneshare.nginx.conf default && cd -
RUN chmod 755 ${BUILD_DIR}/django-install.sh \
    && chmod 755 ${BUILD_DIR}/entrypoint.py \
    && bash ${BUILD_DIR}/django-install.sh

# Copy the binary to the production image from the builder stage.
COPY --from=core-serv /app/server ${INSTALL_DIR}/core/server
COPY --from=frontend /app/dist ${INSTALL_DIR}/frontend/dist

RUN chown -R coneshare:coneshare ${HOME_DIR}
RUN chmod -R 755 ${HOME_DIR}

WORKDIR ${INSTALL_DIR}

RUN mkdir /data && chown coneshare:coneshare /data
VOLUME /data

EXPOSE 22/tcp 8000/tcp

ENTRYPOINT exec ${BUILD_DIR}/entrypoint.py "$0" "$@"
CMD ["coneshare"]
