import { Module } from '@nestjs/common';
import { SpiController } from './spi.controller';
import { GeoIpService } from '../geoip/geoip.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SpiController],
  providers: [GeoIpService],
  exports: [GeoIpService],
})
export class SpiModule {}
