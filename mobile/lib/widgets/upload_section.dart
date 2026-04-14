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
    final hasFile = selectedFile != null;

    return Semantics(
      label: 'File upload section',
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: const Color(0xFFE3E8F2)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x080F172A),
              blurRadius: 14,
              offset: Offset(0, 6),
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
            const SizedBox(height: 4),
            Text(
              hasFile ? 'File ready for analysis' : 'Choose PDF or image to begin',
              style: theme.textTheme.bodySmall?.copyWith(
                color: hasFile ? const Color(0xFF16A34A) : const Color(0xFF64748B),
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            // File Status
            Semantics(
              label: selectedFile != null ? 'File selected: ${selectedFile!.path.split('/').last}' : 'No file selected',
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: hasFile ? const Color(0xFF93C5FD) : const Color(0xFFD6DFEE),
                    width: 1,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      hasFile ? Icons.description_outlined : Icons.file_present_rounded,
                      color: hasFile ? const Color(0xFF1D4ED8) : const Color(0xFF64748B),
                      size: 22,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        hasFile ? selectedFile!.path.split('/').last : 'No file selected',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: hasFile ? const Color(0xFF334155) : const Color(0xFF64748B),
                          fontWeight: FontWeight.w600,
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
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF4F46E5),
                      ),
                      icon: const Icon(Icons.upload_file_rounded),
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
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF0F172A),
                      ),
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
