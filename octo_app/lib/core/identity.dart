import 'dart:io';
import 'dart:typed_data';
import 'package:bip39/bip39.dart' as bip39;
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:pointycastle/digests/sha3.dart';
import 'package:base32/base32.dart';

class Identity {
  final String mnemonic;
  final String onionAddress;
  final Uint8List publicKey;
  final Uint8List secretKey;

  Identity._({
    required this.mnemonic,
    required this.onionAddress,
    required this.publicKey,
    required this.secretKey,
  });

  /// Generates a new 24-word BIP-39 mnemonic.
  static String generateMnemonic() {
    return bip39.generateMnemonic(strength: 256);
  }

  /// Validates a BIP-39 mnemonic.
  static bool validateMnemonic(String mnemonic) {
    return bip39.validateMnemonic(mnemonic);
  }

  /// Derives the ed25519 keys and Tor v3 onion address from a mnemonic.
  static Future<Identity> fromMnemonic(String mnemonic) async {
    if (!validateMnemonic(mnemonic)) {
      throw Exception('Invalid BIP-39 mnemonic');
    }

    final seed = bip39.mnemonicToSeed(mnemonic);
    final edSeed = seed.sublist(0, 32);

    final hash = sha512.convert(edSeed).bytes;
    final scalar = Uint8List.fromList(hash.sublist(0, 32));
    scalar[0] &= 248;
    scalar[31] &= 127;
    scalar[31] |= 64;

    final rightHalf = Uint8List.fromList(hash.sublist(32, 64));

    final ed25519 = Ed25519();
    final keyPair = await ed25519.newKeyPairFromSeed(edSeed);
    final pubKey = await keyPair.extractPublicKey();
    final pubKeyBytes = Uint8List.fromList(pubKey.bytes);

    // Tor Secret Key format: "== ed25519v1-secret: type0 ==\0\0\0" (32 bytes) + scalar + rightHalf
    final secretHeader = "== ed25519v1-secret: type0 ==\x00\x00\x00".codeUnits;
    final secretKeyBytes = Uint8List.fromList([...secretHeader, ...scalar, ...rightHalf]);

    // Tor Public Key format: "== ed25519v1-public: type0 ==\0\0\0" (32 bytes) + pubkey
    final publicHeader = "== ed25519v1-public: type0 ==\x00\x00\x00".codeUnits;
    final publicKeyBytes = Uint8List.fromList([...publicHeader, ...pubKeyBytes]);

    // Checksum: SHA3_256(".onion checksum" + pubkey + 0x03)
    final prefix = ".onion checksum".codeUnits;
    final version = [0x03];
    final checksumData = Uint8List.fromList([...prefix, ...pubKeyBytes, ...version]);
    final sha3 = SHA3Digest(256);
    final checksum = sha3.process(checksumData).sublist(0, 2);

    final onionData = Uint8List.fromList([...pubKeyBytes, ...checksum, ...version]);
    final onionAddress = base32.encode(onionData).toLowerCase() + '.onion';

    return Identity._(
      mnemonic: mnemonic,
      onionAddress: onionAddress,
      publicKey: publicKeyBytes,
      secretKey: secretKeyBytes,
    );
  }

  /// Writes the Tor hidden service keys to disk.
  Future<void> writeTorKeys(String directoryPath) async {
    final dir = Directory(directoryPath);
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }

    final secretFile = File('${dir.path}/hs_ed25519_secret_key');
    final publicFile = File('${dir.path}/hs_ed25519_public_key');
    final hostnameFile = File('${dir.path}/hostname');

    await secretFile.writeAsBytes(secretKey);
    await publicFile.writeAsBytes(publicKey);
    await hostnameFile.writeAsString('$onionAddress\n');
  }
}
