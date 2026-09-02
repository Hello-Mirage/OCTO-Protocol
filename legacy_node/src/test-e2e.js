/**
 * End-to-end test: Generate identity → Write Tor keys → Start Tor → Verify hidden service
 */

const identity = require('./identity');
const TorManager = require('./tor-manager');
const path = require('path');
const fs = require('fs');

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  OCTO Protocol — Full E2E Test');
    console.log('═══════════════════════════════════════════\n');

    // 1. Generate identity
    const mnemonic = identity.generateMnemonic();
    console.log('1. Mnemonic:', mnemonic.split(' ').slice(0, 4).join(' ') + ' ...');

    // 2. Derive .onion
    const onion = identity.mnemonicToOnion(mnemonic);
    console.log(`2. .onion: ${onion}`);

    // 3. Write Tor keys
    const dataDir = path.join(__dirname, '..', 'data');
    const hsDir = path.join(dataDir, 'hidden_service');
    identity.writeTorKeys(hsDir, mnemonic);
    console.log('3. Tor key files written ✓');

    // 4. Find Tor binary
    const tor = new TorManager(dataDir);
    const torBinary = tor.findTorBinary();
    if (!torBinary) {
        console.error('✗ Tor binary not found!');
        process.exit(1);
    }
    console.log(`4. Tor binary: ${torBinary} ✓`);

    // 5. Start a simple HTTP server
    const http = require('http');
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>OCTO Protocol is LIVE!</h1><p>This is served on your .onion address.</p></body></html>');
    });

    await new Promise(resolve => server.listen(3001, '127.0.0.1', resolve));
    console.log('5. Test HTTP server on 127.0.0.1:3001 ✓');

    // 6. Start Tor with hidden service
    const torrcPath = tor.writeScannerConfig(hsDir, 80, 3001);
    console.log('6. torrc written ✓');
    console.log('7. Starting Tor (this takes 30-60 seconds)...\n');

    tor.on('bootstrap', (progress) => {
        process.stdout.write(`   Bootstrap: ${progress}%\r`);
    });

    try {
        await tor.start(torrcPath);
        console.log('\n\n═══════════════════════════════════════════');
        console.log('  ✓ HIDDEN SERVICE IS LIVE!');
        console.log(`  Address: ${onion}`);
        console.log('  Open this in Tor Browser to verify!');
        console.log('═══════════════════════════════════════════');
        console.log('\nPress Ctrl+C to stop.\n');
    } catch (err) {
        console.error(`\n✗ Tor failed: ${err.message}`);
        server.close();
        process.exit(1);
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
