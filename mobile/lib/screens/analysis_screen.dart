import 'dart:convert';
import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../models/lab_analysis.dart';
import '../services/backend_api.dart';
import '../services/file_upload_service.dart';
import '../widgets/analysis_history_panel.dart';
import '../widgets/analysis_results_panel.dart';
import '../widgets/analysis_summary_panel.dart';
import '../widgets/loading_panel.dart';
import '../widgets/stream_log_panel.dart';
import '../widgets/streaming_transcript_panel.dart';
import '../widgets/upload_section.dart';

class AnalysisScreen extends StatefulWidget {
  const AnalysisScreen({super.key});

  @override
  State<AnalysisScreen> createState() => _AnalysisScreenState();
}

class _AnalysisScreenState extends State<AnalysisScreen>
    with SingleTickerProviderStateMixin {
  late final BackendApi _backendApi;
  late final FileUploadService _uploadService;
  late final TabController _tabController;
  final ScrollController _overallScrollController = ScrollController();
  final GlobalKey _summaryPanelKey = GlobalKey();
  final GlobalKey _resultsPanelKey = GlobalKey();

  File? _selectedFile;
  String _status = 'Ready';
  LabAnalysis? _analysis;
  List<AnalysisHistoryEntry> _history = const <AnalysisHistoryEntry>[];
  final List<String> _streamLines = <String>[];
  String _streamedResponse = '';
  String? _selectedHistoryId;
  String? _focusedOrganId;
  String? _historyError;
  final TextEditingController _chatController = TextEditingController();
  String _chatDraft = '';
  String _chatRawDraft = '';
  final List<_ChatMessage> _chatMessages = <_ChatMessage>[];
  String? _chatConversationId;
  String? _chatError;
  bool _chatBusy = false;
  bool _busy = false;
  bool _historyLoading = false;

  @override
  void initState() {
    super.initState();
    _backendApi = BackendApi(baseUrl: resolveBackendBaseUrl());
    _uploadService = FileUploadService();
    _tabController = TabController(length: 3, vsync: this);
    _streamLines.add('Backend: ${_backendApi.baseUrl}');
    _loadHistory();
  }

  @override
  void dispose() {
    _overallScrollController.dispose();
    _tabController.dispose();
    _chatController.dispose();
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
      _focusedOrganId = null;
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
      _focusedOrganId = null;
      _chatConversationId = null;
      _chatError = null;
      _chatDraft = '';
      _chatRawDraft = '';
      _chatMessages.clear();
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
        _historyError = _formatHistoryLoadError(error);
      });
    }
  }

  String _formatHistoryLoadError(Object error) {
    final rawMessage = error.toString();

    if (rawMessage.contains('Backend unreachable')) {
      return 'Saved analyses are unavailable because the backend is offline. Start the backend and try again.';
    }

    if (rawMessage.contains('Failed to fetch analysis history')) {
      return 'Could not load saved analyses from the backend.';
    }

    return 'Could not load saved analyses: $rawMessage';
  }

  String _formatChatError(Object error) {
    final rawMessage = error.toString();

    if (rawMessage.contains('does not expose /api/chat') ||
        rawMessage.contains('Cannot POST /api/chat')) {
      return 'Backend hien tai chua co route chat (/api/chat). '
          'Hay restart backend bang ./start.sh, sau do thu lai.';
    }

    if (rawMessage.contains('Backend unreachable')) {
      return 'Khong ket noi duoc backend. Kiem tra backend dang chay o cong 9000.';
    }

    return rawMessage;
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
      _focusedOrganId = null;
      _chatConversationId = null;
      _chatError = null;
      _chatDraft = '';
      _chatRawDraft = '';
      _chatMessages.clear();
      _status = 'Viewing saved analysis from ${entry.analysis.analysisDate}';
    });
  }

  String _extractChatDraftText(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) {
      return '';
    }

    if (trimmed.startsWith('{') ||
        trimmed.startsWith('[') ||
        trimmed.contains('"answer_text"') ||
        trimmed.contains('"recommended_actions"') ||
        trimmed.contains('"follow_up_questions"') ||
        trimmed.contains('"seven_day_plan"')) {
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is Map<String, dynamic>) {
          final answer = decoded['answer_text']?.toString().trim() ?? '';
          return answer;
        }
      } catch (_) {
        return '';
      }
    }

    return trimmed;
  }

  Future<void> _sendChatQuestion() async {
    final historyId = _selectedHistoryId;
    final message = _chatController.text.trim();

    if (historyId == null || historyId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select an analysis first.')),
      );
      return;
    }

    if (message.isEmpty) {
      return;
    }

    setState(() {
      _chatBusy = true;
      _chatError = null;
      _chatDraft = '';
      _chatRawDraft = '';
      _chatMessages.add(_ChatMessage(role: _ChatRole.user, text: message));
      _chatMessages.add(const _ChatMessage(role: _ChatRole.assistant, text: 'Dang soan cau tra loi...'));
      _status = 'Smart Labs Chat is generating an answer...';
    });

    try {
      await for (final event in _backendApi.streamChat(
        historyId: historyId,
        message: message,
        conversationId: _chatConversationId,
        language: 'vi',
        detailLevel: 'patient',
      )) {
        if (!mounted) {
          break;
        }

        final payload = _tryParseEventJson(event);

        switch (event.event) {
          case 'stream':
            final token = payload?['text']?.toString() ?? '';
            if (token.isNotEmpty) {
              setState(() {
                _chatRawDraft += token;
                _chatDraft = _extractChatDraftText(_chatRawDraft);
                if (_chatMessages.isNotEmpty &&
                    _chatMessages.last.role == _ChatRole.assistant) {
                  final nextText = _chatDraft.isEmpty ? 'Dang soan cau tra loi...' : _chatDraft;
                  _chatMessages[_chatMessages.length - 1] =
                      _chatMessages.last.copyWith(text: nextText);
                }
              });
            }
            break;
          case 'warning':
            final warning = payload?['message']?.toString() ?? event.data;
            setState(() {
              _chatError = warning;
            });
            break;
          case 'result':
            if (payload == null) {
              break;
            }
            final assistantJson = payload['assistant'];
            setState(() {
              _chatConversationId = payload['conversation_id']?.toString() ?? _chatConversationId;
              if (assistantJson is Map<String, dynamic>) {
                final assistantPayload = _ChatAssistantPayload.fromJson(assistantJson);
                _chatDraft = assistantPayload.answerText.isEmpty
                    ? _chatDraft
                    : assistantPayload.answerText;
                if (_chatMessages.isNotEmpty &&
                    _chatMessages.last.role == _ChatRole.assistant) {
                  _chatMessages[_chatMessages.length - 1] = _chatMessages.last.copyWith(
                    text: _chatDraft.isEmpty ? 'Khong co noi dung tra loi.' : _chatDraft,
                    meta: assistantPayload,
                  );
                }
              }
            });
            break;
          case 'error':
            throw StateError(payload?['message']?.toString() ?? event.data);
          default:
            break;
        }
      }

      if (!mounted) {
        return;
      }

      setState(() {
        _status = 'Chat response is ready';
        _chatController.clear();
      });
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        _chatError = _formatChatError(error);
        _status = 'Chat failed';
      });
    } finally {
      if (mounted) {
        setState(() {
          _chatBusy = false;
        });
      }
    }
  }

  void _focusOrganFromOutlook(String organId) {
    if (_tabController.index != 0) {
      _tabController.animateTo(0);
    }

    setState(() {
      _focusedOrganId = organId;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = _resultsPanelKey.currentContext;
      if (context != null) {
        Scrollable.ensureVisible(
          context,
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
          alignment: 0.08,
        );
      }
    });
  }

  void _backToOutlook() {
    setState(() {
      _focusedOrganId = null;
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = _summaryPanelKey.currentContext;
      if (context != null) {
        Scrollable.ensureVisible(
          context,
          duration: const Duration(milliseconds: 320),
          curve: Curves.easeOutCubic,
          alignment: 0.02,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = _statusColor(_status);

    return Scaffold(
      body: Container(
        color: const Color(0xFFF0F2F7),
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              Container(
                width: double.infinity,
                color: const Color(0xFF0A1734),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                child: Row(
                  children: [
                    const Icon(Icons.science_rounded, color: Colors.white, size: 20),
                    const SizedBox(width: 10),
                    Text(
                      'smart_labs_analyzer',
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.1,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 1100),
                    child: Column(
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                          child: Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: const Color(0xFFE3E8F2)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      width: 40,
                                      height: 40,
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFEEF2FF),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Icon(
                                        Icons.science_outlined,
                                        color: Color(0xFF4F46E5),
                                        size: 20,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'Analysis workspace',
                                            style: theme.textTheme.titleLarge?.copyWith(
                                              fontWeight: FontWeight.w800,
                                              color: const Color(0xFF0F172A),
                                              letterSpacing: -0.4,
                                            ),
                                          ),
                                          Text(
                                            _status,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: theme.textTheme.bodySmall?.copyWith(
                                              color: statusColor,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    if (_selectedFile != null)
                                      _HeaderChip(
                                        icon: Icons.folder_open_rounded,
                                        label: _selectedFile!.path.split('/').last,
                                      )
                                    else
                                      const _HeaderChip(
                                        icon: Icons.cloud_upload_rounded,
                                        label: 'No file selected',
                                      ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Container(
                                  padding: const EdgeInsets.all(3),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF8FAFC),
                                    borderRadius: BorderRadius.circular(14),
                                    border: Border.all(color: const Color(0xFFE2E8F0)),
                                  ),
                                  child: TabBar(
                                    controller: _tabController,
                                    indicatorSize: TabBarIndicatorSize.tab,
                                    dividerColor: Colors.transparent,
                                    splashBorderRadius: BorderRadius.circular(12),
                                    indicator: BoxDecoration(
                                      color: const Color(0xFF0F172A),
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    labelColor: Colors.white,
                                    unselectedLabelColor: const Color(0xFF64748B),
                                    labelStyle: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13,
                                    ),
                                    unselectedLabelStyle: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                    tabs: const [
                                      Tab(
                                        height: 42,
                                        icon: Icon(Icons.grid_view_rounded, size: 16),
                                        text: 'Overall',
                                      ),
                                      Tab(
                                        height: 42,
                                        icon: Icon(Icons.chat_bubble_outline_rounded, size: 16),
                                        text: 'Chat',
                                      ),
                                      Tab(
                                        height: 42,
                                        icon: Icon(Icons.history_rounded, size: 16),
                                        text: 'History',
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        Expanded(
                          child: TabBarView(
                            controller: _tabController,
                            children: [
                              _buildOverallTab(context),
                              _buildChatTab(context),
                              _buildHistoryTab(context),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOverallTab(BuildContext context) {
    final analysis = _analysis;

    return SingleChildScrollView(
      controller: _overallScrollController,
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 20),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final detailColumn = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (_busy) ...[
                LoadingPanel(status: _status),
              ] else if (analysis != null) ...[
                KeyedSubtree(
                  key: _summaryPanelKey,
                  child: AnalysisSummaryPanel(
                    analysis: analysis,
                    selectedOrganId: _focusedOrganId,
                    onOrganTap: _focusOrganFromOutlook,
                  ),
                ),
                const SizedBox(height: 20),
                KeyedSubtree(
                  key: _resultsPanelKey,
                  child: AnalysisResultsPanel(
                    analysis: analysis,
                    focusedOrganId: _focusedOrganId,
                    onBackToOutlook: _backToOutlook,
                  ),
                ),
              ] else ...[
                _EmptyPanel(
                  icon: Icons.cloud_upload_rounded,
                  title: 'Upload a PDF or image',
                  description:
                      'Drop in a lab report to start the analysis. The overall tab will show extraction, summary, and result cards here.',
                  actionLabel: 'Pick file',
                  onAction: _busy ? null : _pickFile,
                ),
              ],
              const SizedBox(height: 20),
              if (_streamedResponse.isNotEmpty) ...[
                StreamingTranscriptPanel(content: _streamedResponse),
                const SizedBox(height: 20),
              ],
              if (_streamLines.isNotEmpty) ...[
                StreamLogPanel(lines: _streamLines),
              ],
            ],
          );

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              UploadSection(
                selectedFile: _selectedFile,
                busy: _busy,
                onPickFile: _pickFile,
                onAnalyze: _runAnalysis,
              ),
              const SizedBox(height: 16),
              _StatusRibbon(status: _status, analysis: analysis),
              const SizedBox(height: 16),
              detailColumn,
            ],
          );
        },
      ),
    );
  }

  Widget _buildChatTab(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeaderCard(
            icon: Icons.chat_bubble_outline_rounded,
            title: 'Chat',
            description:
                'Ask follow-up questions based on the selected analysis and get actionable guidance.',
            stats: [
              _SectionStat(label: 'Selected', value: _selectedHistoryId != null ? '1' : '0'),
              _SectionStat(label: 'Messages', value: '${_chatMessages.length}'),
              _SectionStat(label: 'Streaming', value: _chatBusy ? 'ON' : 'OFF'),
            ],
          ),
          const SizedBox(height: 18),
          _ChatPanel(
            historyId: _selectedHistoryId,
            busy: _chatBusy,
            errorMessage: _chatError,
            messages: _chatMessages,
            controller: _chatController,
            onSend: _sendChatQuestion,
          ),
        ],
      ),
    );
  }

  Color _statusColor(String status) {
    final lower = status.toLowerCase();

    if (lower.contains('error')) {
      return const Color(0xFFDC2626);
    }
    if (lower.contains('ready') || lower.contains('complete')) {
      return const Color(0xFF16A34A);
    }
    return const Color(0xFF64748B);
  }

  Widget _buildHistoryTab(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeaderCard(
            icon: Icons.history_rounded,
            title: 'History',
            description:
                'Saved analyses stay here so you can revisit a prior run without re-uploading the file.',
            stats: [
              _SectionStat(label: 'Runs', value: '${_history.length}'),
              _SectionStat(label: 'Selected', value: _selectedHistoryId != null ? '1' : '0'),
            ],
          ),
          const SizedBox(height: 18),
          AnalysisHistoryPanel(
            entries: _history,
            selectedHistoryId: _selectedHistoryId,
            loading: _historyLoading,
            errorMessage: _historyError,
            onRefresh: _loadHistory,
            onSelect: _selectHistoryEntry,
          ),
        ],
      ),
    );
  }
}

class _ChatPanel extends StatelessWidget {
  const _ChatPanel({
    required this.historyId,
    required this.busy,
    required this.errorMessage,
    required this.messages,
    required this.controller,
    required this.onSend,
  });

  final String? historyId;
  final bool busy;
  final String? errorMessage;
  final List<_ChatMessage> messages;
  final TextEditingController controller;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final canSend = !busy && (historyId?.isNotEmpty ?? false);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFE3E8F2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Smart Labs Chat',
            style: theme.textTheme.titleMedium?.copyWith(
              color: const Color(0xFF0F172A),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            historyId == null
                ? 'Run or select an analysis first, then ask follow-up questions.'
                : 'Hoi ve chi so bat thuong, muc do rui ro va viec can lam tiep theo.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: const Color(0xFF64748B),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 14),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: messages.isEmpty
                ? Text(
                    'Chua co hoi thoai. Hay dat cau hoi de bat dau.',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: const Color(0xFF64748B),
                    ),
                  )
                : Column(
                    children: [
                      for (final message in messages)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Align(
                            alignment: message.role == _ChatRole.user
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 540),
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                decoration: BoxDecoration(
                                  color: message.role == _ChatRole.user
                                      ? const Color(0xFF0F172A)
                                      : Colors.white,
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: message.role == _ChatRole.user
                                        ? const Color(0xFF0F172A)
                                        : const Color(0xFFE2E8F0),
                                  ),
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      message.text,
                                      style: theme.textTheme.bodyMedium?.copyWith(
                                        color: message.role == _ChatRole.user
                                            ? Colors.white
                                            : const Color(0xFF0F172A),
                                        height: 1.42,
                                      ),
                                    ),
                                    if (message.meta != null) ...[
                                      const SizedBox(height: 10),
                                      Wrap(
                                        spacing: 8,
                                        runSpacing: 8,
                                        children: [
                                          _Chip(label: 'Risk: ${message.meta!.riskLevel.toUpperCase()}'),
                                          if (message.meta!.escalation)
                                            const _Chip(label: 'Escalation: ON'),
                                        ],
                                      ),
                                      if (message.meta!.recommendedActions.isNotEmpty) ...[
                                        const SizedBox(height: 10),
                                        _BulletSection(
                                          title: 'Recommended actions',
                                          items: message.meta!.recommendedActions,
                                        ),
                                      ],
                                      if (message.meta!.followUpQuestions.isNotEmpty) ...[
                                        const SizedBox(height: 10),
                                        _BulletSection(
                                          title: 'Follow-up questions',
                                          items: message.meta!.followUpQuestions,
                                        ),
                                      ],
                                      if (message.meta!.disclaimer.isNotEmpty) ...[
                                        const SizedBox(height: 10),
                                        Text(
                                          message.meta!.disclaimer,
                                          style: theme.textTheme.bodySmall?.copyWith(
                                            color: const Color(0xFF64748B),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  enabled: historyId != null,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) {
                    if (canSend) {
                      onSend();
                    }
                  },
                  decoration: InputDecoration(
                    hintText: 'Vi du: toi can uu tien dieu gi de cai thien chi so?',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton.icon(
                onPressed: canSend ? onSend : null,
                style: FilledButton.styleFrom(
                  minimumSize: const Size(96, 44),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                ),
                icon: busy
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send_rounded, size: 16),
                label: Text(busy ? 'Sending...' : 'Ask'),
              ),
            ],
          ),
          if (errorMessage != null && errorMessage!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              errorMessage!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: const Color(0xFFDC2626),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

enum _ChatRole { user, assistant }

class _ChatMessage {
  const _ChatMessage({
    required this.role,
    required this.text,
    this.meta,
  });

  final _ChatRole role;
  final String text;
  final _ChatAssistantPayload? meta;

  _ChatMessage copyWith({
    _ChatRole? role,
    String? text,
    _ChatAssistantPayload? meta,
  }) {
    return _ChatMessage(
      role: role ?? this.role,
      text: text ?? this.text,
      meta: meta ?? this.meta,
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          color: const Color(0xFF334155),
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _BulletSection extends StatelessWidget {
  const _BulletSection({required this.title, required this.items});

  final String title;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: theme.textTheme.bodySmall?.copyWith(
            color: const Color(0xFF0F172A),
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 4),
        for (final item in items.take(5))
          Padding(
            padding: const EdgeInsets.only(bottom: 2),
            child: Text(
              '• $item',
              style: theme.textTheme.bodySmall?.copyWith(
                color: const Color(0xFF334155),
                height: 1.4,
              ),
            ),
          ),
      ],
    );
  }
}

class _ChatAssistantPayload {
  const _ChatAssistantPayload({
    required this.answerText,
    required this.riskLevel,
    required this.recommendedActions,
    required this.followUpQuestions,
    required this.disclaimer,
    required this.escalation,
  });

  final String answerText;
  final String riskLevel;
  final List<String> recommendedActions;
  final List<String> followUpQuestions;
  final String disclaimer;
  final bool escalation;

  factory _ChatAssistantPayload.fromJson(Map<String, dynamic> json) {
    return _ChatAssistantPayload(
      answerText: json['answer_text']?.toString() ?? '',
      riskLevel: json['risk_level']?.toString() ?? 'unknown',
      recommendedActions: (json['recommended_actions'] as List?)
              ?.map((item) => item.toString())
              .toList(growable: false) ??
          const <String>[],
      followUpQuestions: (json['follow_up_questions'] as List?)
              ?.map((item) => item.toString())
              .toList(growable: false) ??
          const <String>[],
      disclaimer: json['disclaimer']?.toString() ?? '',
      escalation: json['escalation'] == true,
    );
  }
}

class _SectionHeaderCard extends StatelessWidget {
  const _SectionHeaderCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.stats,
  });

  final IconData icon;
  final String title;
  final String description;
  final List<_SectionStat> stats;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A000000),
            blurRadius: 20,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(icon, color: const Color(0xFF4F46E5), size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: const Color(0xFF0F172A),
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      description,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: const Color(0xFF64748B),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [for (final stat in stats) stat],
          ),
        ],
      ),
    );
  }
}

class _SectionStat extends StatelessWidget {
  const _SectionStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: theme.textTheme.titleMedium?.copyWith(
              color: const Color(0xFF0F172A),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: const Color(0xFF64748B),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderChip extends StatelessWidget {
  const _HeaderChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 180),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: const Color(0xFF64748B)),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: const Color(0xFF334155),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyPanel extends StatelessWidget {
  const _EmptyPanel({
    required this.icon,
    required this.title,
    required this.description,
    required this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String description;
  final String actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFFEEF2FF),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: const Color(0xFF4F46E5)),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: theme.textTheme.titleMedium?.copyWith(
              color: const Color(0xFF0F172A),
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            description,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: const Color(0xFF64748B),
              fontWeight: FontWeight.w500,
              height: 1.5,
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: onAction,
            child: Text(actionLabel),
          ),
        ],
      ),
    );
  }
}

class _StatusRibbon extends StatelessWidget {
  const _StatusRibbon({required this.status, required this.analysis});

  final String status;
  final LabAnalysis? analysis;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasAnalysis = analysis != null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: hasAnalysis ? const Color(0xFFF8FAFC) : const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: hasAnalysis ? const Color(0xFFE2E8F0) : const Color(0xFFFDE68A),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            hasAnalysis ? Icons.insights_rounded : Icons.hourglass_bottom_rounded,
            color: hasAnalysis ? const Color(0xFF10B981) : const Color(0xFFD97706),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hasAnalysis ? 'Analysis ready' : 'Waiting for analysis',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF0F172A),
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  status,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF64748B),
                    fontWeight: FontWeight.w500,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
