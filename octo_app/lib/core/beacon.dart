import 'dart:io';
import 'package:web_socket_channel/io.dart';

class BeaconMode {
  final int torHttpProxyPort;
  final Function(String message, String from) onMessageReceived;
  final Function(bool isConnected) onConnectionStatusChanged;

  IOWebSocketChannel? _channel;

  BeaconMode({
    required this.torHttpProxyPort,
    required this.onMessageReceived,
    required this.onConnectionStatusChanged,
  });

  /// Connects to the Scanner via Tor HTTP Proxy.
  Future<void> connect(String onionAddress) async {
    if (!onionAddress.endsWith('.onion')) {
      throw Exception('Invalid .onion address');
    }

    try {
      final client = HttpClient();
      client.findProxy = (uri) {
        return 'PROXY 127.0.0.1:$torHttpProxyPort';
      };

      // Ensure the HTTP Client doesn't timeout indefinitely
      client.connectionTimeout = const Duration(seconds: 30);

      final ws = await WebSocket.connect('ws://$onionAddress', customClient: client);
      _channel = IOWebSocketChannel(ws);
      
      onConnectionStatusChanged(true);

      _channel!.stream.listen(
        (message) {
          onMessageReceived(message.toString(), 'scanner');
        },
        onDone: () {
          onConnectionStatusChanged(false);
          _channel = null;
        },
        onError: (err) {
          print('[Beacon] WebSocket error: $err');
          onConnectionStatusChanged(false);
        }
      );
    } catch (e) {
      print('[Beacon] Connect error: $e');
      onConnectionStatusChanged(false);
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

  /// Disconnects from the Scanner.
  Future<void> disconnect() async {
    await _channel?.sink.close();
    _channel = null;
    onConnectionStatusChanged(false);
  }
}
