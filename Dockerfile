FROM oven/bun:1

WORKDIR /app

# Install dependencies first so this layer is cached unless the lockfile changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "start"]
