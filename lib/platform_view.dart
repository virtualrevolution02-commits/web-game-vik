import 'package:flutter/material.dart';
import 'platform_view_stub.dart'
    if (dart.library.js_interop) 'platform_view_web.dart'
    if (dart.library.io) 'platform_view_mobile.dart';

abstract class PlatformView extends StatelessWidget {
  const PlatformView({super.key});
  
  static Widget create(String src, void Function(dynamic) onMessage) {
    return createPlatformView(src, onMessage);
  }
}
