# Per-architecture base pin. buildx only pulls the stage matching the platform
# being built, so the amd64 leg stays byte-for-byte on the existing, known-good
# digest while arm64 pulls a base that actually ships an arm64 manifest.
#
# ghcr.io/data2evidence/logto-with-logto-schema:develop is published amd64-only
# (its index carries a single linux/amd64 manifest), so building this image for
# linux/arm64 off that digest fails outright with "no match for platform". The
# arm64 pin below is that repo's multi-arch `add-arm64-images` index
# (linux/amd64 + linux/arm64) — an older build of the same image, which is the
# only arm64-capable base published so far. Re-point both lines at one digest
# once the base image publishes amd64 and arm64 together.
FROM --platform=linux/amd64 ghcr.io/data2evidence/logto-with-logto-schema@sha256:b15f139b08744afa7e68bbaa11cd5d33644fcb18cb50cc55ec7175e7c41cbdff AS base-amd64

FROM --platform=linux/arm64 ghcr.io/data2evidence/logto-with-logto-schema@sha256:e1a726ba62aec804d33e20da06ac60baf2ef9a7ca95f7219a71614b1879c3892 AS base-arm64

# TARGETARCH (amd64 | arm64) is set by buildx per leg; only the selected stage
# is pulled and built.
FROM base-${TARGETARCH}
