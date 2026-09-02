const bip39 = require('bip39');
const nacl = require('tweetnacl');
const crypto = require('crypto');

const mnemonic = "combine guide illness urban pulse thought custom abandon false flavor ordinary exact artist problem depend involve protect suspect abstract biology album unaware afford require";
const seed = bip39.mnemonicToSeedSync(mnemonic);
const edSeed = seed.slice(0, 32);

const hash = crypto.createHash('sha512').update(edSeed).digest();
const scalar = hash.slice(0, 32);
scalar[0] &= 248;
scalar[31] &= 127;
scalar[31] |= 64;
const rightHalf = hash.slice(32, 64);

const keyPair = nacl.sign.keyPair.fromSeed(new Uint8Array(edSeed));

const checksumData = Buffer.concat([Buffer.from(".onion checksum"), Buffer.from(keyPair.publicKey), Buffer.from([0x03])]);
const checksum = crypto.createHash('sha3-256').update(checksumData).digest().slice(0, 2);
const onionData = Buffer.concat([Buffer.from(keyPair.publicKey), checksum, Buffer.from([0x03])]);
const base32 = require('hi-base32');
const onion = base32.encode(onionData).toLowerCase() + '.onion';

console.log("edSeed:", Buffer.from(edSeed).toString('hex'));
console.log("Scalar:", Buffer.from(scalar).toString('hex'));
console.log("PubKey:", Buffer.from(keyPair.publicKey).toString('hex'));
console.log("ChecksumData:", checksumData.toString('hex'));
console.log("Checksum:", checksum.toString('hex'));
console.log("OnionData:", onionData.toString('hex'));
console.log("Onion:", onion);
