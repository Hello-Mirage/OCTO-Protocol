/**
 * OCTO Protocol — Identity Module
 * 
 * BIP-39 Mnemonic (24 words) → ed25519 Keypair → Tor v3 .onion Address
 * 
 * The pipeline:
 *   24 words → PBKDF2 → 512-bit seed → first 32 bytes → ed25519 seed
 *   ed25519 seed → SHA-512 expand → private scalar + righthalf (Tor format)
 *   ed25519 seed → public key → SHA3-256 checksum → base32 → .onion address
 */

const bip39 = require('bip39');
const nacl = require('tweetnacl');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Base32 Encoding (RFC 4648, lowercase) ──────────────────────────

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base32Encode(buffer) {
    let bits = '';
    for (const byte of buffer) {
        bits += byte.toString(2).padStart(8, '0');
    }
    let result = '';
    for (let i = 0; i < bits.length; i += 5) {
        const chunk = bits.substring(i, i + 5).padEnd(5, '0');
        result += BASE32_ALPHABET[parseInt(chunk, 2)];
    }
    return result;
}

// ─── Mnemonic Generation ────────────────────────────────────────────

/**
 * Generate a new 24-word BIP-39 mnemonic (256 bits of entropy)
 */
function generateMnemonic() {
    return bip39.generateMnemonic(256);
}

/**
 * Validate a BIP-39 mnemonic phrase
 */
function validateMnemonic(mnemonic) {
    return bip39.validateMnemonic(mnemonic);
}

// ─── Key Derivation ─────────────────────────────────────────────────

/**
 * Convert mnemonic to 64-byte seed via PBKDF2
 */
function mnemonicToSeed(mnemonic) {
    return bip39.mnemonicToSeedSync(mnemonic);
}

/**
 * Derive ed25519 keypair from a BIP-39 seed
 * Takes the first 32 bytes of the 64-byte seed as the ed25519 seed
 */
function seedToKeyPair(seed) {
    const ed25519Seed = Buffer.from(seed.slice(0, 32));
    const keyPair = nacl.sign.keyPair.fromSeed(ed25519Seed);
    return {
        publicKey: Buffer.from(keyPair.publicKey),
        secretKey: Buffer.from(keyPair.secretKey),
        seed: ed25519Seed
    };
}

/**
 * Expand ed25519 seed into Tor's secret key format
 * SHA-512(seed) → clamp first 32 bytes (scalar) + keep last 32 bytes (righthalf)
 */
function expandSecretKey(ed25519Seed) {
    const h = crypto.createHash('sha512').update(ed25519Seed).digest();
    // Clamp the scalar (first 32 bytes)
    h[0] &= 248;    // Clear bits 0, 1, 2
    h[31] &= 127;   // Clear bit 255
    h[31] |= 64;    // Set bit 254
    return {
        scalar: h.slice(0, 32),
        righthalf: h.slice(32, 64)
    };
}

// ─── .onion Address Computation ─────────────────────────────────────

/**
 * Compute Tor v3 .onion address from ed25519 public key
 * 
 * Formula: base32(PUBKEY || CHECKSUM || VERSION) + ".onion"
 * CHECKSUM = SHA3-256(".onion checksum" || PUBKEY || VERSION)[:2]
 * VERSION = 0x03
 */
function publicKeyToOnion(publicKey) {
    const version = Buffer.from([0x03]);
    const prefix = Buffer.from('.onion checksum');

    // Compute checksum: first 2 bytes of SHA3-256(prefix + pubkey + version)
    const checksum = crypto.createHash('sha3-256')
        .update(prefix)
        .update(publicKey)
        .update(version)
        .digest()
        .slice(0, 2);

    // Concatenate: pubkey(32) + checksum(2) + version(1) = 35 bytes
    const addressBytes = Buffer.concat([publicKey, checksum, version]);

    // Base32 encode → 56-character .onion address
    return base32Encode(addressBytes) + '.onion';
}

/**
 * Full pipeline: mnemonic → .onion address
 */
function mnemonicToOnion(mnemonic) {
    const seed = mnemonicToSeed(mnemonic);
    const keyPair = seedToKeyPair(seed);
    return publicKeyToOnion(keyPair.publicKey);
}

// ─── Tor Key File Generation ────────────────────────────────────────

/**
 * Write Tor hidden service key files from a mnemonic
 * 
 * Creates:
 *   hs_ed25519_secret_key — 96 bytes: header(32) + scalar(32) + righthalf(32)
 *   hs_ed25519_public_key — 64 bytes: header(32) + pubkey(32)
 *   hostname — the .onion address
 * 
 * Returns the .onion address
 */
function writeTorKeys(dir, mnemonic) {
    fs.mkdirSync(dir, { recursive: true });

    const seed = mnemonicToSeed(mnemonic);
    const keyPair = seedToKeyPair(seed);
    const { scalar, righthalf } = expandSecretKey(keyPair.seed);
    const onionAddress = publicKeyToOnion(keyPair.publicKey);

    // ── Secret key file: header(32) + scalar(32) + righthalf(32) = 96 bytes
    const secretHeader = Buffer.alloc(32);
    secretHeader.write('== ed25519v1-secret: type0 ==', 0, 'ascii');
    // Last 3 bytes are already 0x00 from Buffer.alloc
    const secretFile = Buffer.concat([secretHeader, scalar, righthalf]);

    if (secretFile.length !== 96) {
        throw new Error(`Secret key file wrong size: ${secretFile.length} (expected 96)`);
    }
    fs.writeFileSync(path.join(dir, 'hs_ed25519_secret_key'), secretFile);

    // ── Public key file: header(32) + pubkey(32) = 64 bytes
    const publicHeader = Buffer.alloc(32);
    publicHeader.write('== ed25519v1-public: type0 ==', 0, 'ascii');
    const publicFile = Buffer.concat([publicHeader, keyPair.publicKey]);

    if (publicFile.length !== 64) {
        throw new Error(`Public key file wrong size: ${publicFile.length} (expected 64)`);
    }
    fs.writeFileSync(path.join(dir, 'hs_ed25519_public_key'), publicFile);

    // ── Hostname file
    fs.writeFileSync(path.join(dir, 'hostname'), onionAddress + '\n');

    console.log(`[identity] Tor keys written to ${dir}`);
    console.log(`[identity] .onion address: ${onionAddress}`);

    return onionAddress;
}

// ─── Full Identity Object ───────────────────────────────────────────

/**
 * Create a full identity object from a mnemonic
 */
function createIdentity(mnemonic) {
    if (!validateMnemonic(mnemonic)) {
        throw new Error('Invalid BIP-39 mnemonic');
    }
    const seed = mnemonicToSeed(mnemonic);
    const keyPair = seedToKeyPair(seed);
    const onionAddress = publicKeyToOnion(keyPair.publicKey);

    return {
        mnemonic,
        onionAddress,
        publicKey: keyPair.publicKey.toString('hex'),
        words: mnemonic.split(' ')
    };
}

module.exports = {
    generateMnemonic,
    validateMnemonic,
    mnemonicToOnion,
    mnemonicToSeed,
    seedToKeyPair,
    expandSecretKey,
    publicKeyToOnion,
    writeTorKeys,
    createIdentity,
    base32Encode
};
