# Node LTS on a small Alpine base.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev

# Copy the application source.
COPY . .

# Run as the built-in non-root "node" user for safety.
USER node

EXPOSE 3000

CMD ["node", "server.js"]
