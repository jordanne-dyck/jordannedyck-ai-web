# Stage 1: deps — install dependencies from lockfile
FROM registry.access.redhat.com/ubi9/nodejs-20 AS deps

WORKDIR /opt/app-root/src
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps


# Stage 2: builder — build the Next.js standalone output
FROM registry.access.redhat.com/ubi9/nodejs-20 AS builder

WORKDIR /opt/app-root/src
COPY --from=deps /opt/app-root/src/node_modules ./node_modules
COPY . .
# Dummy key lets Next.js evaluate the route module at build time without making API calls
RUN OPENAI_API_KEY=build-placeholder npm run build


# Stage 3: runtime — only the standalone output (~150-300MB final image)
FROM registry.access.redhat.com/ubi9/nodejs-20

WORKDIR /opt/app-root/src

# Copy standalone server and its minimal node_modules
COPY --from=builder /opt/app-root/src/.next/standalone ./
# Copy static assets (CSS, JS chunks) into the expected location
COPY --from=builder /opt/app-root/src/.next/static ./.next/static
# Copy public assets (images, icons, robots.txt, etc.)
COPY --from=builder /opt/app-root/src/public ./public

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
