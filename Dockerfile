FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js store.js presets.js ./
COPY public ./public

# In production the JSON store lives on a mounted volume (see fly.toml)
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
