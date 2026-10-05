FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages/agent-client/package.json packages/agent-client/tsconfig.json ./packages/agent-client/
RUN npm ci --ignore-scripts
COPY src ./src
COPY packages/agent-client/src ./packages/agent-client/src
COPY tests ./tests
COPY fixtures ./fixtures
RUN npm run build

FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4311 SQLITE_PATH=/data/mango.sqlite
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/agent-client/package.json ./packages/agent-client/package.json
RUN npm ci --omit=dev --ignore-scripts && mkdir /data && chown node:node /data
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/agent-client/dist ./packages/agent-client/dist
COPY fixtures ./fixtures
USER node
EXPOSE 4311
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:4311/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/main.js"]
