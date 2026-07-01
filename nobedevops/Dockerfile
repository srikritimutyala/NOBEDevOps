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
WORKDIR /app/nobedevops

# OS deps often needed for native modules
RUN apk add --no-cache libc6-compat

# Copy only package files for better caching
COPY nobedevops/package.json nobedevops/package-lock.json* ./

# Reproducible install (npm)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

############################
# 2) build: compile next app
############################
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app/nobedevops

ENV NODE_ENV=production

# Bring node_modules from deps stage
COPY --from=deps /app/nobedevops/node_modules ./node_modules
COPY . /app

# Recommended: Next standalone output
# Ensure next.config.js has: output: "standalone"
RUN npm run build

############################
# 3) runner: minimal runtime
############################
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app/nobedevops

ENV NODE_ENV=production
ENV PORT=3000

# Install git, bash, curl, libc6-compat (for glibc binaries), and ca-certificates
RUN apk add --no-cache git bash curl libc6-compat ca-certificates

# Create a non-root user and set up a writable home directory
RUN addgroup -S nextjs && adduser -S -h /home/nextjs nextjs -G nextjs && \
    mkdir -p /home/nextjs && chown -R nextjs:nextjs /home/nextjs

ENV HOME=/home/nextjs
ENV PATH="/home/nextjs/.local/bin:${PATH}"

# Set up git to trust the /app directory (fixes "dubious ownership" errors)
RUN git config --system --add safe.directory /app

# If using Next "standalone" output:
COPY --from=build /app/nobedevops/public ./public
COPY --from=build /app/nobedevops/.next/static ./.next/static
COPY --from=build /app/nobedevops/.next/standalone ./

# Ensure the nextjs user owns the files
RUN chown -R nextjs:nextjs /app

USER nextjs

EXPOSE 3000

# Next standalone server entrypoint:
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"development\" ]; then npm install && npm run dev; else node server.js; fi"]
