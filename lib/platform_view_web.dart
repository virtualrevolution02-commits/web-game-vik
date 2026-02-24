import 'package:flutter/material.dart';
import 'dart:js_interop';
import 'package:web/web.dart' as web;
import 'dart:ui_web' as ui_web;

Widget createPlatformView(String src, void Function(dynamic) onMessage) {
  return PlatformViewWeb.create(src, onMessage);
}

class PlatformViewWeb extends StatelessWidget {
  final String src;
  final void Function(dynamic) onMessage;

  const PlatformViewWeb({super.key, required this.src, required this.onMessage});

  static Widget create(String src, void Function(dynamic) onMessage) {
    // Register the iframe view
    ui_web.platformViewRegistry.registerViewFactory(
      'game-iframe',
      (int viewId) {
        final iframe = web.HTMLIFrameElement()
          ..src = src
          ..style.border = 'none'
          ..style.width = '100%'
          ..style.height = '100%'
          ..allow = 'autoplay; camera'; // Added camera for hand tracking

        iframe.onLoad.listen((_) {
          iframe.focus();
        });

        return iframe;
      },
    );

    // Listen for postMessage
    web.window.addEventListener(
      'message',
      ((web.MessageEvent event) {
        final data = event.data;
        if (data != null) {
          onMessage(data.dartify());
        }
      }).toJS,
    );

    return const HtmlElementView(viewType: 'game-iframe');
  }

  @override
  Widget build(BuildContext context) {
    return create(src, onMessage);
  }
}
