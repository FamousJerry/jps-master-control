FROM node:20-alpine AS build
WORKDIR /app

# Install web deps and build
COPY web/package*.json web/
RUN npm --prefix web ci
COPY web web
RUN npm --prefix web run build

# Runtime image
FROM node:20-alpine AS runtime
WORKDIR /app

# Server deps
COPY package*.json ./
RUN npm ci --omit=dev

# App server and built frontend
COPY server.js ./
COPY --from=build /app/web/dist ./web/dist

# Non-root
RUN addgroup -S jps && adduser -S jps -G jps
USER jps

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
