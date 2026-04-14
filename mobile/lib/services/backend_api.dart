import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/lab_analysis.dart';

String resolveBackendBaseUrl() {
  const configuredBaseUrl = String.fromEnvironment('BACKEND_BASE_URL');
  if (configuredBaseUrl.isNotEmpty) {
    return configuredBaseUrl;
  }

  if (kIsWeb) {
    return 'http://localhost:9000';
  }

  if (Platform.isAndroid) {
    return 'http://10.0.2.2:9000';
  }

  return 'http://localhost:9000';
}

class BackendApi {
  BackendApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  List<String> get _baseUrlCandidates {
    final candidates = <String>[baseUrl.trim()];

    if (baseUrl.contains('localhost')) {
      candidates.add(baseUrl.replaceFirst('localhost', '127.0.0.1'));
    }

    if (baseUrl.contains('127.0.0.1')) {
      candidates.add(baseUrl.replaceFirst('127.0.0.1', 'localhost'));
    }

    if (Platform.isAndroid && baseUrl.contains('localhost')) {
      candidates.add(baseUrl.replaceFirst('localhost', '10.0.2.2'));
    }

    return candidates.toSet().toList(growable: false);
  }

  Future<http.Response> _getWithFallback(
    String path, {
    Map<String, String>? queryParameters,
  }) async {
    Object? lastError;

    for (final candidateBaseUrl in _baseUrlCandidates) {
      try {
        final response = await _client.get(
          Uri.parse('$candidateBaseUrl$path').replace(queryParameters: queryParameters),
        );

        if (response.statusCode < 500 || candidateBaseUrl == _baseUrlCandidates.last) {
          return response;
        }
      } on SocketException catch (error) {
        lastError = error;
      } on http.ClientException catch (error) {
        lastError = error;
      }
    }

    throw StateError(
      'Backend unreachable at ${_baseUrlCandidates.join(' / ')}. '
      'Check that the backend is running on port 9000. ${lastError ?? ''}'.trim(),
    );
  }

  Uri _uri(String path, [Map<String, String>? queryParameters]) {
    return Uri.parse('$baseUrl$path').replace(queryParameters: queryParameters);
  }

  Future<Map<String, dynamic>> fetchStsToken() async {
    final response = await _getWithFallback('/api/sts-token');

    if (response.statusCode >= 400) {
      throw StateError('Failed to fetch STS token: ${response.body}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> signObjectUrl(String objectKey, {int expiresInSeconds = 300}) async {
    final response = await _getWithFallback(
      '/api/sign-url',
      queryParameters: {
        'object_key': objectKey,
        'expires_in': expiresInSeconds.toString(),
      },
    );

    if (response.statusCode >= 400) {
      throw StateError('Failed to sign OSS URL: ${response.body}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<List<AnalysisHistoryEntry>> fetchAnalysisHistory({int limit = 12}) async {
    final response = await _getWithFallback(
      '/api/analyses',
      queryParameters: {
        'limit': limit.toString(),
      },
    );

    if (response.statusCode >= 400) {
      throw StateError('Failed to fetch analysis history: ${response.body}');
    }

    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    final items = payload['items'];

    if (items is! List) {
      return const <AnalysisHistoryEntry>[];
    }

    return items
        .whereType<Map<String, dynamic>>()
        .map(AnalysisHistoryEntry.fromJson)
        .toList(growable: false);
  }

  Stream<SseEvent> streamAnalysis({
    String? fileUrl,
    String? objectKey,
    String? localFilePath,
  }) async* {
    if ((fileUrl == null || fileUrl.isEmpty) &&
        (objectKey == null || objectKey.isEmpty) &&
        (localFilePath == null || localFilePath.isEmpty)) {
      throw ArgumentError('Either fileUrl, objectKey or localFilePath must be provided.');
    }

    final request = http.Request('POST', _uri('/api/analyze'));
    request.headers['Content-Type'] = 'application/json';
    request.body = jsonEncode(<String, dynamic>{
      if (fileUrl != null && fileUrl.isNotEmpty) 'file_url': fileUrl,
      if (objectKey != null && objectKey.isNotEmpty) 'object_key': objectKey,
      if (localFilePath != null && localFilePath.isNotEmpty) 'local_file_path': localFilePath,
    });

    http.StreamedResponse streamed;

    try {
      streamed = await _client.send(request);
    } on SocketException catch (error) {
      throw StateError(
        'Backend unreachable at ${_baseUrlCandidates.join(' / ')}. '
        'Check that the backend is running on port 9000. $error',
      );
    } on http.ClientException catch (error) {
      throw StateError(
        'Backend unreachable at ${_baseUrlCandidates.join(' / ')}. '
        'Check that the backend is running on port 9000. $error',
      );
    }

    if (streamed.statusCode >= 400) {
      final body = await streamed.stream.bytesToString();
      throw StateError('Failed to start analysis: $body');
    }

    final lines = streamed.stream
        .transform(utf8.decoder)
        .transform(const LineSplitter());

    String? eventName;
    final dataBuffer = StringBuffer();

    await for (final line in lines) {
      if (line.isEmpty) {
        if (dataBuffer.isNotEmpty) {
          yield SseEvent(
            event: eventName ?? 'message',
            data: dataBuffer.toString(),
          );
        }
        eventName = null;
        dataBuffer.clear();
        continue;
      }

      if (line.startsWith('event:')) {
        eventName = line.substring(6).trim();
        continue;
      }

      if (line.startsWith('data:')) {
        if (dataBuffer.isNotEmpty) {
          dataBuffer.write('\n');
        }
        dataBuffer.write(line.substring(5).trimLeft());
      }
    }

    if (dataBuffer.isNotEmpty) {
      yield SseEvent(
        event: eventName ?? 'message',
        data: dataBuffer.toString(),
      );
    }
  }

  void dispose() {
    _client.close();
  }
}

class SseEvent {
  const SseEvent({required this.event, required this.data});

  final String event;
  final String data;

  Map<String, dynamic> asJson() {
    return jsonDecode(data) as Map<String, dynamic>;
  }
}
