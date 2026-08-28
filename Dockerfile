# Counterpart — production image for the VPS.
#
# Two stages: the builder carries the toolchain that better-sqlite3 and sharp need to
# compile against Node 22, the runner carries only the traced standalone output. The
# runtime image has no compiler, which keeps it small and reduces what an exploit could
# reach.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 is a native addon; without these it falls back to a prebuild that may
# not match this Node ABI, and the failure only shows at runtime as a load error.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The build imports src/lib/db.ts, which opens data/counterpart.db on load. Without a
# data dir present the build fails before it reaches any page.
RUN mkdir -p data && npm run build


FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Runs as the image's built-in non-root user; the data volume is chowned to match.
RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
