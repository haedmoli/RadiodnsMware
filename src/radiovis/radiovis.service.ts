import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as stompit from 'stompit';
import { parseBearer } from './utils/bearer.parser';

@Injectable()
export class RadioVisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RadioVisService.name);
  private client: stompit.Client | null = null;
  private isConnecting = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000; // Delay inicial de 1s
  private maxReconnectDelay = 30000; // Máximo delay de 30s

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.disconnect();
  }

  private connect() {
    if (this.client || this.isConnecting) return;
    this.isConnecting = true;

    const host = this.configService.get<string>('STOMP_HOST', 'localhost');
    const port = this.configService.get<number>('STOMP_PORT', 61613);
    const useTls = this.configService.get<string>('STOMP_USE_TLS', 'false') === 'true';
    const login = this.configService.get<string>('STOMP_USER', 'admin');
    const passcode = this.configService.get<string>('STOMP_PASSWORD', 'adminpassword');

    this.logger.log(`Conectando a ActiveMQ STOMP en ${host}:${port} (TLS: ${useTls})...`);

    const connectionOptions: any = {
      host,
      port,
      ssl: useTls,
      connectHeaders: {
        host,
        login,
        passcode,
        'heart-beat': '10000,10000',
      },
    };

    stompit.connect(connectionOptions, (err, client) => {
      this.isConnecting = false;
      if (err) {
        this.logger.error(`Error al conectar con ActiveMQ STOMP: ${err.message}`);
        this.scheduleReconnect();
        return;
      }

      this.logger.log('Conexión exitosa con ActiveMQ STOMP');
      this.client = client;
      this.reconnectDelay = 1000; // Resetear delay al conectar exitosamente

      client.on('error', (clientErr) => {
        this.logger.error(`Error del cliente STOMP: ${clientErr.message}`);
        this.client = null;
        this.scheduleReconnect();
      });

      client.on('end', () => {
        this.logger.warn('Conexión STOMP finalizada por el servidor.');
        this.client = null;
        this.scheduleReconnect();
      });
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    this.logger.log(`Programando reconexión STOMP en ${this.reconnectDelay}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  private disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  async publish(bearer: string, creatividades: any[]) {
    // 1. Resolver tópicos a partir del bearer
    let topics: { imageTopic: string; textTopic: string };
    try {
      topics = parseBearer(bearer);
    } catch (err) {
      this.logger.error(`No se pudo procesar el bearer "${bearer}": ${err.message}`);
      return;
    }

    if (!this.client) {
      this.logger.warn(`Publicación omitida: Cliente STOMP no está conectado.`);
      return;
    }

    for (const creatividad of creatividades) {
      let topic = '';
      let body = '';

      if (creatividad.tipo === 'SLIDE' && creatividad.urlImagen) {
        const url = creatividad.urlImagen;
        // Validar límite de caracteres para URL (512 caracteres)
        if (url.length > 512) {
          this.logger.warn(
            `Pauta rechazada: URL de diapositiva excede el límite de 512 caracteres (${url.length} caracteres)`
          );
          continue;
        }
        topic = topics.imageTopic;
        body = `SHOW ${url}`;
      } else if (creatividad.tipo === 'TEXT' && creatividad.texto) {
        let texto = creatividad.texto;
        // Validar límite de caracteres para texto (128 caracteres). Truncar e informar.
        if (texto.length > 128) {
          this.logger.warn(
            `Texto de pauta comercial excede el límite de 128 caracteres. Se truncará de ${texto.length} a 128.`
          );
          texto = texto.substring(0, 128);
        }
        topic = topics.textTopic;
        body = `TEXT ${texto}`;
      }

      if (topic && body) {
        this.logger.log(`Publicando en ActiveMQ [${topic}]: ${body}`);
        try {
          const frame = this.client.send({
            destination: topic,
            'content-type': 'text/plain; charset=utf-8',
          });

          frame.write(body);
          frame.end();
        } catch (sendErr) {
          this.logger.error(`Error al enviar frame STOMP a ${topic}: ${sendErr.message}`);
        }
      }
    }
  }
}
