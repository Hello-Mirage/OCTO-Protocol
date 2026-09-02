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
      final socksSocket = await Socket.connect('127.0.0.1', socksPort);
      _connections.add(socksSocket);

      socksSocket.add([0x05, 0x01, 0x00]); // Greeting

      int state = 0;
      final buffer = <int>[];

      socksSocket.listen((data) {
        if (state == 2) {
          localSocket.add(data);
          return;
        }

        buffer.addAll(data);

        if (state == 0 && buffer.length >= 2) {
          if (buffer[1] != 0x00) {
            print('SOCKS auth failed');
            socksSocket.destroy();
            return;
          }
          buffer.removeRange(0, 2);
          state = 1;

          final hostBytes = targetHost.codeUnits;
          final req = <int>[
            0x05, 0x01, 0x00, 0x03,
            hostBytes.length,
            ...hostBytes,
            (targetPort >> 8) & 0xFF,
            targetPort & 0xFF,
          ];
          socksSocket.add(req);
        }

        if (state == 1 && buffer.length >= 4) {
          int atyp = buffer[3];
          int respLen = 4;
          if (atyp == 0x01) respLen += 4 + 2; // IPv4
          else if (atyp == 0x03) respLen += 1 + buffer[4] + 2; // Domain
          else if (atyp == 0x04) respLen += 16 + 2; // IPv6

          if (buffer.length >= respLen) {
            if (buffer[1] != 0x00) {
              print('SOCKS connect failed: ${buffer[1]}');
              socksSocket.destroy();
              return;
            }
            final leftover = buffer.sublist(respLen);
            state = 2; // Proxy mode active
            
            if (leftover.isNotEmpty) {
              localSocket.add(leftover);
            }
          }
        }
      }, onDone: () {
        localSocket.destroy();
      }, onError: (e) {
        localSocket.destroy();
      });

      localSocket.listen((data) {
        socksSocket.add(data);
      }, onDone: () {
        socksSocket.destroy();
      }, onError: (e) {
        socksSocket.destroy();
      });

    } catch (e) {
      print('Socks5Forwarder error: $e');
      localSocket.destroy();
    }
  }

  Future<void> stop() async {
    for (var s in _connections) {
      s.destroy();
    }
    _connections.clear();
    await _server?.close();
  }
}
