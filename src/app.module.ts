import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PingModule } from './ping/ping.module';
import { RedisModule } from './redis/redis.module';
import { MqttModule } from './mqtt/mqtt.module';
import { AdTriggerModule } from './ad-trigger/ad-trigger.module';
import { SpiModule } from './spi/spi.module';
import { AuthModule } from './auth/auth.module';
import { CampaignModule } from './campaign/campaign.module';
import { UploadsModule } from './uploads/uploads.module';
import { RadioVisModule } from './radiovis/radiovis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    PingModule,
    RedisModule,
    MqttModule,
    AdTriggerModule,
    SpiModule,
    AuthModule,
    CampaignModule,
    UploadsModule,
    RadioVisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
