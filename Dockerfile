FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json ./
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --omit=dev --no-audit --no-fund
COPY . .

ENV NODE_ENV=production
ENV GRENA_CLOUD=1
ENV GRENA_CHROMIUM_PATH=/usr/bin/chromium
ENV HOST=0.0.0.0
ENV GRENA_DATA_DIR=/data

EXPOSE 3000
CMD ["node", "server.mjs"]
