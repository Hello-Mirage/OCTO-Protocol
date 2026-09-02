import 'dart:io';
import 'dart:async';

class Socks5Forwarder {
  final int localPort;
  final int socksPort;
  final String targetHost; // .onion address
  final int targetPort;

  ServerSocket? _server;
  final List<Socket> _connections = [];

  Socks5Forwarder({
    required this.localPort,
    required this.socksPort,
    required this.targetHost,
    required this.targetPort,
  });

  Future<void> start() async {
    _server = await ServerSocket.bind('127.0.0.1', localPort);
    _server!.listen(_handleConnection);
  }

  Future<void> _handleConnection(Socket localSocket) async {
    _connections.add(localSocket);

    try {
      // Connect to Tor SOCKS5
      final socksSocket = await Socket.connect('127.0.0.1', socksPort);
      _connections.add(socksSocket);

      // SOCKS5 Handshake - Greeting
      socksSocket.add([0x05, 0x01, 0x00]); // Version 5, 1 auth method, NO AUTH
      await _waitForBytes(socksSocket, 2);

      // SOCKS5 Request
      final hostBytes = targetHost.codeUnits;
      final req = <int>[
        0x05, 0x01, 0x00, 0x03, // V5, CONNECT, RSV, DOMAINNAME
        hostBytes.length,
        ...hostBytes,
        (targetPort >> 8) & 0xFF,
        targetPort & 0xFF,
      ];
      socksSocket.add(req);

      // Read response
      final resp = await _waitForBytes(socksSocket, 10); // Standard response is 10 bytes usually
      if (resp[1] != 0x00) {
        throw Exception('SOCKS5 connect failed: ${resp[1]}');
      }

      // Proxy traffic bidirectionally
      localSocket.cast<List<int>>().listen(socksSocket.add, onDone: () {
        socksSocket.destroy();
      });
      socksSocket.cast<List<int>>().listen(localSocket.add, onDone: () {
        localSocket.destroy();
      });

    } catch (e) {
      print('Socks5Forwarder error: $e');
      localSocket.destroy();
    }
  }

  Future<List<int>> _waitForBytes(Socket socket, int count) async {
    final completer = Completer<List<int>>();
    final buffer = <int>[];
    late StreamSubscription sub;
    
    sub = socket.listen((data) {
      buffer.addAll(data);
      if (buffer.length >= count) {
        sub.cancel();
        completer.complete(buffer);
      }
    }, onError: (e) {
      completer.completeError(e);
    });

    return completer.future;
  }

  Future<void> stop() async {
    for (var s in _connections) {
      s.destroy();
    }
    _connections.clear();
    await _server?.close();
  }
}
