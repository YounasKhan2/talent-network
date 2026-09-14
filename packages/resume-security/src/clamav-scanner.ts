import { Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import type { MalwareScanResult, MalwareScanner } from './malware-scanner.js';

export interface ClamAvScannerOptions {
  host: string;
  port: number;
  timeoutMs?: number;
  maxChunkBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHUNK_BYTES = 64 * 1024;

export class ClamAvScanner implements MalwareScanner {
  private readonly timeoutMs: number;
  private readonly maxChunkBytes: number;

  constructor(private readonly options: ClamAvScannerOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxChunkBytes = options.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BYTES;
  }

  async scan(bytes: Uint8Array): Promise<MalwareScanResult> {
    const startedAt = performance.now();
    const engineVersion = await this.getVersion().catch(() => null);

    try {
      const response = await this.sendInstream(bytes);
      const parsed = parseScanResponse(response);
      return {
        ...parsed,
        engine: 'clamav',
        engineVersion,
        scannedBytes: bytes.byteLength,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    } catch {
      return {
        status: 'ERROR',
        engine: 'clamav',
        engineVersion,
        signature: null,
        scannedBytes: bytes.byteLength,
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  }

  async getVersion(): Promise<string> {
    const response = await this.sendCommand(Buffer.from('zVERSION\0', 'ascii'));
    return response.replace(/\0/g, '').trim();
  }

  private async sendInstream(bytes: Uint8Array): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const socket = this.createSocket(resolve, reject);
      socket.once('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0', 'ascii'));
        const source = Buffer.from(bytes);
        for (let offset = 0; offset < source.length; offset += this.maxChunkBytes) {
          const chunk = source.subarray(offset, Math.min(source.length, offset + this.maxChunkBytes));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.length, 0);
          socket.write(length);
          socket.write(chunk);
        }
        const terminator = Buffer.alloc(4);
        socket.write(terminator);
      });
    });
  }

  private async sendCommand(command: Buffer): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const socket = this.createSocket(resolve, reject);
      socket.once('connect', () => socket.write(command));
    });
  }

  private createSocket(
    resolve: (response: string) => void,
    reject: (error: Error) => void,
  ): Socket {
    const socket = new Socket();
    let settled = false;
    let response = '';

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(response.replace(/\0/g, '').trim());
    };

    socket.setTimeout(this.timeoutMs);
    socket.on('timeout', () => finish(new Error('ClamAV scan timed out.')));
    socket.on('error', (error) => finish(error));
    socket.on('data', (chunk: Buffer) => {
      response += chunk.toString('utf8');
      if (response.includes('\0') || response.includes('\n')) finish();
    });
    socket.on('end', () => finish());
    socket.connect(this.options.port, this.options.host);
    return socket;
  }
}

export function parseScanResponse(
  response: string,
): Pick<MalwareScanResult, 'status' | 'signature'> {
  const normalized = response.replace(/\0/g, '').trim();
  if (/\bOK$/i.test(normalized)) return { status: 'CLEAN', signature: null };

  const infected = normalized.match(/^.*?:\s*(.+?)\s+FOUND$/i);
  if (infected?.[1]) return { status: 'INFECTED', signature: infected[1] };

  return { status: 'ERROR', signature: null };
}
