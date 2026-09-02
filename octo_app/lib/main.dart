import 'dart:io';
import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';
import 'core/identity.dart';
import 'core/tor_manager.dart';
import 'core/scanner.dart';
import 'core/beacon.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();
  WindowOptions windowOptions = const WindowOptions(
    title: 'GHOST',
  );
  windowManager.waitUntilReadyToShow(windowOptions, () async {
    await windowManager.show();
    await windowManager.focus();
  });
  runApp(const GhostApp());
}

class GhostApp extends StatelessWidget {
  const GhostApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GHOST',
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.black,
        primaryColor: Colors.white,
        colorScheme: const ColorScheme.dark(
          primary: Colors.white,
          secondary: Colors.white70,
          surface: Color(0xFF111111),
        ),
        fontFamily: 'Consolas',
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
            shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          )
        ),
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            side: const BorderSide(color: Colors.white),
            shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
          )
        ),
      ),
      home: const SplashScreen(),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    );
    _animation = Tween<double>(begin: 0.0, end: 1.0).animate(CurvedAnimation(
      parent: _controller,
      curve: Curves.easeIn,
    ));

    _controller.forward().then((_) {
      Future.delayed(const Duration(milliseconds: 500), () {
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          PageRouteBuilder(
            pageBuilder: (context, animation, secondaryAnimation) => const MainScreen(),
            transitionsBuilder: (context, animation, secondaryAnimation, child) {
              return FadeTransition(
                opacity: animation,
                child: child,
              );
            },
            transitionDuration: const Duration(milliseconds: 1500),
          ),
        );
      });
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: FadeTransition(
          opacity: _animation,
          child: Image.asset('assets/icon.png', width: 400, height: 400, filterQuality: FilterQuality.high),
        ),
      ),
    );
  }
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});
  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  Identity? _identity;
  String? _mnemonic;

  void _onIdentityGenerated(Identity id, String mnemonic) {
    setState(() {
      _identity = id;
      _mnemonic = mnemonic;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_identity == null) {
      return IdentityView(onGenerated: _onIdentityGenerated);
    } else {
      return DashboardView(identity: _identity!, mnemonic: _mnemonic!);
    }
  }
}

/// ---------------------------------------------------------
/// IDENTITY VIEW
/// ---------------------------------------------------------
class IdentityView extends StatefulWidget {
  final Function(Identity, String) onGenerated;
  const IdentityView({super.key, required this.onGenerated});

  @override
  State<IdentityView> createState() => _IdentityViewState();
}

class _IdentityViewState extends State<IdentityView> {
  bool _isGenerating = false;
  String? _mnemonic;
  String? _onion;
  String? _error;
  Identity? _identity;

  Future<void> _generate() async {
    setState(() {
      _isGenerating = true;
      _error = null;
    });
    
    // Offload to event loop to avoid UI freeze
    await Future.delayed(const Duration(milliseconds: 100));
    try {
      final mnemonic = Identity.generateMnemonic();
      final id = await Identity.fromMnemonic(mnemonic);
      
      // Write keys to local dir
      final dir = '${Directory.current.path}/data/hidden_service';
      await id.writeTorKeys(dir);

      setState(() {
        _mnemonic = mnemonic;
        _onion = id.onionAddress;
        _identity = id;
        _isGenerating = false;
      });
    } catch (e) {
      print(e);
      setState(() {
        _error = e.toString();
        _isGenerating = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Container(
          width: 500,
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            border: Border.all(color: Colors.white24, width: 1),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('GHOST', style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, letterSpacing: 4, color: Colors.white)),
              const SizedBox(height: 10),
              const Text('SYSTEM IDENTITY MODULE', style: TextStyle(color: Colors.white54, letterSpacing: 1)),
              const SizedBox(height: 30),
              
              if (_error != null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  color: Colors.red.withAlpha(50),
                  child: SelectableText('Error: $_error', style: const TextStyle(color: Colors.redAccent)),
                ),
                const SizedBox(height: 20),
              ],
              
              if (_mnemonic != null && _identity != null) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  width: double.infinity,
                  decoration: BoxDecoration(color: Colors.black, border: Border.all(color: Colors.white12)),
                  child: Column(
                    children: [
                      const Text('MNEMONIC SEED', style: TextStyle(color: Colors.white54, fontSize: 10)),
                      const SizedBox(height: 8),
                      SelectableText(_mnemonic!, style: const TextStyle(height: 1.5, color: Colors.white), textAlign: TextAlign.center),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(16),
                  width: double.infinity,
                  decoration: BoxDecoration(color: Colors.black, border: Border.all(color: Colors.white12)),
                  child: Column(
                    children: [
                      const Text('TOR IDENTITY', style: TextStyle(color: Colors.white54, fontSize: 10)),
                      const SizedBox(height: 8),
                      SelectableText('$_onion', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
                    ],
                  ),
                ),
                const SizedBox(height: 30),
                ElevatedButton(
                  onPressed: () => widget.onGenerated(_identity!, _mnemonic!),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
                  ),
                  child: const Text('INITIALIZE SYSTEM', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 2)),
                )
              ] else ...[
                _isGenerating 
                  ? const CircularProgressIndicator(color: Colors.white)
                  : OutlinedButton(
                      onPressed: _generate,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 20),
                      ),
                      child: const Text('GENERATE ID', style: TextStyle(letterSpacing: 2)),
                    )
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// ---------------------------------------------------------
/// DASHBOARD VIEW (Scanner / Beacon)
/// ---------------------------------------------------------
class DashboardView extends StatefulWidget {
  final Identity identity;
  final String mnemonic;
  const DashboardView({super.key, required this.identity, required this.mnemonic});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> with WindowListener {
  int _tabIndex = 0; // 0 = Scanner, 1 = Beacon
  late TorManager _torManager;
  ScannerMode? _scanner;
  BeaconMode? _beacon;

  // State
  int _bootstrapProgress = 0;
  bool _torRunning = false;
  bool _scannerActive = false;
  bool _beaconConnected = false;
  int _peerCount = 0;

  final List<String> _chatLines = [];
  final TextEditingController _msgController = TextEditingController();
  final TextEditingController _onionController = TextEditingController();

  @override
  void initState() {
    super.initState();
    windowManager.addListener(this);
    windowManager.setPreventClose(true);
    _torManager = TorManager('${Directory.current.path}/data');
    _torManager.onBootstrap.listen((progress) {
      if (!mounted) return;
      setState(() => _bootstrapProgress = progress);
      if (progress == 100) {
        setState(() => _torRunning = true);
      }
    });
  }

  @override
  void dispose() {
    windowManager.removeListener(this);
    _torManager.stop();
    _scanner?.stop();
    _beacon?.disconnect();
    super.dispose();
  }

  @override
  void onWindowClose() async {
    // Graceful shutdown before closing
    await _torManager.stop();
    await _scanner?.stop();
    await _beacon?.disconnect();
    await windowManager.destroy();
  }

  void _addChatLine(String line) {
    setState(() {
      _chatLines.add(line);
    });
  }

  // --- SCANNER LOGIC ---
  Future<void> _startScanner() async {
    setState(() {
      _bootstrapProgress = 0;
      _torRunning = false;
      _scannerActive = true;
      _chatLines.clear();
      _addChatLine('[SYS] SCANNER ACTIVE. PORT 3005.');
    });

    _scanner = ScannerMode(
      port: 3005,
      onMessageReceived: (msg, from) {
        _addChatLine('[PEER] $msg');
      },
      onPeerCountChanged: (count) {
        setState(() => _peerCount = count);
        _addChatLine('[SYS] CONNECTION DETECTED. PEERS: $count');
      }
    );
    await _scanner!.start();

    _addChatLine('[SYS] HOSTING APP SERVER ON TOR...');
    final hsDir = '${Directory.current.path}/data/hidden_service';
    await widget.identity.writeTorKeys(hsDir);
    final torrc = await _torManager.writeScannerConfig(hsDir, 80, 3005);
    await _torManager.start(torrc);
  }

  Future<void> _stopScanner() async {
    await _torManager.stop();
    await _scanner?.stop();
    _scanner = null;
    setState(() {
      _scannerActive = false;
      _torRunning = false;
      _peerCount = 0;
      _addChatLine('[SYS] SCANNER TERMINATED.');
    });
  }

  // --- BEACON LOGIC ---
  Future<void> _startBeacon() async {
    final input = _onionController.text.trim();
    if (input.isEmpty) return;

    String targetOnion = input;

    setState(() {
      _bootstrapProgress = 0;
      _torRunning = false;
      _chatLines.clear();
      _addChatLine('[SYS] INITIATING BEACON CLIENT...');
    });

    // If input has spaces, assume it is a 24-word phrase and derive the onion address
    if (input.contains(' ')) {
      try {
        _addChatLine('[SYS] DERIVING TARGET FROM MNEMONIC...');
        final targetIdentity = await Identity.fromMnemonic(input);
        targetOnion = targetIdentity.onionAddress;
        _addChatLine('[SYS] TARGET IDENTIFIED: $targetOnion');
      } catch (e) {
        _addChatLine('[ERR] INVALID MNEMONIC SEED.');
        return;
      }
    } else if (!targetOnion.endsWith('.onion')) {
      _addChatLine('[ERR] INVALID IDENTIFIER. MUST BE MNEMONIC OR .ONION.');
      return;
    }

    final torrc = await _torManager.writeBeaconConfig(9050, 9051);
    await _torManager.start(torrc);

    _addChatLine('[SYS] AWAITING TOR NETWORK...');
    
    // Wait for Tor 100%
    while (!_torRunning) {
      await Future.delayed(const Duration(milliseconds: 500));
    }

    _addChatLine('[SYS] PINGING SERVER: $targetOnion');
    _beacon = BeaconMode(
      torSocksPort: 9050,
      onMessageReceived: (msg, from) {
        _addChatLine('[SCANNER] $msg');
      },
      onConnectionStatusChanged: (connected) {
        if (!mounted) return;
        setState(() => _beaconConnected = connected);
        if (connected) {
          _addChatLine('[SYS] UPLINK ESTABLISHED.');
        } else {
          _addChatLine('[SYS] UPLINK SEVERED.');
        }
      }
    );

    try {
      await _beacon!.connect(targetOnion);
    } catch (e) {
      _addChatLine('[ERR] CONNECTION FAILED: $e');
    }
  }

  Future<void> _stopBeacon() async {
    await _beacon?.disconnect();
    await _torManager.stop();
    _beacon = null;
    setState(() {
      _torRunning = false;
      _beaconConnected = false;
      _addChatLine('[SYS] BEACON TERMINATED.');
    });
  }

  void _sendMessage() {
    final text = _msgController.text.trim();
    if (text.isEmpty) return;

    if (_tabIndex == 0) {
      if (!_scannerActive) {
        _addChatLine('[SYS] ERR: START SCANNER BEFORE TRANSMITTING.');
        return;
      }
      _scanner?.broadcastMessage(text);
      _addChatLine('[YOU] $text');
      _msgController.clear();
    } else if (_tabIndex == 1) {
      if (!_beaconConnected) {
        _addChatLine('[SYS] ERR: ESTABLISH UPLINK BEFORE TRANSMITTING.');
        return;
      }
      _beacon?.sendMessage(text);
      _addChatLine('[YOU] $text');
      _msgController.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('GHOST', style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 4, color: Colors.white)),
        backgroundColor: Colors.black,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(color: Colors.white24, height: 1),
        ),
      ),
      body: Row(
        children: [
          // SIDEBAR
          Container(
            width: 320,
            color: const Color(0xFF090909),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('MNEMONIC', style: TextStyle(color: Colors.white54, fontSize: 10, letterSpacing: 1)),
                const SizedBox(height: 5),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(border: Border.all(color: Colors.white12)),
                  child: SelectableText(widget.mnemonic, style: const TextStyle(color: Colors.white, fontSize: 12)),
                ),
                const SizedBox(height: 15),
                const Text('TOR IDENTITY', style: TextStyle(color: Colors.white54, fontSize: 10, letterSpacing: 1)),
                const SizedBox(height: 5),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(border: Border.all(color: Colors.white12)),
                  child: SelectableText(widget.identity.onionAddress, style: const TextStyle(color: Colors.white, fontSize: 12)),
                ),
                const SizedBox(height: 30),
                
                // TABS
                Row(
                  children: [
                    Expanded(child: _buildTabButton('SCANNER', 0)),
                    const SizedBox(width: 10),
                    Expanded(child: _buildTabButton('BEACON', 1)),
                  ],
                ),
                const SizedBox(height: 20),

                // CONTROLS
                if (_tabIndex == 0) ...[
                  const Text("HOST THE APP SERVER.", style: TextStyle(fontSize: 10, color: Colors.white54, letterSpacing: 1)),
                  const Spacer(),
                  if (_scannerActive) ...[
                    Text("STATUS: ${_torRunning ? 'LIVE' : 'BOOTSTRAPPING $_bootstrapProgress%'}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 5),
                    Text("PEERS: $_peerCount", style: const TextStyle(color: Colors.white70)),
                    const SizedBox(height: 20),
                    OutlinedButton(
                      onPressed: _stopScanner,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.black,
                        backgroundColor: Colors.white,
                        padding: const EdgeInsets.all(20),
                      ),
                      child: const Text('STOP', style: TextStyle(letterSpacing: 2)),
                    )
                  ] else ...[
                    ElevatedButton(
                      onPressed: _startScanner,
                      style: ElevatedButton.styleFrom(padding: const EdgeInsets.all(20)),
                      child: const Text('SCAN', style: TextStyle(letterSpacing: 2)),
                    )
                  ]
                ] else ...[
                  const Text("CONNECT TO A HOST IDENTIFIER.", style: TextStyle(fontSize: 10, color: Colors.white54, letterSpacing: 1)),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _onionController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'TARGET 24-WORD PHRASE OR .ONION',
                      labelStyle: TextStyle(fontSize: 10, letterSpacing: 1),
                      border: OutlineInputBorder(borderRadius: BorderRadius.zero),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: Colors.white24)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: Colors.white)),
                    ),
                    enabled: !_beaconConnected && !_torRunning,
                  ),
                  const Spacer(),
                  if (_torRunning || _beaconConnected) ...[
                    Text("STATUS: ${_beaconConnected ? 'CONNECTED' : 'BOOTSTRAPPING $_bootstrapProgress%'}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 20),
                    OutlinedButton(
                      onPressed: _stopBeacon,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.black,
                        backgroundColor: Colors.white,
                        padding: const EdgeInsets.all(20),
                      ),
                      child: const Text('SEVER', style: TextStyle(letterSpacing: 2)),
                    )
                  ] else ...[
                    ElevatedButton(
                      onPressed: _startBeacon,
                      style: ElevatedButton.styleFrom(padding: const EdgeInsets.all(20)),
                      child: const Text('PING TARGET', style: TextStyle(letterSpacing: 2)),
                    )
                  ]
                ],
              ],
            ),
          ),
          Container(width: 1, color: Colors.white24),
          
          // CHAT AREA
          Expanded(
            child: Container(
              color: Colors.black,
              child: Column(
                children: [
                  Expanded(
                    child: Stack(
                      children: [
                        Center(
                          child: Opacity(
                            opacity: 0.05,
                            child: Image.asset('assets/icon.png', width: 300, height: 300, filterQuality: FilterQuality.high),
                          ),
                        ),
                        ListView.builder(
                          padding: const EdgeInsets.all(20),
                          itemCount: _chatLines.length,
                          itemBuilder: (context, index) {
                            return Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: SelectableText(_chatLines[index], style: const TextStyle(fontSize: 14)),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  Container(height: 1, color: Colors.white24),
                  Container(
                    padding: const EdgeInsets.all(16),
                    color: const Color(0xFF090909),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _msgController,
                            decoration: const InputDecoration(
                              hintText: 'TRANSMIT...',
                              hintStyle: TextStyle(letterSpacing: 2, fontSize: 12),
                              border: InputBorder.none,
                            ),
                            onSubmitted: (_) => _sendMessage(),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.send, color: Colors.white),
                          onPressed: _sendMessage,
                        )
                      ],
                    ),
                  )
                ],
              ),
            ),
          )
        ],
      ),
    );
  }

  Widget _buildTabButton(String label, int index) {
    final isSelected = _tabIndex == index;
    return GestureDetector(
      onTap: () {
        if (!_scannerActive && !_torRunning && !_beaconConnected) {
          setState(() => _tabIndex = index);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? Colors.white : Colors.transparent,
          border: Border.all(color: Colors.white),
        ),
        child: Center(
          child: Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              letterSpacing: 1,
              color: isSelected ? Colors.black : Colors.white54,
            ),
          ),
        ),
      ),
    );
  }
}
