import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class BackendApi {
  BackendApi({required this.baseUrl, http.Client? client}) : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  Uri _uri(String path, [Map<String, String>? queryParameters]) {
    return Uri.parse('$baseUrl$path').replace(queryParameters: queryParameters);
  }

  Future<Map<String, dynamic>> fetchStsToken() async {
    final response = await _client.get(_uri('/api/sts-token'));

    if (response.statusCode >= 400) {
      throw StateError('Failed to fetch STS token: ${response.body}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> signObjectUrl(String objectKey, {int expiresInSeconds = 300}) async {
    final response = await _client.get(
      _uri('/api/sign-url', {
        'object_key': objectKey,
        'expires_in': expiresInSeconds.toString(),
      }),
    );

    if (response.statusCode >= 400) {
      throw StateError('Failed to sign OSS URL: ${response.body}');
    }

    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Stream<SseEvent> streamAnalysis(String fileUrl) async* {
    final request = http.Request('POST', _uri('/api/analyze'));
    request.headers['Content-Type'] = 'application/json';
    request.body = jsonEncode(<String, dynamic>{'file_url': fileUrl});

    final streamed = await _client.send(request);
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
