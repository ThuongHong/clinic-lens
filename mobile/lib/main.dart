import 'package:flutter/material.dart';

import 'screens/analysis_screen.dart';

void main() {
  runApp(const SmartLabsAnalyzerApp());
}

class SmartLabsAnalyzerApp extends StatelessWidget {
  const SmartLabsAnalyzerApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seedColor = Color(0xFFFF007F);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Smart Labs Analyzer',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: seedColor,
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFFCFCFF),
        textTheme: const TextTheme(
          headlineMedium: TextStyle(letterSpacing: -0.8, fontWeight: FontWeight.bold, fontFamily: 'sans-serif'),
          titleLarge: TextStyle(letterSpacing: -0.5, fontWeight: FontWeight.bold),
          titleMedium: TextStyle(letterSpacing: -0.3, fontWeight: FontWeight.w700),
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
