import 'package:flutter/material.dart';
import 'platform_view.dart';

void main() {
  runApp(const IsometricDriftApp());
}

class IsometricDriftApp extends StatelessWidget {
  const IsometricDriftApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Isometric Drift',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        useMaterial3: true,
        fontFamily: 'sans-serif',
      ),
      home: const GameShell(),
    );
  }
}

class GameShell extends StatefulWidget {
  const GameShell({super.key});

  @override
  State<GameShell> createState() => _GameShellState();
}

class _GameShellState extends State<GameShell> with TickerProviderStateMixin {
  bool _gameStarted = false;
  int _speed = 0;
  bool _isDrifting = false;
  late AnimationController _titleFadeController;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();

    _titleFadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);
  }

  void _handleMessage(dynamic dartData) {
    if (dartData is Map) {
      if (dartData['type'] == 'gameStarted') {
        setState(() => _gameStarted = true);
        _titleFadeController.forward();
      } else if (dartData['type'] == 'gameState') {
        setState(() {
          _speed = (dartData['speed'] as num?)?.toInt() ?? 0;
          _isDrifting = dartData['drifting'] == true;
        });
      }
    }
  }

  @override
  void dispose() {
    _titleFadeController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // Platform-agnostic game view
          Positioned.fill(
            child: PlatformView.create('game.html', _handleMessage),
          ),

          // Title overlay (visible before game starts)
          if (!_gameStarted) Positioned.fill(child: _buildTitleOverlay()),

          // HUD overlay (visible during gameplay)
          if (_gameStarted)
            Positioned(
              top: 20,
              right: 24,
              child: FadeTransition(
                opacity: _titleFadeController,
                child: _buildHUD(),
              ),
            ),

          // Drift indicator
          if (_gameStarted && _isDrifting)
            Positioned(
              bottom: 60,
              left: 0,
              right: 0,
              child: Center(
                child: AnimatedBuilder(
                  animation: _pulseController,
                  builder: (context, child) {
                    return Opacity(
                      opacity: 0.5 + _pulseController.value * 0.5,
                      child: child,
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color.fromRGBO(255, 255, 255, 0.15),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(
                        color: const Color.fromRGBO(255, 255, 255, 0.3),
                        width: 1,
                      ),
                    ),
                    child: const Text(
                      'DRIFT',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 8,
                      ),
                    ),
                  ),
                ),
              ),
            ),

          // Control hints (bottom left)
          Positioned(bottom: 20, left: 24, child: _buildControlHints()),
        ],
      ),
    );
  }

  Widget _buildTitleOverlay() {
    return Container(
      color: Colors.transparent,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(height: 40),
          const Text(
            'Start driving',
            style: TextStyle(
              color: Colors.white,
              fontSize: 42,
              fontWeight: FontWeight.w300,
              letterSpacing: 2,
              shadows: [
                Shadow(blurRadius: 20, color: Colors.black26, offset: Offset(0, 4)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              return Opacity(
                opacity: 0.4 + _pulseController.value * 0.6,
                child: child,
              );
            },
            child: const Text(
              'Use the arrow keys',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 16,
                fontWeight: FontWeight.w400,
                letterSpacing: 3,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHUD() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: const Color.fromRGBO(0, 0, 0, 0.2),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color.fromRGBO(255, 255, 255, 0.1),
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.speed, color: Colors.white54, size: 20),
          const SizedBox(width: 8),
          Text(
            '$_speed',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w700,
              letterSpacing: 2,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(width: 4),
          const Text(
            'km/h',
            style: TextStyle(
              color: Colors.white38,
              fontSize: 12,
              fontWeight: FontWeight.w400,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildControlHints() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color.fromRGBO(0, 0, 0, 0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          _controlRow('↑', 'Accelerate'),
          const SizedBox(height: 4),
          _controlRow('↓', 'Brake'),
          const SizedBox(height: 4),
          _controlRow('← →', 'Steer'),
          const SizedBox(height: 4),
          _controlRow('Space', 'Handbrake'),
        ],
      ),
    );
  }

  Widget _controlRow(String key, String action) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: const Color.fromRGBO(255, 255, 255, 0.15),
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: Colors.white24),
          ),
          child: Text(
            key,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text(
          action,
          style: const TextStyle(color: Colors.white38, fontSize: 11),
        ),
      ],
    );
  }
}
