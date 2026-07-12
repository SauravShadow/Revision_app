# syntax=docker/dockerfile:1

# ---- Builder: install all deps and produce the production build ----
FROM node:20-slim AS builder
WORKDIR /app

# Install deps against the committed lockfile (glibc base matches the pinned
# @tailwindcss/oxide-linux-x64-gnu native binary used by the Tailwind v4 build).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runner: minimal production runtime (`next start`) ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Runtime deps only (dependencies block: next/react/zustand/etc.)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Built output + assets + config needed by `next start`
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000
CMD ["npm", "start"]
