FROM oven/bun:1-alpine AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

FROM base AS release
RUN apk add --no-cache python3 make g++ nodejs npm git
RUN npm i -g yarn node-gyp
COPY --from=install /temp/prod/node_modules node_modules
COPY package.json .
COPY src/ src/

USER bun
ENTRYPOINT ["bun", "start"]
