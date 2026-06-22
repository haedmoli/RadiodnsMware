import { Controller, Get, Param } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('ad-trigger/status')
export class AdTriggerStatusController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get(':serviceId')
  async getStatus(@Param('serviceId') serviceId: string) {
    const regions = await this.prisma.region.findMany();
    const statusReport: Array<{ region: string; playing: boolean; details: any }> = [];

    for (const region of regions) {
      const activeNowKey = `active_now:${serviceId}:${region.nombre}`;
      const data = await this.redis.get(activeNowKey);

      if (data) {
        const parsed = JSON.parse(data);
        statusReport.push({
          region: region.nombre,
          playing: true,
          details: parsed,
        });
      } else {
        statusReport.push({
          region: region.nombre,
          playing: false,
          details: null,
        });
      }
    }

    return {
      serviceId,
      timestamp: new Date(),
      regions: statusReport,
    };
  }
}
