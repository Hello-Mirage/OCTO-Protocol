# OCTO Protocol

Serverless peer-to-peer encrypted chat over Tor hidden services. Identity derived from a BIP-39 24-word mnemonic.

## How It Works

```
24 words → BIP-39 seed → ed25519 keypair → Tor v3 .onion address
```

Memorize 24 words. That's your identity. Recreate your hidden service on any device, any time.

## Quick Start

```bash
npm install
node src/main.js
```

Open `http://localhost:3000`, generate your identity, start the scanner, and access your `.onion` address via Tor Browser.

## License

Copyright (c) 2026 Miraj Rahaman

This project is licensed under the GPL-3.0 License — See [LICENSE](LICENSE) for details.
