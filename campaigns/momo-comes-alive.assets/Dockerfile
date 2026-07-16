# REFERENCE IMPLEMENTATION · momo-comes-alive · Step 1.1. Not the target file — do not edit; copy to repo root and adapt.
# Shows: the private-artwork boundary — locally-built frames ride the (private) Fly image,
#   never the public GitHub repo.
# Non-obvious:
#   · `npm run build` runs LOCALLY before `fly deploy` — it needs ffmpeg and the private
#     clip library at ~/Dev/Projects/momó/pet, neither of which exists in CI or on Fly.
#     assets/frames (~190MB) is gitignored but IS in the Docker build context on purpose.
#   · A .dockerignore is required next to this file, and it must NOT exclude assets/:
#       node_modules
#       data
#       campaigns
#       docs
#       test
#       .git
#   · COPY package*.json before source so `npm ci` caches across code-only deploys.
# Yours to decide: nothing structural; pin the node minor if you want reproducible builds.

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ server/
COPY assets/ assets/

EXPOSE 8787
CMD ["node", "server/index.js"]
