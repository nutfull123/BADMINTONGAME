# Game server image (Fly.io). Build: npm run build:server -> dist-server/index.js; run as a non-root user.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.server.json vite.server.config.ts ./
COPY server ./server
COPY src ./src
RUN npm run build:server

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
