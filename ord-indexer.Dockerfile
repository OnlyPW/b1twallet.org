FROM rust:1-bookworm AS builder

WORKDIR /src

RUN apt-get update && apt-get install -y --no-install-recommends \
    clang \
    pkg-config \
    libssl-dev \
    ca-certificates \
    git \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/local/cargo && \
    echo '[net]\ngit-fetch-with-cli = true' > /usr/local/cargo/config.toml

RUN git clone https://github.com/OnlyPW/Ord-Bit .

RUN sed -i 's|github.com/bittoshimoto/rust-bit|github.com/OnlyPW/rust-bit|g' Cargo.toml && \
    sed -i 's|github.com/bittoshimoto/rust-bit-rpc|github.com/OnlyPW/rust-bit-rpc|g' Cargo.toml && \
    sed -i 's|rev = "a594d144"||g' Cargo.toml

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/target/release/ord /usr/local/bin/ord
