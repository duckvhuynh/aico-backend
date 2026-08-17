import { Injectable } from '@nestjs/common';

export const OBJECT_STORE = Symbol('OBJECT_STORE');

export interface ObjectStoreCall {
  operation: 'put' | 'get' | 'head' | 'delete';
  key: string;
}

export interface ObjectStorePort {
  readonly calls: readonly ObjectStoreCall[];
  put(key: string, body: Buffer, metadata: Record<string, string>): Promise<void>;
  get(key: string): Promise<Buffer>;
  head(key: string): Promise<{ contentLength: number }>;
  delete(key: string): Promise<void>;
}

@Injectable()
export class MemoryObjectStore implements ObjectStorePort {
  readonly calls: ObjectStoreCall[] = [];
  private readonly objects = new Map<string, Buffer>();

  async put(key: string, body: Buffer, metadata: Record<string, string>): Promise<void> {
    void metadata;
    this.calls.push({ operation: 'put', key });
    this.objects.set(key, Buffer.from(body));
  }

  async get(key: string): Promise<Buffer> {
    this.calls.push({ operation: 'get', key });
    const body = this.objects.get(key);
    if (!body) {
      throw new Error('object_store_miss');
    }
    return Buffer.from(body);
  }

  async head(key: string): Promise<{ contentLength: number }> {
    this.calls.push({ operation: 'head', key });
    const body = this.objects.get(key);
    if (!body) {
      throw new Error('object_store_miss');
    }
    return { contentLength: body.length };
  }

  async delete(key: string): Promise<void> {
    this.calls.push({ operation: 'delete', key });
    this.objects.delete(key);
  }
}
