import 'package:flutter_test/flutter_test.dart';
import 'package:smart_labs_analyzer/main.dart';

void main() {
  testWidgets('analysis screen renders core controls', (WidgetTester tester) async {
    await tester.pumpWidget(const SmartLabsAnalyzerApp());

    expect(find.text('Smart Labs'), findsOneWidget);
    expect(find.text('AI Lab Analysis'), findsOneWidget);
    expect(find.text('Pick File'), findsOneWidget);
    expect(find.text('Analyze'), findsOneWidget);
    expect(find.text('Body response map'), findsOneWidget);
  });
}
