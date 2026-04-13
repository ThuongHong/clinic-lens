import 'dart:convert';

import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';
import '../services/backend_api.dart';
import '../widgets/body_scene_panel.dart';

class HomeView extends StatefulWidget {
  const HomeView({super.key});

  @override
  State<HomeView> createState() => _HomeViewState();
}

class _HomeViewState extends State<HomeView> {
  late final TextEditingController _baseUrlController;
  late final TextEditingController _fileUrlController;
  late final BackendApi _api;

  String _status = 'Idle';
  LabAnalysis _analysis = const LabAnalysis(
    status: 'success',
    analysisDate: '2026-04-13',
    results: <LabResult>[],
  );
  final List<String> _streamLines = <String>[];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _baseUrlController = TextEditingController(text: 'http://localhost:9000');
    _fileUrlController = TextEditingController(text: 'https://example-bucket.oss-cn-hangzhou.aliyuncs.com/sample-lab.pdf');
    _api = BackendApi(baseUrl: _baseUrlController.text.trim());
  }

  @override
  void dispose() {
    _baseUrlController.dispose();
    _fileUrlController.dispose();
    _api.dispose();
    super.dispose();
  }

  void _refreshApiClient() {
    _api.dispose();
  }

  Future<void> _loadMockData() async {
    const sampleJson = '''
    {
      "status": "success",
      "analysis_date": "2026-04-13",
      "results": [
        {
          "indicator_name": "Creatinine",
          "value": "1.8",
          "unit": "mg/dL",
          "reference_range": "0.7 - 1.2",
          "organ_id": "kidneys",
          "severity": "abnormal_high",
          "patient_advice": "Uống đủ nước, giảm đồ mặn và theo dõi lại chức năng thận."
        },
        {
          "indicator_name": "AST (SGOT)",
          "value": "25",
          "unit": "U/L",
          "reference_range": "< 40",
          "organ_id": "liver",
          "severity": "normal",
          "patient_advice": "Chỉ số ổn định, tiếp tục duy trì lối sống lành mạnh."
        }
      ]
    }
    ''';

    setState(() {
      _analysis = LabAnalysis.fromJson(jsonDecode(sampleJson) as Map<String, dynamic>);
      _status = 'Loaded mock data';
      _streamLines
        ..clear()
        ..add('Mock analysis loaded from local JSON.');
    });
  }

  Future<void> _runAnalysis() async {
    setState(() {
      _busy = true;
      _status = 'Starting analysis stream...';
      _streamLines.clear();
    });

    final api = BackendApi(baseUrl: _baseUrlController.text.trim());

    try {
      await for (final event in api.streamAnalysis(_fileUrlController.text.trim())) {
        setState(() {
          _streamLines.add('[${event.event}] ${event.data}');
          _status = 'Streaming ${event.event}';
        });

        if (event.event == 'message') {
          try {
            final payload = event.asJson();
            if (payload['status'] != null && payload['results'] is List) {
              _analysis = LabAnalysis.fromJson(payload);
            }
          } catch (_) {
            // The backend may send partial SSE chunks; keep streaming text visible.
          }
        }
      }
    } catch (error) {
      setState(() {
        _status = 'Analysis failed';
        _streamLines.add('Error: $error');
      });
    } finally {
      setState(() {
        _busy = false;
      });
      api.dispose();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final highlightedOrgans = _analysis.results;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF07111F), Color(0xFF0B2341), Color(0xFF07111F)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Smart Labs Analyzer',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.8,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'SCaffold member 1 + member 3: STS, signed OSS URLs, SSE stream, and organ highlighting.',
                  style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
                ),
                const SizedBox(height: 20),
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final isWide = constraints.maxWidth >= 1000;

                      final scenePanel = BodyScenePanel(highlightedOrgans: highlightedOrgans);
                      final controlPanel = _ControlPanel(
                        baseUrlController: _baseUrlController,
                        fileUrlController: _fileUrlController,
                        busy: _busy,
                        status: _status,
                        onLoadMock: _loadMockData,
                        onAnalyze: _runAnalysis,
                        streamLines: _streamLines,
                      );

                      if (isWide) {
                        return Row(
                          children: [
                            Expanded(child: scenePanel),
                            const SizedBox(width: 20),
                            SizedBox(width: 420, child: controlPanel),
                          ],
                        );
                      }

                      return Column(
                        children: [
                          Expanded(child: scenePanel),
                          const SizedBox(height: 20),
                          SizedBox(height: 360, child: controlPanel),
                        ],
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ControlPanel extends StatelessWidget {
  const _ControlPanel({
    required this.baseUrlController,
    required this.fileUrlController,
    required this.busy,
    required this.status,
    required this.onLoadMock,
    required this.onAnalyze,
    required this.streamLines,
  });

  final TextEditingController baseUrlController;
  final TextEditingController fileUrlController;
  final bool busy;
  final String status;
  final Future<void> Function() onLoadMock;
  final Future<void> Function() onAnalyze;
  final List<String> streamLines;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF0B1729).withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Integration control',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 12),
          _Field(
            controller: baseUrlController,
            label: 'Backend base URL',
            hintText: 'http://localhost:9000',
          ),
          const SizedBox(height: 12),
          _Field(
            controller: fileUrlController,
            label: 'OSS file URL',
            hintText: 'https://bucket.oss-region.aliyuncs.com/file.pdf',
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: busy ? null : onLoadMock,
                  child: const Text('Load mock JSON'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.tonal(
                  onPressed: busy ? null : onAnalyze,
                  child: Text(busy ? 'Streaming...' : 'Analyze'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            'Status: $status',
            style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.24),
                borderRadius: BorderRadius.circular(20),
              ),
              child: ListView.separated(
                itemCount: streamLines.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (context, index) {
                  final line = streamLines[index];
                  return Text(
                    line,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: Colors.white.withValues(alpha: 0.86),
                      height: 1.4,
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.controller, required this.label, required this.hintText});

  final TextEditingController controller;
  final String label;
  final String hintText;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: theme.textTheme.labelLarge?.copyWith(color: Colors.white70)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: hintText,
            hintStyle: const TextStyle(color: Colors.white38),
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.05),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(16),
              borderSide: BorderSide.none,
            ),
          ),
        ),
      ],
    );
  }
}
