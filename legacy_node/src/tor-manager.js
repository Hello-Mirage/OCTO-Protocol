/**
 * OCTO Protocol — Tor Manager
 * 
 * Manages the Tor process lifecycle:
 *   - Writes torrc configuration
 *   - Spawns Tor process
 *   - Monitors bootstrap progress
 *   - Handles shutdown
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

// Common Tor binary locations on Windows
const TOR_SEARCH_PATHS = [
    'tor',  // In PATH
    'D:\\Website\\tor_service\\tor\\tor.exe',
    'C:\\Users\\MOSTAFUR RAHAMAN\\Desktop\\Website\\tor_service\\tor\\tor.exe',
    path.join(process.cwd(), 'tor', 'tor.exe'),
];

class TorManager extends EventEmitter {
    constructor(dataDir) {
        super();
        this.dataDir = dataDir;
        this.torProcess = null;
        this.isRunning = false;
        this.bootstrapProgress = 0;
        this.torBinary = null;
    }

    /**
     * Find the Tor binary on the system
     */
    findTorBinary() {
        for (const torPath of TOR_SEARCH_PATHS) {
            if (torPath === 'tor') {
                // Check if 'tor' is in PATH
                try {
                    const { execSync } = require('child_process');
                    execSync('where tor', { stdio: 'pipe' });
                    this.torBinary = 'tor';
                    return 'tor';
                } catch {
                    continue;
                }
            }
            if (fs.existsSync(torPath)) {
                this.torBinary = torPath;
                return torPath;
            }
        }
        return null;
    }

    /**
     * Write torrc configuration for Scanner mode (hidden service)
     */
    writeScannerConfig(hiddenServiceDir, hiddenServicePort, localPort) {
        const torDataDir = path.join(this.dataDir, 'tor_data');
        fs.mkdirSync(torDataDir, { recursive: true });

        const torrc = [
            `SocksPort 0`,
            `DataDirectory ${torDataDir}`,
            `HiddenServiceDir ${hiddenServiceDir}`,
            `HiddenServicePort ${hiddenServicePort} 127.0.0.1:${localPort}`,
            ``
        ].join('\n');

        const torrcPath = path.join(this.dataDir, 'torrc');
        fs.writeFileSync(torrcPath, torrc);
        console.log(`[tor] Config written to ${torrcPath}`);
        return torrcPath;
    }

    /**
     * Write torrc configuration for Beacon mode (SOCKS proxy only)
     */
    writeBeaconConfig(socksPort = 9050) {
        const torDataDir = path.join(this.dataDir, 'tor_data');
        fs.mkdirSync(torDataDir, { recursive: true });

        const torrc = [
            `SocksPort ${socksPort}`,
            `DataDirectory ${torDataDir}`,
            ``
        ].join('\n');

        const torrcPath = path.join(this.dataDir, 'torrc');
        fs.writeFileSync(torrcPath, torrc);
        console.log(`[tor] Beacon config written to ${torrcPath}`);
        return torrcPath;
    }

    /**
     * Start the Tor process
     */
    start(torrcPath) {
        return new Promise((resolve, reject) => {
            if (!this.torBinary) {
                this.torBinary = this.findTorBinary();
                if (!this.torBinary) {
                    reject(new Error(
                        'Tor binary not found. Please install Tor or place tor.exe in the project\'s tor/ directory.'
                    ));
                    return;
                }
            }

            console.log(`[tor] Starting Tor: ${this.torBinary}`);
            console.log(`[tor] Using config: ${torrcPath}`);

            this.torProcess = spawn(this.torBinary, ['-f', torrcPath], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let bootstrapped = false;

            this.torProcess.stdout.on('data', (data) => {
                const line = data.toString().trim();
                if (line) {
                    console.log(`[tor] ${line}`);

                    // Parse bootstrap progress
                    const match = line.match(/Bootstrapped (\d+)%/);
                    if (match) {
                        this.bootstrapProgress = parseInt(match[1]);
                        this.emit('bootstrap', this.bootstrapProgress);
                    }

                    // Check if fully bootstrapped
                    if (line.includes('Bootstrapped 100%') && !bootstrapped) {
                        bootstrapped = true;
                        this.isRunning = true;
                        this.emit('ready');
                        resolve();
                    }
                }
            });

            this.torProcess.stderr.on('data', (data) => {
                const line = data.toString().trim();
                if (line) {
                    console.error(`[tor:err] ${line}`);

                    // Also check stderr for bootstrap messages (some Tor versions output there)
                    const match = line.match(/Bootstrapped (\d+)%/);
                    if (match) {
                        this.bootstrapProgress = parseInt(match[1]);
                        this.emit('bootstrap', this.bootstrapProgress);
                    }

                    if (line.includes('Bootstrapped 100%') && !bootstrapped) {
                        bootstrapped = true;
                        this.isRunning = true;
                        this.emit('ready');
                        resolve();
                    }
                }
            });

            this.torProcess.on('error', (err) => {
                console.error(`[tor] Failed to start: ${err.message}`);
                reject(err);
            });

            this.torProcess.on('close', (code) => {
                console.log(`[tor] Process exited with code ${code}`);
                this.isRunning = false;
                this.emit('stopped', code);
                if (!bootstrapped) {
                    reject(new Error(`Tor exited before bootstrapping (code ${code})`));
                }
            });

            // Timeout after 2 minutes
            setTimeout(() => {
                if (!bootstrapped) {
                    this.stop();
                    reject(new Error('Tor bootstrap timeout (2 minutes)'));
                }
            }, 120000);
        });
    }

    /**
     * Stop the Tor process
     */
    stop() {
        if (this.torProcess) {
            console.log('[tor] Stopping Tor process...');
            this.torProcess.kill('SIGTERM');
            // Force kill after 5 seconds if it doesn't stop
            setTimeout(() => {
                if (this.torProcess && !this.torProcess.killed) {
                    this.torProcess.kill('SIGKILL');
                }
            }, 5000);
            this.isRunning = false;
        }
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            running: this.isRunning,
            bootstrapProgress: this.bootstrapProgress,
            torBinary: this.torBinary
        };
    }
}

module.exports = TorManager;
