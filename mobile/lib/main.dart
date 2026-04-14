import 'package:flutter/material.dart';

import 'screens/analysis_screen.dart';

void main() {
  runApp(const SmartLabsAnalyzerApp());
}

class SmartLabsAnalyzerApp extends StatelessWidget {
  const SmartLabsAnalyzerApp({super.key});

  @override
  Widget build(BuildContext context) {
    const accentColor = Color(0xFF4F46E5);
    const surfaceColor = Color(0xFFF0F2F7);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Smart Labs Analyzer',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: accentColor,
          brightness: Brightness.light,
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: surfaceColor,
        canvasColor: surfaceColor,
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(22),
            side: const BorderSide(color: Color(0xFFE3E8F2)),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: accentColor,
            foregroundColor: Colors.white,
            disabledBackgroundColor: const Color(0xFFE5E7EB),
            disabledForegroundColor: const Color(0xFF9CA3AF),
            minimumSize: const Size.fromHeight(48),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            textStyle: const TextStyle(
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
            ),
          ),
        ),
        textTheme: const TextTheme(
          headlineMedium: TextStyle(letterSpacing: -0.8, fontWeight: FontWeight.w800),
          titleLarge: TextStyle(letterSpacing: -0.5, fontWeight: FontWeight.w800),
          titleMedium: TextStyle(letterSpacing: -0.3, fontWeight: FontWeight.w800),
          titleSmall: TextStyle(letterSpacing: -0.2, fontWeight: FontWeight.w700),
          bodyMedium: TextStyle(height: 1.45),
          bodySmall: TextStyle(height: 1.45),
        ),
        useMaterial3: true,
      ),
      home: const AnalysisScreen(),
    );
  }
}
