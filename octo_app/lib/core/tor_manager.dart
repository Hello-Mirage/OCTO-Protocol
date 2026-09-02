import 'dart:io';
import 'dart:async';

class TorManager {
  final String dataDir;
  Process? _torProcess;
  final StreamController<int> _bootstrapController = StreamController<int>.broadcast();

  TorManager(this.dataDir);

  Stream<int> get onBootstrap => _bootstrapController.stream;

  /// Locates the tor.exe binary.
  Future<String?> findTorBinary() async {
    final searchPaths = [
      'tor', // In PATH
      'D:\\Website\\tor_service\\tor\\tor.exe',
      'C:\\Users\\MOSTAFUR RAHAMAN\\Desktop\\Website\\tor_service\\tor\\tor.exe',
      '${Directory.current.path}\\tor\\tor.exe'
    ];

    for (final path in searchPaths) {
      if (path == 'tor') {
        try {
          final res = await Process.run('where', ['tor.exe']);
          if (res.exitCode == 0) return 'tor.exe';
        } catch (_) {}
      } else {
        if (await File(path).exists()) return path;
      }
    }
    return null;
  }

  /// Writes a torrc for Scanner mode (Hidden Service).
  Future<String> writeScannerConfig(String hiddenServiceDir, int hiddenServicePort, int localPort) async {
    final dir = Directory(dataDir);
    if (!await dir.exists()) await dir.create(recursive: true);

    final torrcPath = '${dir.path}/torrc';
    final torrc = '''
SocksPort 0
Log notice stdout
DataDirectory ${dir.path.replaceAll('\\', '/')}
HiddenServiceDir ${hiddenServiceDir.replaceAll('\\', '/')}
HiddenServicePort $hiddenServicePort 127.0.0.1:$localPort
''';
    await File(torrcPath).writeAsString(torrc);
    return torrcPath;
  }

  /// Writes a minimal torrc for Beacon mode (SOCKS proxy & HTTP proxy).
  Future<String> writeBeaconConfig(int socksPort, int httpPort) async {
    final dir = Directory(dataDir);
    if (!await dir.exists()) await dir.create(recursive: true);

    final torrcPath = '${dir.path}/torrc';
    final torrc = '''
SocksPort $socksPort
HTTPTunnelPort $httpPort
Log notice stdout
DataDirectory ${dir.path.replaceAll('\\', '/')}
''';
    await File(torrcPath).writeAsString(torrc);
    return torrcPath;
  }

  /// Starts the Tor process with the given torrc file.
  Future<void> start(String torrcPath) async {
    await stop();

    final torBinary = await findTorBinary();
    if (torBinary == null) {
      throw Exception('Tor binary not found.');
    }

    _torProcess = await Process.start(torBinary, ['-f', torrcPath]);

    _torProcess!.stdout.transform(SystemEncoding().decoder).listen((data) {
      // Parse bootstrap progress: "Bootstrapped 15% (handshake)"
      final regex = RegExp(r'Bootstrapped (\d+)%');
      final match = regex.firstMatch(data);
      if (match != null) {
        final progress = int.tryParse(match.group(1) ?? '0') ?? 0;
        _bootstrapController.add(progress);
      }
    });

    _torProcess!.stderr.transform(SystemEncoding().decoder).listen((data) {
      print('[TOR ERROR] $data');
    });

    // Wait for the process to actually exit if it fails early
    _torProcess!.exitCode.then((code) {
      if (code != 0) {
        print('Tor exited with code $code');
      }
      _torProcess = null;
    });
  }

  /// Stops the running Tor process.
  Future<void> stop() async {
    if (_torProcess != null) {
      _torProcess!.kill();
      _torProcess = null;
    }
    // In Windows, sometimes the process lingers, but Process.kill() usually works for child processes.
  }
}
