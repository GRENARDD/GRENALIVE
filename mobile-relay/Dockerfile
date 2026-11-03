FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .
ENV NODE_ENV=production PORT=8080
RUN addgroup -S grena && adduser -S grena -G grena
USER grena
EXPOSE 8080
CMD ["node", "server.mjs"]
