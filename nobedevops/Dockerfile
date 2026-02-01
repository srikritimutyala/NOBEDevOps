# syntax=docker/dockerfile:1.6

############################################
# Golden Image: Next.js (TypeScript)
# - Multi-stage build for small runtime image
# - Reproducible installs
# - Non-root runtime
# - Works with Next.js standalone output
############################################

ARG NODE_VERSION=20.11.1

############################
# 1) deps: install deps
############################
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app

# OS deps often needed for native modules
RUN apk add --no-cache libc6-compat

# Copy only package files for better caching
COPY package.json package-lock.json* ./

# Reproducible install (npm)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

############################
# 2) build: compile next app
############################
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

ENV NODE_ENV=production

# Bring node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Recommended: Next standalone output
# Ensure next.config.js has: output: "standalone"
RUN npm run build

############################
# 3) runner: minimal runtime
############################
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create a non-root user
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

# If using Next "standalone" output:
# - .next/standalone contains server + minimal node_modules
# - .next/static contains static assets
# - public contains public assets
COPY --from=build /app/public ./public
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/.next/standalone ./

USER nextjs

EXPOSE 3000

# Next standalone server entrypoint:
CMD ["node", "server.js"]
