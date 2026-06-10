# ---- Stage 1: Build ----
FROM rust:1.78-slim AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifest and lock file
COPY Cargo.toml Cargo.lock ./

# Copy crate manifests so Cargo can resolve the workspace
COPY crates/novanote-core/Cargo.toml crates/novanote-core/
COPY crates/novanote-sync-server/Cargo.toml crates/novanote-sync-server/

# Create dummy source files to cache dependency builds
RUN mkdir -p crates/novanote-core/src && echo "pub fn dummy() {}" > crates/novanote-core/src/lib.rs
RUN mkdir -p crates/novanote-sync-server/src && echo "fn main() {}" > crates/novanote-sync-server/src/main.rs

# Build dependencies only (this layer is cached when sources change)
RUN cargo build --release -p novanote-sync-server && rm -rf crates/novanote-core/src crates/novanote-sync-server/src

# Copy actual source code
COPY crates/novanote-core/src crates/novanote-core/src
COPY crates/novanote-sync-server/src crates/novanote-sync-server/src

# Touch the source files so Cargo sees them as newer than the cached build
RUN find crates -name "*.rs" -exec touch {} +

# Build the final binary with cached dependencies
RUN cargo build --release -p novanote-sync-server

# ---- Stage 2: Runtime ----
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/novanote-sync-server /app/novanote-sync-server

# Default environment variables (can be overridden at runtime)
ENV DATABASE_URL=postgresql://novanote:novanote_secret@postgres:5432/novanote_sync
ENV REDIS_URL=redis://redis:6379
ENV BIND_ADDR=0.0.0.0:3000
ENV JWT_SECRET=change-me-in-production
ENV RUST_LOG=info

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["/app/novanote-sync-server"]
