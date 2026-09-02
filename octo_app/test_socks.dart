import 'dart:io';

void main() async {
  final client = HttpClient();
  client.findProxy = (uri) {
    return 'SOCKS5 127.0.0.1:9050';
  };
  try {
    print('Testing SOCKS proxy...');
    final req = await client.getUrl(Uri.parse('http://example.com'));
    final res = await req.close();
    print('Status: \${res.statusCode}');
  } catch (e) {
    print('Error: \$e');
  }
}
