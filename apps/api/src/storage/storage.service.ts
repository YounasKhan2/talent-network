import { Injectable } from '@nestjs/common';
import { parseApiEnv } from '@talent-network/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageObjectMetadata {
  contentLength: number;
  contentType: string | null;
  eTag: string | null;
}

@Injectable()
export class StorageService {
  private readonly env = parseApiEnv();
  private readonly client = new S3Client({
    endpoint: this.env.S3_ENDPOINT,
    region: this.env.S3_REGION,
    forcePathStyle: this.env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: this.env.S3_ACCESS_KEY,
      secretAccessKey: this.env.S3_SECRET_KEY,
    },
  });

  async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
      return;
    } catch {
      if (this.env.NODE_ENV === 'production')
        throw new Error('Configured S3 bucket is unavailable.');
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.env.S3_BUCKET }));
    } catch (error: unknown) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
      } catch {
        throw error;
      }
    }
  }

  async createPresignedUploadUrl(input: {
    objectKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: input.objectKey,
        ContentType: input.contentType,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async createPresignedDownloadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
    downloadFilename?: string;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: input.objectKey,
        ...(input.downloadFilename
          ? {
              ResponseContentDisposition: `attachment; filename="${sanitizeFilename(input.downloadFilename)}"`,
            }
          : {}),
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async headObject(objectKey: string): Promise<StorageObjectMetadata> {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.env.S3_BUCKET, Key: objectKey }),
    );

    return {
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType ?? null,
      eTag: result.ETag?.replaceAll('"', '') ?? null,
    };
  }
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\r\n"\\]/g, '_').slice(0, 180);
}
