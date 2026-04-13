import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

/// Manages direct uploads to Alibaba OSS using STS temporary credentials.
class FileUploadService {
  FileUploadService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Future<OssUploadResult> uploadFileToOss({
    required File file,
    required String accessKeyId,
    required String accessKeySecret,
    required String securityToken,
    required String bucket,
    required String region,
  }) async {
    final fileName = file.uri.pathSegments.isNotEmpty ? file.uri.pathSegments.last : 'lab-result';
    final objectKey = 'uploads/${DateTime.now().millisecondsSinceEpoch}_${_sanitizeFileName(fileName)}';
    final contentType = _contentTypeFor(fileName);
    final bytes = await file.readAsBytes();
    final requestDate = HttpDate.format(DateTime.now().toUtc());
    final canonicalHeaders = 'x-oss-security-token:$securityToken';
    final stringToSign = [
      'PUT',
      '',
      contentType,
      requestDate,
      canonicalHeaders,
      '/$bucket/$objectKey',
    ].join('\n');

    final digest = Hmac(sha1, utf8.encode(accessKeySecret)).convert(utf8.encode(stringToSign));
    final signature = base64Encode(digest.bytes);
    final endpoint = '$bucket.$region.aliyuncs.com';
    final encodedPath = objectKey.split('/').map(Uri.encodeComponent).join('/');
    final uploadUri = Uri.https(endpoint, '/$encodedPath');

    final response = await _client.put(
      uploadUri,
      headers: <String, String>{
        HttpHeaders.contentTypeHeader: contentType,
        HttpHeaders.dateHeader: requestDate,
        'Authorization': 'OSS $accessKeyId:$signature',
        'x-oss-security-token': securityToken,
      },
      body: bytes,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
        'OSS upload failed (${response.statusCode}): ${response.body.isEmpty ? 'empty response' : response.body}',
      );
    }

    return OssUploadResult(
      objectKey: objectKey,
      objectUrl: 'https://$endpoint/$encodedPath',
      bucket: bucket,
      region: region,
    );
  }

  void dispose() {
    _client.close();
  }

  String _sanitizeFileName(String fileName) {
    return fileName.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
  }

  String _contentTypeFor(String fileName) {
    final lower = fileName.toLowerCase();

    if (lower.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (lower.endsWith('.png')) {
      return 'image/png';
    }
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (lower.endsWith('.webp')) {
      return 'image/webp';
    }

    return 'application/octet-stream';
  }
}

class OssUploadResult {
  const OssUploadResult({
    required this.objectKey,
    required this.objectUrl,
    required this.bucket,
    required this.region,
  });

  final String objectKey;
  final String objectUrl;
  final String bucket;
  final String region;
}
