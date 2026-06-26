FROM rust:latest AS builder
WORKDIR /app

# Copy workspace files
COPY Cargo.toml Cargo.lock ./
COPY crates/mwt-crypto ./crates/mwt-crypto
COPY crates/mwt-relay  ./crates/mwt-relay
COPY crates/mwt-admin  ./crates/mwt-admin

# Stub out the Tauri crate so the workspace resolves without its native deps
RUN mkdir -p client/src-tauri/src && \
    echo 'fn main() {}' > client/src-tauri/src/main.rs && \
    printf '[package]\nname = "mwt-client"\nversion = "0.1.0"\nedition = "2021"\n\n[[bin]]\nname = "mwt-client"\npath = "src/main.rs"\n' > client/src-tauri/Cargo.toml

RUN cargo build --release -p mwt-relay

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/mwt-relay /usr/local/bin/mwt-relay
ENTRYPOINT ["/usr/local/bin/mwt-relay"]
