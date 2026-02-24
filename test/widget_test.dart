import 'package:flutter_test/flutter_test.dart';
import 'package:isometric_drift/main.dart';

void main() {
  testWidgets('App should render', (WidgetTester tester) async {
    await tester.pumpWidget(const IsometricDriftApp());
    expect(find.text('Start driving'), findsOneWidget);
  });
}
