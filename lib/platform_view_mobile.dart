import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'dart:convert';

Widget createPlatformView(String src, void Function(dynamic) onMessage) {
  return PlatformViewMobile.create(src, onMessage);
}

class PlatformViewMobile extends StatelessWidget {
  final String src;
  final void Function(dynamic) onMessage;

  const PlatformViewMobile({super.key, required this.src, required this.onMessage});

  static Widget create(String src, void Function(dynamic) onMessage) {
    return InAppWebView(
      initialFile: "assets/web/game.html",
      initialSettings: InAppWebViewSettings(
        javaScriptEnabled: true,
        mediaPlaybackRequiresUserGesture: false,
        allowsInlineMediaPlayback: true,
      ),
      onWebViewCreated: (controller) {
        controller.addJavaScriptHandler(
          handlerName: 'flutterHandler',
          callback: (args) {
            onMessage(args[0]);
          },
        );
      },
      onPermissionRequest: (controller, request) async {
        return PermissionResponse(
          resources: request.resources,
          action: PermissionResponseAction.GRANT,
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return create(src, onMessage);
  }
}
