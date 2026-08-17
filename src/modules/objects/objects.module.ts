import { Module } from '@nestjs/common';
import { ObjectAccessService } from './object-access.service';
import { MemoryObjectStore, OBJECT_STORE } from './object-store';

@Module({
  providers: [
    MemoryObjectStore,
    { provide: OBJECT_STORE, useExisting: MemoryObjectStore },
    ObjectAccessService,
  ],
  exports: [ObjectAccessService],
})
export class ObjectsModule {}
