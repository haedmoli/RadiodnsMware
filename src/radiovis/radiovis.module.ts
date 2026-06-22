import { Module } from '@nestjs/common';
import { RadioVisService } from './radiovis.service';

@Module({
  providers: [RadioVisService],
  exports: [RadioVisService],
})
export class RadioVisModule {}
// Exportar también la utilidad para que otros módulos puedan usarla si es necesario
export * from './utils/bearer.parser';
