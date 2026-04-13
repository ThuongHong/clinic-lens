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
          child: Column(
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Smart Labs',
                      style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      'AI Lab Analysis',
                      style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              // Main Content: scrollable
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final isWide = constraints.maxWidth >= 980;
                    final horizontalPadding = constraints.maxWidth >= 720 ? 24.0 : 16.0;

                    final rightColumn = Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _UploadSection(
                          selectedFile: _selectedFile,
                          busy: _busy,
                          onPickFile: _pickFile,
                          onAnalyze: _runAnalysis,
                        ),
                        const SizedBox(height: 24),
                        if (_analysis != null)
                          _ResultsPanel(analysis: _analysis!)
                        else if (_busy)
                          _LoadingPanel(status: _status)
                        else
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xFF0B1729).withValues(alpha: 0.6),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                            ),
                            child: Text(
                              'Upload a file to begin analysis',
                              style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
                            ),
                          ),
                        if (_streamLines.isNotEmpty) ...[
                          const SizedBox(height: 24),
                          StreamLogPanel(lines: _streamLines),
                        ],
                      ],
                    );

                    return SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(horizontalPadding, 8, horizontalPadding, 24),
                      child: isWide
                          ? Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  flex: 11,
                                  child: BodyScenePanel(highlightedOrgans: highlightedOrgans),
                                ),
                                const SizedBox(width: 24),
                                Expanded(flex: 9, child: rightColumn),
                              ],
                            )
                          : Column(
                              children: [
                                BodyScenePanel(highlightedOrgans: highlightedOrgans),
                                const SizedBox(height: 24),
                                rightColumn,
                              ],
                            ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Upload form section
class _UploadSection extends StatelessWidget {
  const _UploadSection({
    required this.selectedFile,
    required this.busy,
    required this.onPickFile,
    required this.onAnalyze,
  });

  final File? selectedFile;
  final bool busy;
  final Future<void> Function() onPickFile;
  final Future<void> Function() onAnalyze;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF0B1729).withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Upload Lab Result',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          // File Status
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: selectedFile != null
                  ? Colors.green.withValues(alpha: 0.1)
                  : Colors.grey.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selectedFile != null
                    ? Colors.green.withValues(alpha: 0.3)
                    : Colors.white.withValues(alpha: 0.1),
              ),
            ),
            child: Row(
              children: [
                Icon(
                  selectedFile != null ? Icons.check_circle : Icons.file_present,
                  color: selectedFile != null ? Colors.green : Colors.white54,
                  size: 20,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    selectedFile != null
                        ? selectedFile!.path.split('/').last
                        : 'No file selected',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: selectedFile != null ? Colors.white : Colors.white54,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Buttons
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: busy ? null : onPickFile,
                  icon: const Icon(Icons.upload_file),
                  label: const Text('Pick File'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: (busy || selectedFile == null) ? null : onAnalyze,
                  child: Text(busy ? 'Analyzing...' : 'Analyze'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Loading state panel
class _LoadingPanel extends StatelessWidget {
  const _LoadingPanel({required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF0B1729).withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          const SizedBox(
            width: 40,
            height: 40,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(height: 12),
          Text(
            status,
            style: theme.textTheme.bodySmall?.copyWith(color: Colors.blue),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

/// Results panel showing analysis
class _ResultsPanel extends StatelessWidget {
  const _ResultsPanel({required this.analysis});

  final LabAnalysis analysis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF0B1729).withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Analysis Results',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 12),
          Text(
            'Date: ${analysis.analysisDate}',
            style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
          ),
          const SizedBox(height: 12),
          // Results list
          for (final result in analysis.results) ...[
            _ResultItem(result: result),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

/// Individual result item
class _ResultItem extends StatelessWidget {
  const _ResultItem({required this.result});

  final LabResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isAbnormal = result.severity != 'normal';
    final color = isAbnormal ? Colors.red : Colors.green;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  result.indicatorName,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  result.severity.replaceAll('_', ' ').toUpperCase(),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: color,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '${result.value} ${result.unit}',
            style: theme.textTheme.bodySmall?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w500,
            ),
          ),
          Text(
            'Ref: ${result.referenceRange}',
            style: theme.textTheme.bodySmall?.copyWith(color: Colors.white60),
          ),
          if (result.patientAdvice.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              result.patientAdvice,
              style: theme.textTheme.bodySmall?.copyWith(color: Colors.white70),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}
