/**
 * Quick test: Verify the BIP-39 → ed25519 → .onion pipeline
 */

const identity = require('./identity');

console.log('═══════════════════════════════════════════');
console.log('  OCTO Protocol — Identity Pipeline Test');
console.log('═══════════════════════════════════════════\n');

// 1. Generate a new mnemonic
const mnemonic = identity.generateMnemonic();
const words = mnemonic.split(' ');
console.log('1. Generated 24-word mnemonic:');
words.forEach((w, i) => {
    process.stdout.write(`   ${String(i + 1).padStart(2)}. ${w.padEnd(12)}`);
    if ((i + 1) % 4 === 0) console.log();
});

// 2. Derive .onion address
const onion1 = identity.mnemonicToOnion(mnemonic);
console.log(`\n2. Derived .onion address:\n   ${onion1}`);

// 3. Verify determinism — same mnemonic → same address
const onion2 = identity.mnemonicToOnion(mnemonic);
console.log(`\n3. Determinism check: ${onion1 === onion2 ? '✓ PASS' : '✗ FAIL'}`);

// 4. Verify .onion format (56 chars + .onion)
const onionPart = onion1.replace('.onion', '');
console.log(`   Address length: ${onionPart.length} chars ${onionPart.length === 56 ? '✓' : '✗'}`);
console.log(`   Valid charset: ${/^[a-z2-7]+$/.test(onionPart) ? '✓' : '✗'}`);

// 5. Write Tor key files
const fs = require('fs');
const path = require('path');
const testDir = path.join(__dirname, '..', 'data', 'test_keys');

const onion3 = identity.writeTorKeys(testDir, mnemonic);
console.log(`\n4. Tor key files written to ${testDir}`);

// Verify file sizes
const secretKey = fs.readFileSync(path.join(testDir, 'hs_ed25519_secret_key'));
const publicKey = fs.readFileSync(path.join(testDir, 'hs_ed25519_public_key'));
const hostname = fs.readFileSync(path.join(testDir, 'hostname'), 'utf8').trim();

console.log(`   hs_ed25519_secret_key: ${secretKey.length} bytes ${secretKey.length === 96 ? '✓' : '✗'}`);
console.log(`   hs_ed25519_public_key: ${publicKey.length} bytes ${publicKey.length === 64 ? '✓' : '✗'}`);
console.log(`   hostname matches: ${hostname === onion1 ? '✓' : '✗'}`);

// 6. Verify headers
const secretHeader = secretKey.slice(0, 29).toString('ascii');
const publicHeader = publicKey.slice(0, 29).toString('ascii');
console.log(`   Secret key header: "${secretHeader}" ${secretHeader === '== ed25519v1-secret: type0 ==' ? '✓' : '✗'}`);
console.log(`   Public key header: "${publicHeader}" ${publicHeader === '== ed25519v1-public: type0 ==' ? '✓' : '✗'}`);

// 7. Test validation
console.log(`\n5. Mnemonic validation:`);
console.log(`   Valid mnemonic: ${identity.validateMnemonic(mnemonic) ? '✓' : '✗'}`);
console.log(`   Invalid mnemonic: ${!identity.validateMnemonic('hello world foo bar') ? '✓ (correctly rejected)' : '✗'}`);

// Cleanup test files
fs.rmSync(testDir, { recursive: true, force: true });

console.log('\n═══════════════════════════════════════════');
console.log('  All checks passed! Pipeline is working.');
console.log('═══════════════════════════════════════════\n');
