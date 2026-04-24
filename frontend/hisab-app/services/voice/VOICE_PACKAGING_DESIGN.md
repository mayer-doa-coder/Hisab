# Phase 7: Size Optimization and Voice Pack Packaging

## Packaging Architecture

- Base app includes:
  - UI and navigation
  - voice FSM and normalization
  - secure command execution layer
  - no bundled ASR model files

- Voice pack layer includes downloadable artifacts:
  - quantized ONNX model bundle
  - tokenizer assets
  - grammar config snapshots

This keeps base binary lightweight while allowing offline voice after pack install.

## Voice Pack Types

- Default Bengali Command Pack (`bn_command_int8`)
  - target size: 30-80MB
  - optimized for short command utterances

- Optional HQ Bengali Pack (`bn_hq_bnb4`)
  - target size: 100-200MB
  - higher quality model for noisy inputs

## Install Flow

1. User taps voice mic.
2. App checks local pack status.
3. If missing, prompt:
   - Download
   - Cancel
4. Download starts with progress UI.
5. On completion, SHA256 validation runs.
6. Version manifest updates.
7. Offline voice is enabled.

## Download and Resume

- Uses resumable download manager in `services/voice/voicePack/downloader.js`.
- Resume state stored locally in `resume.json`.
- Supports pause, resume, cancel, retry.
- Uses background session mode when available.

## Integrity Validation

- Post-download SHA256 validation in `checksumValidator.js`.
- Corrupted files are deleted and install fails safely.

## Versioning

- Local manifest file: `voice-packs/version.json`.
- Tracks:
  - pack_version
  - model
  - checksum
  - local file uri
  - installed_at
- Remote update check supported via remote manifest endpoint.

## Storage Management

- Pack files stored in app document directory under `voice-packs/<packId>/`.
- Remove flow deletes pack file and local manifest entry.
- Prevents duplicate model copies by one-path-per-pack layout.

## Offline Availability

- After successful install and checksum pass, voice execution does not require network.
- Pack existence check is enforced before mic capture.

## Update Strategy

- Voice Pack screen exposes `Check Update` action.
- If remote pack version is newer than local, user can reinstall to upgrade.

## Reliability Notes

- Safe defaults block voice usage until verified pack install.
- Retry path included in download screen for low-bandwidth/interrupted networks.
