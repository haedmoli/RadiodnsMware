import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private client: mqtt.MqttClient;
  private readonly logger = new Logger(MqttService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('MQTT_HOST', 'localhost');
    const port = this.configService.get<number>('MQTT_PORT', 1883);

    this.logger.log(`Conectando al broker MQTT en mqtt://${host}:${port}`);
    this.client = mqtt.connect(`mqtt://${host}:${port}`);

    this.client.on('connect', () => {
      this.logger.log('Conectado exitosamente al broker MQTT');
    });

    this.client.on('error', (err) => {
      this.logger.error(`Error de conexión en MQTT: ${err.message}`);
    });
  }

  publish(topic: string, payload: string, retain = true): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, payload, { qos: 1, retain }, (error) => {
        if (error) {
          this.logger.error(`Error publicando en topic ${topic}: ${error.message}`);
          reject(error);
        } else {
          this.logger.log(`Mensaje publicado en [${topic}]: ${payload}`);
          resolve();
        }
      });
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.end();
    }
  }
}
