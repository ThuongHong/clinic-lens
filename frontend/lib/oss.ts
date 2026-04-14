import OSS from 'ali-oss';

import type { StsTokenResponse, UploadResult } from '@/lib/types';

function buildObjectKey(fileName: string) {
    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    return `uploads/${Date.now()}_${safeName || 'lab-upload'}`;
}

function encodeObjectKey(objectKey: string) {
    return objectKey.split('/').map((part) => encodeURIComponent(part)).join('/');
}

export async function uploadFileToOss(
    file: File,
    creds: StsTokenResponse
): Promise<UploadResult> {
    const client = new OSS({
        region: creds.Region,
        accessKeyId: creds.AccessKeyId,
        accessKeySecret: creds.AccessKeySecret,
        stsToken: creds.SecurityToken,
        bucket: creds.Bucket
    });

    const objectKey = buildObjectKey(file.name);
    const encodedKey = encodeObjectKey(objectKey);

    await client.put(objectKey, file);

    return {
        objectKey,
        objectUrl: `https://${creds.Bucket}.${creds.Region}.aliyuncs.com/${encodedKey}`,
        bucket: creds.Bucket,
        region: creds.Region
    };
}