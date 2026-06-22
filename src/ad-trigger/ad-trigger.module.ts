import { Module } from '@nestjs/common';
import { AdTriggerController } from './ad-trigger.controller';
import { AdTriggerStatusController } from './ad-trigger-status.controller';
import { AdTriggerService } from './ad-trigger.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { MqttModule } from '../mqtt/mqtt.module';
import { RadioVisModule } from '../radiovis/radiovis.module';

@Module({
  imports: [PrismaModule, RedisModule, MqttModule, RadioVisModule],
  controllers: [AdTriggerController, AdTriggerStatusController],
  providers: [AdTriggerService],
})
export class AdTriggerModule {}
