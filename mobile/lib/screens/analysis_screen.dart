import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';
import '../services/backend_api.dart';
import '../services/file_upload_service.dart';
import '../widgets/analysis_history_panel.dart';
import '../widgets/analysis_results_panel.dart';
import '../widgets/analysis_summary_panel.dart';
import '../widgets/body_scene_panel.dart';
import '../widgets/loading_panel.dart';
import '../widgets/stream_log_panel.dart';
import '../widgets/streaming_transcript_panel.dart';
import '../widgets/upload_section.dart';

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
  List<AnalysisHistoryEntry> _history = const <AnalysisHistoryEntry>[];
  final List<String> _streamLines = <String>[];
  String _streamedResponse = '';
  String? _selectedHistoryId;
  String? _historyError;
  bool _busy = false;
  bool _historyLoading = false;

  @override
  void initState() {
    super.initState();
    _backendApi = BackendApi(baseUrl: resolveBackendBaseUrl());
    _uploadService = FileUploadService();
    _streamLines.add('Backend: ${_backendApi.baseUrl}');
    _loadHistory();
  }

  @override
  void dispose() {
    _backendApi.dispose();
    _uploadService.dispose();
    super.dispose();
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const <String>['pdf', 'png', 'jpg', 'jpeg', 'webp'],
    );

    if (result == null || result.files.isEmpty) {
      return;
    }

    final pickedFile = result.files.single;
    final filePath = pickedFile.path;

    if (filePath == null || filePath.isEmpty) {
      setState(() {
        _status = 'Selected file has no readable path on this platform.';
      });
      return;
    }

    setState(() {
      _selectedFile = File(filePath);
      _analysis = null;
      _streamedResponse = '';
      _streamLines
        ..clear()
        ..add('✓ Selected file: ${pickedFile.name}');
      _status = 'Ready to analyze ${pickedFile.name}';
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
      _analysis = null;
      _streamedResponse = '';
      _streamLines.clear();
    });

    try {
      final isDesktopLocalPdf = Platform.isLinux &&
          _selectedFile != null &&
          _selectedFile!.path.toLowerCase().endsWith('.pdf');

      if (isDesktopLocalPdf) {
        _streamLines.add('Step 1: Running local PDF pipeline on demo machine');
        setState(() => _status = 'Running local PDF pipeline...');

        await for (final event in _backendApi.streamAnalysis(
          localFilePath: _selectedFile!.path,
        )) {
          if (!mounted) {
            break;
          }

          _handleStreamEvent(event);
        }

        await _loadHistory(selectedHistoryId: _selectedHistoryId);

        setState(() {
          _status = _analysis != null ? 'Analysis complete' : 'Stream ended';
          _streamLines.add('✓ Local PDF analysis finished');
        });
        return;
      }

      _streamLines.add('Step 1: Requesting STS token from backend');

      final stsResponse = await _backendApi.fetchStsToken();
      final accessKeyId = stsResponse['AccessKeyId'] as String?;
      final accessKeySecret = stsResponse['AccessKeySecret'] as String?;
      final securityToken = stsResponse['SecurityToken'] as String?;
      final bucket = stsResponse['Bucket'] as String?;
      final region = stsResponse['Region'] as String?;

      if (accessKeyId == null ||
          accessKeySecret == null ||
          securityToken == null ||
          bucket == null ||
          region == null) {
        throw StateError('Invalid STS response');
      }

      setState(() => _streamLines.add('✓ STS token acquired'));
      setState(() => _status = 'Uploading file to OSS...');

      _streamLines.add('Step 2: Uploading file directly to Alibaba OSS');

      final uploadResult = await _uploadService.uploadFileToOss(
        file: _selectedFile!,
        accessKeyId: accessKeyId,
        accessKeySecret: accessKeySecret,
        securityToken: securityToken,
        bucket: bucket,
        region: region,
      );

      setState(() {
        _streamLines.add('✓ File uploaded to OSS');
        _streamLines.add('Object key: ${uploadResult.objectKey}');
      });
      setState(() => _status = 'Starting analysis stream...');

      _streamLines.add('Step 3: Streaming analysis from Qwen3.6-Plus');

      await for (final event
          in _backendApi.streamAnalysis(objectKey: uploadResult.objectKey)) {
        if (!mounted) {
          break;
        }

        _handleStreamEvent(event);
      }

      await _loadHistory(selectedHistoryId: _selectedHistoryId);

      setState(() {
        _status = _analysis != null ? 'Analysis complete' : 'Stream ended';
        _streamLines.add('✓ Stream ended successfully');
      });
    } catch (error) {
      setState(() {
        _status = 'Error occurred';
        _streamLines.add('❌ Error: $error');
      });
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _loadHistory({String? selectedHistoryId}) async {
    setState(() {
      _historyLoading = true;
      _historyError = null;
    });

    try {
      final history = await _backendApi.fetchAnalysisHistory();
      if (!mounted) {
        return;
      }

      setState(() {
        _history = history;
        _historyLoading = false;
        _historyError = null;

        final preferredId = selectedHistoryId ?? _selectedHistoryId;
        if (preferredId != null &&
            history.any((entry) => entry.id == preferredId)) {
          _selectedHistoryId = preferredId;
        } else if (history.isNotEmpty) {
          _selectedHistoryId ??= history.first.id;
        }

        if (_analysis == null && history.isNotEmpty) {
          _analysis = history.first.analysis;
        }
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _historyLoading = false;
        _historyError = 'Could not load saved analyses: $error';
      });
    }
  }

  void _handleStreamEvent(SseEvent event) {
    switch (event.event) {
      case 'ready':
        setState(() {
          _status = 'Connected to analysis stream';
          _streamLines.add('✓ SSE connection opened');
        });
        return;
      case 'signed_url_ready':
        final payload = _tryParseEventJson(event);
        final objectKey = payload?['object_key']?.toString() ?? 'unknown';
        setState(() {
          _status = 'Signed URL ready';
          _streamLines.add('✓ Signed private OSS URL for $objectKey');
        });
        return;
      case 'token':
        final payload = _tryParseEventJson(event);
        final token = payload?['text']?.toString() ?? '';

        if (token.isEmpty) {
          return;
        }

        setState(() {
          _streamedResponse += token;
          _status = 'Streaming AI response...';
        });
        return;
      case 'post_process':
        final payload = _tryParseEventJson(event);
        final message =
            payload?['message']?.toString() ?? 'Post-processing analysis...';
        setState(() {
          _status = message;
          _streamLines.add('• $message');
        });
        return;
      case 'result':
        final payload = _tryParseEventJson(event);
        if (payload == null) {
          return;
        }
        setState(() {
          _analysis = LabAnalysis.fromJson(payload);
          _selectedHistoryId =
              payload['history_id']?.toString() ?? _selectedHistoryId;
          _status = _analysis?.status == 'error'
              ? (_analysis?.errorMessage ??
                  'Analysis returned an error payload')
              : 'Structured lab analysis received';
          _streamLines.add('✓ Parsed final JSON result');
          if (_analysis?.hasAdvice == true) {
            _streamLines.add('✓ Analysis advice attached to analysis');
          }
        });
        return;
      case 'done':
        setState(() {
          _status = 'Analysis complete';
        });
        return;
      case 'warning':
        final payload = _tryParseEventJson(event);
        final message = payload?['message']?.toString() ?? event.data;
        setState(() {
          _streamLines.add('Warning: $message');
        });
        return;
      case 'error':
        final payload = _tryParseEventJson(event);
        final message = payload?['message']?.toString() ?? event.data;
        throw StateError(message);
      default:
        final preview = event.data.length > 120
            ? '${event.data.substring(0, 120)}...'
            : event.data;
        setState(() {
          _streamLines.add('[${event.event}] $preview');
        });
    }
  }

  Map<String, dynamic>? _tryParseEventJson(SseEvent event) {
    try {
      return event.asJson();
    } catch (_) {
      return null;
    }
  }

  void _selectHistoryEntry(AnalysisHistoryEntry entry) {
    setState(() {
      _analysis = entry.analysis;
      _selectedHistoryId = entry.id;
      _status = 'Viewing saved analysis from ${entry.analysis.analysisDate}';
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final highlightedOrgans = _analysis?.results ?? const <LabResult>[];

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          color: Color(0xFFF9FAFF),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFFFFFFFF),
              Color(0xFFF4F6FC),
              Color(0xFFE9EEFA),
            ],
            stops: [0.0, 0.4, 1.0],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Header
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Smart Labs',
                      style: theme.textTheme.headlineMedium
                          ?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xFF0F172A), letterSpacing: -1.0),
                    ),
                    Text(
                      'AI Lab Analysis',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: const Color(0xFF64748B), fontWeight: FontWeight.w500),
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
                    final horizontalPadding =
                        constraints.maxWidth >= 720 ? 24.0 : 16.0;

                    final rightColumn = Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        UploadSection(
                          selectedFile: _selectedFile,
                          busy: _busy,
                          onPickFile: _pickFile,
                          onAnalyze: _runAnalysis,
                        ),
                        const SizedBox(height: 24),
                        if (_analysis != null) ...[
                          AnalysisSummaryPanel(analysis: _analysis!),
                          const SizedBox(height: 24),
                        ],
                        if (_analysis != null)
                          AnalysisResultsPanel(analysis: _analysis!)
                        else if (_busy)
                          LoadingPanel(status: _status)
                        else
                          Container(
                            padding: const EdgeInsets.all(24),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(
                                  color: const Color(0xFFE2E8F0)),
                              boxShadow: const [
                                BoxShadow(
                                  color: Color(0x08000000),
                                  blurRadius: 16,
                                  offset: Offset(0, 4),
                                )
                              ],
                            ),
                            child: Text(
                              'Upload a file to begin analysis',
                              style: theme.textTheme.bodyMedium
                                  ?.copyWith(color: const Color(0xFF64748B), fontWeight: FontWeight.w500),
                            ),
                          ),
                        const SizedBox(height: 24),
                        AnalysisHistoryPanel(
                          entries: _history,
                          selectedHistoryId: _selectedHistoryId,
                          loading: _historyLoading,
                          errorMessage: _historyError,
                          onRefresh: _loadHistory,
                          onSelect: _selectHistoryEntry,
                        ),
                        if (_streamedResponse.isNotEmpty) ...[
                          const SizedBox(height: 24),
                          StreamingTranscriptPanel(content: _streamedResponse),
                        ],
                        if (_streamLines.isNotEmpty) ...[
                          const SizedBox(height: 24),
                          StreamLogPanel(lines: _streamLines),
                        ],
                      ],
                    );

                    return SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(
                          horizontalPadding, 8, horizontalPadding, 24),
                      child: isWide
                          ? Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  flex: 11,
                                  child: BodyScenePanel(
                                      highlightedOrgans: highlightedOrgans),
                                ),
                                const SizedBox(width: 24),
                                Expanded(flex: 9, child: rightColumn),
                              ],
                            )
                          : Column(
                              children: [
                                BodyScenePanel(
                                    highlightedOrgans: highlightedOrgans),
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
      bottomNavigationBar: BottomNavigationBar(
        elevation: 0,
        backgroundColor: Colors.white,
        selectedItemColor: const Color(0xFFFF007F),
        unselectedItemColor: const Color(0xFF94A3B8),
        showSelectedLabels: true,
        showUnselectedLabels: true,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
        unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
        type: BottomNavigationBarType.fixed,
        items: [
          BottomNavigationBarItem(
            icon: Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.all(12),
              decoration: const BoxDecoration(
                color: Color(0xFFFF007F),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.home_filled, color: Colors.white, size: 22),
            ),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.all(12),
              child: const Icon(Icons.show_chart_rounded, size: 24),
            ),
            label: 'Health',
          ),
          BottomNavigationBarItem(
            icon: Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.all(12),
              child: const Icon(Icons.medication_liquid_rounded, size: 24),
            ),
            label: 'Meds',
          ),
          BottomNavigationBarItem(
            icon: Container(
              margin: const EdgeInsets.only(bottom: 4),
              padding: const EdgeInsets.all(12),
              child: const Icon(Icons.card_giftcard_rounded, size: 24),
            ),
            label: 'Rewards',
          ),
        ],
      ),
    );
  }
}
