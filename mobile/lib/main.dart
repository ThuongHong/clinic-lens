import 'package:flutter/material.dart';

import 'screens/analysis_screen.dart';

void main() {
  runApp(const SmartLabsAnalyzerApp());
}

class SmartLabsAnalyzerApp extends StatelessWidget {
  const SmartLabsAnalyzerApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seedColor = Color(0xFF0F766E);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Smart Labs Analyzer',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: seedColor,
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF07111F),
        useMaterial3: true,
      ),
      home: const AnalysisScreen(),
    );
  }
}
