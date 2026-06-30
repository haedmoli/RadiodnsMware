import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MqttService } from '../mqtt/mqtt.service';
import { RadioVisService } from '../radiovis/radiovis.service';
import { AdTriggerEventDto } from './dto/ad-trigger-event.dto';
import { TipoCreatividad } from '@prisma/client';

@Injectable()
export class AdTriggerService {
  private readonly logger = new Logger(AdTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mqtt: MqttService,
    private readonly radioVisService: RadioVisService,
  ) {}

  async handleAdTrigger(event: AdTriggerEventDto) {
    const { serviceId, adId, duration = 30 } = event;
    this.logger.log(`Procesando trigger: serviceId=${serviceId}, adId=${adId}`);

    // 1. Obtener todas las regiones con sus mapeos de topic
    const regions = await this.prisma.region.findMany({
      include: {
        mapeosTopic: true,
      },
    });

    const results: Array<{ region: string; topic: string; payload: string }> = [];

    for (const region of regions) {
      const cacheKey = `active_campania:${serviceId}:${region.nombre}:${adId}`;

      // Intentar leer de Redis
      const campaignCached = await this.redis.get(cacheKey);
      let campaignInfo: {
        campaniaNombre: string;
        clienteNombre: string;
        creatividades: Array<{ tipo: TipoCreatividad; urlImagen: string | null; texto: string | null }>;
      } | null = null;

      if (campaignCached) {
        this.logger.log(`[Cache Hit] Campaña resuelta desde Redis para región: ${region.nombre}`);
        campaignInfo = JSON.parse(campaignCached);
      } else {
        // [Cache Miss] Buscar en PostgreSQL
        this.logger.log(`[Cache Miss] Buscando campaña en DB para región: ${region.nombre}`);
        
        // Buscar campaña específica para esta región
        let activeCampaign = await this.prisma.campania.findFirst({
          where: {
            triggerKey: adId,
            activo: true,
            fechaInicio: { lte: new Date() },
            fechaFin: { gte: new Date() },
            campaniaRegiones: {
              some: {
                regionId: region.id,
              },
            },
          },
          include: {
            creatividades: true,
            cliente: true,
          },
        });

        // Fallback: Si no se encuentra campaña específica, buscar la campaña de fallback nacional
        if (!activeCampaign && region.nombre !== 'nacional') {
          this.logger.log(`No se encontró campaña específica para ${region.nombre}. Buscando fallback nacional.`);
          activeCampaign = await this.prisma.campania.findFirst({
            where: {
              triggerKey: adId,
              activo: true,
              fechaInicio: { lte: new Date() },
              fechaFin: { gte: new Date() },
              campaniaRegiones: {
                some: {
                  region: {
                    nombre: 'nacional',
                  },
                },
              },
            },
            include: {
              creatividades: true,
              cliente: true,
            },
          });
        }

        if (activeCampaign) {
          campaignInfo = {
            campaniaNombre: activeCampaign.nombre,
            clienteNombre: activeCampaign.cliente.nombre,
            creatividades: activeCampaign.creatividades.map((c) => ({
              tipo: c.tipo,
              urlImagen: c.urlImagen,
              texto: c.texto,
            })),
          };

          // Guardar en Redis. Expiración igual a la duración del trigger o 30 segundos por defecto.
          await this.redis.set(cacheKey, JSON.stringify(campaignInfo), duration);
        } else {
          this.logger.warn(`No se encontró campaña activa ni nacional para el trigger: ${adId} en región: ${region.nombre}`);
        }
      }

      // 2. Generar mensajes RadioVIS, publicar en MQTT y guardar estado en tiempo real (active_now)
      if (campaignInfo && campaignInfo.creatividades.length > 0) {
        // Guardar estado en tiempo real en Redis para el monitor de estado (active_now)
        const activeNowKey = `active_now:${serviceId}:${region.nombre}`;
        const activeNowData = {
          campaniaNombre: campaignInfo.campaniaNombre,
          clienteNombre: campaignInfo.clienteNombre,
          creatividades: campaignInfo.creatividades,
          startedAt: new Date(),
          duration,
        };
        await this.redis.set(activeNowKey, JSON.stringify(activeNowData), duration);

        const mapeo = region.mapeosTopic[0]; // Tomamos el primer mapeo disponible
        if (!mapeo) {
          this.logger.warn(`Región ${region.nombre} no tiene configurado mapeo de topics MQTT.`);
          continue;
        }

        // Publicar en paralelo a ActiveMQ (RadioVIS) si se suministró un bearer
        if (event.bearer) {
          this.radioVisService.publish(event.bearer, campaignInfo.creatividades)
            .catch(err => this.logger.error(`Error al publicar en STOMP/RadioVIS: ${err.message}`));
        }

        for (const creatividad of campaignInfo.creatividades) {
          let topic = '';
          let payload = '';

          if (creatividad.tipo === TipoCreatividad.SLIDE && creatividad.urlImagen) {
            topic = mapeo.topicImage;
            payload = `SHOW ${creatividad.urlImagen}`;
          } else if (creatividad.tipo === TipoCreatividad.TEXT && creatividad.texto) {
            topic = mapeo.topicText;
            payload = `TEXT ${creatividad.texto}`;
          }

          if (topic && payload) {
            // Reemplazar marcador de servicio si existe en el topic
            const resolvedTopic = topic.replace('<servicio>', serviceId);
            await this.mqtt.publish(resolvedTopic, payload, true);
            results.push({ region: region.nombre, topic: resolvedTopic, payload });
          }
        }
      }
    }

    return {
      status: 'processed',
      published: results,
    };
  }
}
