# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim@sha256:d45d78e7929b46875bbd4e29bea672d5bc48186c6c3588306521c815e78352d6

ENV NODE_ENV=development
WORKDIR /opt/aico-template

ADD template-v1.tar.gz ./template/
RUN cp ./template/package.json ./package.json \
  && cp ./template/package-lock.json ./package-lock.json \
  && npm install --global npm@11.6.2 --ignore-scripts --no-audit --no-fund \
  && test "$(npm --version)" = "11.6.2" \
  && npm ci --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force \
  && rm -rf /root/.npm /tmp/node-compile-cache /tmp/*

RUN chown -R root:root /opt/aico-template \
  && chmod -R a-w /opt/aico-template

USER node
WORKDIR /workspace
ENTRYPOINT ["/usr/bin/env"]
CMD ["node", "--version"]
