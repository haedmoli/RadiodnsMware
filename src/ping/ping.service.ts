import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import * as mqtt from 'mqtt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async ping() {
    const status = {
      database: 'disconnected',
      redis: 'disconnected',
      mqtt: 'disconnected',
    };

    // 1. Validar PostgreSQL
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      status.database = 'connected';
    } catch (error) {
      status.database = `error: ${error.message}`;
    }

    // 2. Validar Redis
    const redisHost = this.configService.get<string>('REDIS_HOST', 'localhost');
    const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
    try {
      const redis = new Redis({
        host: redisHost,
        port: Number(redisPort),
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });
      const redisPing = await redis.ping();
      if (redisPing === 'PONG') {
        status.redis = 'connected';
      }
      redis.disconnect();
    } catch (error) {
      status.redis = `error: ${error.message}`;
    }

    // 3. Validar MQTT Mosquitto
    const mqttHost = this.configService.get<string>('MQTT_HOST', 'localhost');
    const mqttPort = this.configService.get<number>('MQTT_PORT', 1883);
    try {
      status.mqtt = await new Promise<string>((resolve) => {
        const client = mqtt.connect(`mqtt://${mqttHost}:${mqttPort}`, {
          connectTimeout: 2000,
        });

        const timeout = setTimeout(() => {
          client.end();
          resolve('error: connection timeout');
        }, 2000);

        client.on('connect', () => {
          clearTimeout(timeout);
          client.end();
          resolve('connected');
        });

        client.on('error', (err) => {
          clearTimeout(timeout);
          client.end();
          resolve(`error: ${err.message}`);
        });
      });
    } catch (error) {
      status.mqtt = `error: ${error.message}`;
    }

    const overallStatus =
      status.database === 'connected' &&
      status.redis === 'connected' &&
      status.mqtt === 'connected'
        ? 'ok'
        : 'error';

    return {
      status: overallStatus,
      details: status,
    };
  }
}
