# ═══════════════════════════════════════════════════════════════
#                    OCTO PROTOCOL — SEAL OF ORIGIN
# ═══════════════════════════════════════════════════════════════
#
#  This document certifies the creation timeline and progress
#  of the OCTO Protocol project. Each entry is timestamped at
#  the moment of commit.
#
# ═══════════════════════════════════════════════════════════════

## GENESIS SEAL

- **Date**: September 1, 2026
- **Time**: 14:00 IST (08:30 UTC)
- **Author**: Hello-Mirage (mirajrahaman2006@gmail.com)
- **Commit**: Initial commit — MVP foundation

---

## MILESTONE LOG

### [2026-09-01] — GENESIS: MVP Foundation

**Status**: ✅ COMPLETE — Core pipeline verified and working

**What was built**:

1. **Identity System** (`src/identity.js`)
   - BIP-39 24-word mnemonic generation (256-bit entropy)
   - Deterministic ed25519 keypair derivation from mnemonic
   - Tor v3 .onion address computation (SHA3-256 checksum + base32)
   - Tor hidden service key file generation (`hs_ed25519_secret_key`, `hs_ed25519_public_key`, `hostname`)
   - Full pipeline verified: same 24 words → same .onion address, every time

2. **Tor Manager** (`src/tor-manager.js`)
   - Programmatic Tor process lifecycle management
   - Auto-detection of Tor binary on the system
   - Dynamic `torrc` configuration generation
   - Bootstrap progress monitoring with event emitter
   - Graceful shutdown handling

3. **Main Application** (`src/main.js`)
   - Local dashboard server on `http://localhost:3000`
   - Hidden service server on `127.0.0.1:3001` (exposed as .onion via Tor)
   - REST API for identity generation, restoration, and scanner control
   - WebSocket-based real-time chat (ephemeral, in-memory only)
   - Dual WebSocket system: dashboard ↔ backend ↔ .onion peers

4. **Dashboard UI** (`public/index.html`, `public/js/dashboard.js`)
   - Identity generation and restoration interface
   - 24-word mnemonic display grid
   - .onion address display with click-to-copy
   - Scanner start/stop controls with Tor bootstrap progress
   - Real-time log viewer
   - Local chat console

5. **Onion Site** (`public/onion-site/index.html`)
   - Minimal chat UI served on the .onion address
   - WebSocket-based real-time messaging
   - Connection status indicator

6. **Design System** (`public/css/styles.css`)
   - Dark glassmorphism theme
   - Purple/cyan gradient accent palette
   - JetBrains Mono for cryptographic elements
   - Smooth animations and transitions

**Verification Results**:
- ✅ 24-word mnemonic generation works
- ✅ Deterministic .onion derivation verified (same input → same output)
- ✅ Valid Tor v3 address format (56 chars, correct charset)
- ✅ Correct key file sizes (96 bytes secret, 64 bytes public)
- ✅ Correct Tor headers in key files
- ✅ Tor bootstraps successfully and hidden service comes online
- ✅ .onion address is reachable via Tor Browser

**What's NOT built yet (future phases)**:
- [ ] Beacon mode (client connecting to scanner via Tor SOCKS5)
- [ ] Time-window scheduling (predetermined communication windows)
- [ ] Duress pin (panic/wipe mechanism under coercion)
- [ ] Mobile/portable version

---

*This seal is a living document. Each milestone is appended as work progresses.*
