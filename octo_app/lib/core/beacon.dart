import 'dart:io';
import 'package:web_socket_channel/io.dart';
import 'socks_forwarder.dart';

class BeaconMode {
  final int torSocksPort;
  final Function(String message, String from) onMessageReceived;
  final Function(bool isConnected) onConnectionStatusChanged;

  IOWebSocketChannel? _channel;
  Socks5Forwarder? _forwarder;

  BeaconMode({
    required this.torSocksPort,
    required this.onMessageReceived,
    required this.onConnectionStatusChanged,
  });

  /// Connects to the Scanner via Tor SOCKS5 Proxy.
  Future<void> connect(String onionAddress) async {
    if (!onionAddress.endsWith('.onion')) {
      throw Exception('Invalid .onion address');
    }

    try {
      // Pick a random local port
      final localPort = 30000 + (DateTime.now().millisecondsSinceEpoch % 10000);
      
      _forwarder = Socks5Forwarder(
        localPort: localPort,
        socksPort: torSocksPort,
        targetHost: onionAddress,
        targetPort: 80, // Tor Hidden Service port
      );
      await _forwarder!.start();

      // Wait a moment for the forwarder to be ready
      await Future.delayed(const Duration(milliseconds: 500));

      final ws = await WebSocket.connect('ws://127.0.0.1:$localPort');
      _channel = IOWebSocketChannel(ws);
      
      onConnectionStatusChanged(true);

      _channel!.stream.listen(
        (message) {
          onMessageReceived(message.toString(), 'scanner');
        },
        onDone: () {
          onConnectionStatusChanged(false);
          _cleanup();
        },
        onError: (err) {
          print('[Beacon] WebSocket error: $err');
          onConnectionStatusChanged(false);
          _cleanup();
        }
      );
    } catch (e) {
      print('[Beacon] Connect error: $e');
      onConnectionStatusChanged(false);
      await _cleanup();
      throw e;
    }
  }

  /// Sends a message to the Scanner.
  void sendMessage(String text) {
    if (_channel != null) {
      final msg = '{"type": "message", "text": "$text", "from": "peer", "timestamp": ${DateTime.now().millisecondsSinceEpoch}}';
      _channel!.sink.add(msg);
    }
  }

  Future<void> _cleanup() async {
    await _channel?.sink.close();
    _channel = null;
    await _forwarder?.stop();
    _forwarder = null;
  }

  /// Disconnects from the Scanner.
  Future<void> disconnect() async {
    await _cleanup();
    onConnectionStatusChanged(false);
  }
}
