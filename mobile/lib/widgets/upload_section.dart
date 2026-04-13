import 'dart:io';
import 'package:flutter/material.dart';

/// Upload form section
class UploadSection extends StatelessWidget {
  const UploadSection({
    super.key,
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

    return Semantics(
      label: 'File upload section',
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0xFFF1F5F9)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x08000000),
              blurRadius: 20,
              offset: Offset(0, 8),
            )
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Upload Lab Result',
              style: theme.textTheme.titleMedium
                  ?.copyWith(fontWeight: FontWeight.w800, color: const Color(0xFF0F172A)),
            ),
            const SizedBox(height: 16),
            // File Status
            Semantics(
              label: selectedFile != null ? 'File selected: ${selectedFile!.path.split('/').last}' : 'No file selected',
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: selectedFile != null
                      ? const Color(0xFFECFDF5)
                      : const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: selectedFile != null
                        ? const Color(0xFF6EE7B7)
                        : const Color(0xFFE2E8F0),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      selectedFile != null
                          ? Icons.check_circle_rounded
                          : Icons.file_present_rounded,
                      color: selectedFile != null ? const Color(0xFF10B981) : const Color(0xFF64748B),
                      size: 24,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        selectedFile != null
                            ? selectedFile!.path.split('/').last
                            : 'No file selected',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color:
                              selectedFile != null ? const Color(0xFF065F46) : const Color(0xFF64748B),
                          fontWeight: FontWeight.w500,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            // Buttons
            Row(
              children: [
                Expanded(
                  child: Semantics(
                    button: true,
                    label: 'Pick File Button',
                    child: FilledButton.icon(
                      onPressed: busy ? null : onPickFile,
                      icon: const Icon(Icons.upload_file),
                      label: const Text('Pick File'),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Semantics(
                    button: true,
                    label: 'Analyze File Button',
                    child: FilledButton(
                      onPressed: (busy || selectedFile == null) ? null : onAnalyze,
                      child: Text(busy ? 'Analyzing...' : 'Analyze'),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
