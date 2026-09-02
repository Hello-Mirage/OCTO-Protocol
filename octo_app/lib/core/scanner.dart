import 'dart:io';
import 'package:shelf/shelf.dart';
import 'package:shelf/shelf_io.dart' as io;
import 'package:shelf_web_socket/shelf_web_socket.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class ScannerMode {
  final int port;
  final Function(String message, String from) onMessageReceived;
  final Function(int peerCount) onPeerCountChanged;
  
  HttpServer? _server;
  final List<WebSocketChannel> _clients = [];
  final List<Map<String, dynamic>> _chatHistory = [];

  ScannerMode({
    required this.port,
    required this.onMessageReceived,
    required this.onPeerCountChanged,
  });

  /// Starts the local HTTP/WebSocket server.
  Future<void> start() async {
    final handler = webSocketHandler((WebSocketChannel webSocket, String? protocol) {
      _clients.add(webSocket);
      onPeerCountChanged(_clients.length);

      // Send chat history
      webSocket.sink.add('{"type": "history", "messages": []}'); // TODO: JSON encode real history

      webSocket.stream.listen(
        (message) {
          // message received from Beacon
          onMessageReceived(message.toString(), 'peer');
          
          // Broadcast to other peers
          for (final client in _clients) {
            if (client != webSocket) {
              client.sink.add(message);
            }
          }
        },
        onDone: () {
          _clients.remove(webSocket);
          onPeerCountChanged(_clients.length);
        },
      );
    });

    final pipeline = const Pipeline().addHandler(handler);
    _server = await io.serve(pipeline, '127.0.0.1', port);
  }

  /// Sends a message to all connected Beacon peers.
  void broadcastMessage(String text) {
    final msg = '{"type": "message", "text": "$text", "from": "scanner", "timestamp": ${DateTime.now().millisecondsSinceEpoch}}';
    for (final client in _clients) {
      client.sink.add(msg);
    }
  }

  /// Stops the server.
  Future<void> stop() async {
    for (final client in _clients) {
      client.sink.close();
    }
    _clients.clear();
    await _server?.close(force: true);
    _server = null;
  }
}
