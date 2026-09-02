import 'dart:typed_data';
import 'package:bip39/bip39.dart' as bip39;
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:pointycastle/digests/sha3.dart';
import 'package:base32/base32.dart';

import 'package:hex/hex.dart';

void main() async {
  final mnemonic = "combine guide illness urban pulse thought custom abandon false flavor ordinary exact artist problem depend involve protect suspect abstract biology album unaware afford require";
  
  final seed = bip39.mnemonicToSeed(mnemonic);
  final edSeed = seed.sublist(0, 32);
  
  final hash = sha512.convert(edSeed).bytes;
  final scalar = Uint8List.fromList(hash.sublist(0, 32));
  scalar[0] &= 248;
  scalar[31] &= 127;
  scalar[31] |= 64;
  
  final ed25519 = Ed25519();
  final keyPair = await ed25519.newKeyPairFromSeed(edSeed);
  final pubKey = await keyPair.extractPublicKey();
  final pubKeyBytes = Uint8List.fromList(pubKey.bytes);
  
  print('edSeed: ${HEX.encode(edSeed)}');
  print('Scalar: ${HEX.encode(scalar)}');
  print('PubKey: ${HEX.encode(pubKeyBytes)}');
  
  final prefix = ".onion checksum".codeUnits;
  final version = [0x03];
  
  final checksumData = Uint8List.fromList([...prefix, ...pubKeyBytes, ...version]);
  final sha3 = SHA3Digest(256);
  final fullChecksum = sha3.process(checksumData);
  final checksum = fullChecksum.sublist(0, 2);
  
  final onionData = Uint8List.fromList([...pubKeyBytes, ...checksum, ...version]);
  final onionString = base32.encode(onionData).toLowerCase();
  
  print('ChecksumData: ${HEX.encode(checksumData)}');
  print('Checksum: ${HEX.encode(checksum)}');
  print('OnionData: ${HEX.encode(onionData)}');
  print('Onion Address: $onionString.onion');
}
