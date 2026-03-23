# Stage 1: deps — install dependencies from lockfile
FROM registry.access.redhat.com/ubi9/nodejs-20 AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps


# Stage 2: builder — build the Next.js standalone output
FROM registry.access.redhat.com/ubi9/nodejs-20 AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


# Stage 3: runtime — only the standalone output (~150-300MB final image)
FROM registry.access.redhat.com/ubi9/nodejs-20

WORKDIR /app

# Copy standalone server and its minimal node_modules
COPY --from=builder /app/.next/standalone ./
# Copy static assets (CSS, JS chunks) into the expected location
COPY --from=builder /app/.next/static ./.next/static
# Copy public assets (images, icons, robots.txt, etc.)
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
