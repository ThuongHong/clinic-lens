import 'dart:io';

import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';
import '../services/backend_api.dart';
import '../services/file_upload_service.dart';
import '../widgets/body_scene_panel.dart';
import '../widgets/stream_log_panel.dart';

class AnalysisScreen extends StatefulWidget {
  const AnalysisScreen({super.key});

  @override
  State<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends State<AnalysisScreen> {
  late final BackendApi _backendApi;
  late final FileUploadService _uploadService;

  File? _selectedFile;
  String _status = 'Ready';
  LabAnalysis? _analysis;
  final List<String> _streamLines = <String>[];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _backendApi = BackendApi(baseUrl: 'http://localhost:9000');
    _uploadService = FileUploadService(baseUrl: 'http://localhost:9000');
  }

  @override
  void dispose() {
    _backendApi.dispose();
    _uploadService.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    // Simplified file picker demonstration.
    // In production, use the file_picker package: https://pub.dev/packages/file_picker
    setState(() {
      _status = 'File picker not yet implemented. Use file_picker package.';
    });
  }

  Future<void> _runAnalysis() async {
    if (_selectedFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a file first')),
      );
      return;
    }

    setState(() {
      _busy = true;
      _status = 'Getting STS token...';
      _streamLines.clear();
    });

    try {
      _streamLines.add('Step 1: Requesting STS token from backend');

      final stsResponse = await _backendApi.fetchStsToken();
      final accessKeyId = stsResponse['AccessKeyId'] as String?;
      final accessKeySecret = stsResponse['AccessKeySecret'] as String?;
      final securityToken = stsResponse['SecurityToken'] as String?;

      if (accessKeyId == null || accessKeySecret == null || securityToken == null) {
        throw StateError('Invalid STS response');
      }

      setState(() => _streamLines.add('✓ STS token acquired'));
      setState(() => _status = 'Uploading file to OSS...');

      _streamLines.add('Step 2: Uploading file directly to Alibaba OSS');

      final ossUrl = await _uploadService.uploadFileToOss(
        file: _selectedFile!,
        accessKeyId: accessKeyId,
        accessKeySecret: accessKeySecret,
        securityToken: securityToken,
      );

      setState(() => _streamLines.add('✓ File uploaded: $ossUrl'));
      setState(() => _status = 'Starting analysis stream...');

      _streamLines.add('Step 3: Streaming analysis from Qwen3.6-Plus');

      final bufferedJson = StringBuffer();

      await for (final event in _backendApi.streamAnalysis(ossUrl)) {
        setState(() {
          _streamLines.add('[${event.event}] ${event.data.substring(0, (event.data.length > 100 ? 100 : event.data.length))}');
          _status = 'Streaming ${event.event}';
        });

        if (event.event == 'message') {
          try {
            bufferedJson.write(event.data);
            final payload = event.asJson();
            if (payload['status'] != null && payload['results'] is List) {
              setState(() {
                _analysis = LabAnalysis.fromJson(payload);
              });
            }
          } catch (_) {
            // Partial chunks; keep buffering.
          }
        }
      }

      setState(() => _status = 'Analysis complete');
      _streamLines.add('✓ Stream ended successfully');
    } catch (error) {
      setState(() {
        _status = 'Error occurred';
        _streamLines.add('❌ Error: $error');
      });
    } finally {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final highlightedOrgans = _analysis?.results ?? const <LabResult>[];

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
                  'Upload lab results and get instant AI analysis with 3D organ highlighting',
                  style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
                ),
                const SizedBox(height: 20),
                Expanded(
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final isWide = constraints.maxWidth >= 1200;

                      if (isWide) {
                        return Row(
                          children: [
                            Expanded(
                              child: BodyScenePanel(highlightedOrgans: highlightedOrgans),
                            ),
                            const SizedBox(width: 20),
                            SizedBox(
                              width: 480,
                              child: _ControlPanel(
                                selectedFile: _selectedFile,
                                busy: _busy,
                                status: _status,
                                onPickFile: _pickFile,
                                onAnalyze: _runAnalysis,
                                streamLines: _streamLines,
                              ),
                            ),
                          ],
                        );
                      }

                      return Column(
                        children: [
                          Expanded(
                            flex: 2,
                            child: BodyScenePanel(highlightedOrgans: highlightedOrgans),
                          ),
                          const SizedBox(height: 20),
                          Expanded(
                            flex: 1,
                            child: _ControlPanel(
                              selectedFile: _selectedFile,
                              busy: _busy,
                              status: _status,
                              onPickFile: _pickFile,
                              onAnalyze: _runAnalysis,
                              streamLines: _streamLines,
                            ),
                          ),
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
    required this.selectedFile,
    required this.busy,
    required this.status,
    required this.onPickFile,
    required this.onAnalyze,
    required this.streamLines,
  });

  final File? selectedFile;
  final bool busy;
  final String status;
  final Future<void> Function() onPickFile;
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
            'Upload & Analyze',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          if (selectedFile != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.green.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.green.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: Colors.green, size: 20),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      selectedFile!.path.split('/').last,
                      style: theme.textTheme.bodySmall?.copyWith(color: Colors.white),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            )
          else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                'No file selected',
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.grey),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: busy ? null : onPickFile,
            icon: const Icon(Icons.folder_open),
            label: const Text('Pick File'),
          ),
          const SizedBox(height: 8),
          FilledButton.tonal(
            onPressed: (busy || selectedFile == null) ? null : onAnalyze,
            child: Text(busy ? 'Analyzing...' : 'Analyze'),
          ),
          const SizedBox(height: 16),
          Text(
            'Status: $status',
            style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: StreamLogPanel(lines: streamLines),
          ),
        ],
      ),
    );
  }
}
