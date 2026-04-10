# BUILD Workspace

## Purpose
`BUILD/` contains Docker and runtime assembly inputs for the unified `webapp` product.

## Runtime entrypoint
- External port: `7014`
- Gateway: `BUILD/gateway/nginx.conf`
- Compose file: `BUILD/compose/docker-compose.yml`

## Release build flow
1. Build frontend image from `webapp/frontend` using `BUILD/docker/frontend.Dockerfile`
2. Build backend image from `webapp/backend` using `BUILD/docker/backend.Dockerfile`
3. Build gateway image from `BUILD/docker/gateway.Dockerfile`
4. Start compose stack via `BUILD/compose/docker-compose.yml`
5. Serve unified product through `7014`

## Development bind-mount flow
This repo currently validates production-style containers by default. For day-to-day development, use bind mounts conceptually as follows:
- mount `webapp/frontend` into a node-based frontend dev container
- mount `webapp/backend` into a node-based backend dev container
- keep `gateway` on `7014` and proxy to frontend/backend dev ports
- preserve `BUILD/` as runtime assembly source of truth, while `webapp/` remains product source of truth

## Legacy module status
- `A1_Chinese_word_lookup/`: migrated into `webapp/frontend/src/features/a1/` with backend lookup boundary
- `A2_Chinese_idiom_practice/`: migrated into `webapp/frontend/src/features/a2/` with backend quiz boundary
- `A3_Math_4ops_learn/`: migrated into `webapp/frontend/src/features/a3/`
- Legacy folders remain in repo temporarily as historical references and migration checkpoints.
