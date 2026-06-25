import { Controller, Get, Param, Req, Res, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { GeoIpService } from '../geoip/geoip.service';
import { ConfigService } from '@nestjs/config';

@Controller('spi')
export class SpiController {
  private readonly logger = new Logger(SpiController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geoIpService: GeoIpService,
    private readonly configService: ConfigService,
  ) {}

  @Get(':serviceId/service-information.xml')
  async getServiceInformation(
    @Param('serviceId') serviceId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // 1. Extraer dirección IP del cliente
    let clientIp = '';
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const ipList = typeof xForwardedFor === 'string' ? xForwardedFor.split(',') : xForwardedFor[0].split(',');
      clientIp = ipList[0].trim();
    } else {
      clientIp = req.socket.remoteAddress || req.ip || '';
    }

    // Normalizar IPv6-mapped IPv4 (ej. ::ffff:127.0.0.1 -> 127.0.0.1)
    if (clientIp.startsWith('::ffff:')) {
      clientIp = clientIp.substring(7);
    }

    this.logger.log(`Petición SPI para: ${serviceId} desde IP: ${clientIp}`);

    // 2. Resolver ciudad usando GeoIP
    const city = this.geoIpService.resolveCityFromIp(clientIp);
    let regionNombre = 'nacional'; // Por defecto

    if (city) {
      // Normalizar nombre de ciudad (quitar tildes y a minúsculas)
      const normalizedCity = city
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      // Buscar si la ciudad corresponde a una región en BD
      const dbRegion = await this.prisma.region.findUnique({
        where: { nombre: normalizedCity },
      });

      if (dbRegion) {
        regionNombre = dbRegion.nombre;
        this.logger.log(`Región resuelta: ${regionNombre} para la ciudad: ${city}`);
      } else {
        this.logger.log(`Ciudad ${city} no tiene región específica asignada. Usando nacional.`);
      }
    } else {
      this.logger.log(`No se pudo determinar la geolocalización de la IP. Usando región nacional.`);
    }

    // 3. Obtener el mapeo de topic para la región resuelta
    let regionData = await this.prisma.region.findUnique({
      where: { nombre: regionNombre },
      include: {
        mapeosTopic: true,
      },
    });

    // Fallback absoluto si no existe la región nacional en base de datos
    if (!regionData || regionData.mapeosTopic.length === 0) {
      this.logger.warn(`No se encontró mapeo para la región: ${regionNombre}. Usando fallback de emergencia.`);
      regionData = await this.prisma.region.findFirst({
        where: {
          mapeosTopic: {
            some: {
              esFallback: true,
            },
          },
        },
        include: {
          mapeosTopic: true,
        },
      });
    }

    const mapeo = regionData?.mapeosTopic[0];
    const topicImage = mapeo?.topicImage || '<servicio>/region/nacional/image';
    
    // Obtener prefijo del topic (ej: "emisora_colombia/region/bogota")
    const topicPrefix = topicImage
      .replace('/image', '')
      .replace('<servicio>', serviceId);

    // 4. Construir XML dinámico SPI (TS 102 818)
    const mqttPublicHost = this.configService.get<string>('MQTT_PUBLIC_HOST', 'localhost');
    const mqttPublicPort = this.configService.get<number>('MQTT_PUBLIC_PORT', 1883);

    const bearer = process.env[`BEARER_${serviceId}`] || 
                   process.env[`BEARER_${serviceId.toUpperCase()}`] || 
                   process.env[`BEARER_${serviceId.toLowerCase()}`];

    let stompLinkXml = '';
    if (bearer) {
      const stompPublicHost = this.configService.get<string>('STOMP_PUBLIC_HOST', 'localhost');
      const stompPublicPort = this.configService.get<number>('STOMP_PUBLIC_PORT', 61613);
      // fm:2a3.2016.10540 -> 2a3/2016
      const bearerPath = bearer.replace('fm:', '').split('.').slice(0, 2).join('/');
      stompLinkXml = `\n      <!-- Enlace RadioVIS nacional sobre STOMP -->\n      <link uri="stomp://${stompPublicHost}:${stompPublicPort}/topic/${bearerPath}" mimeValue="application/x-rt-topic"/>`;
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<serviceInformation xmlns="http://www.worlddab.org/schemas/spi/31" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <services>
    <service>
      <shortName>${serviceId.toUpperCase()}</shortName>
      <mediumName>${serviceId.toUpperCase()} FM</mediumName>
      <longName>${serviceId.toUpperCase()} Radio Híbrida (${regionNombre.toUpperCase()})</longName>
      <mediaDescription>
        <shortDescription>Middleware RadioDNS para pauta geo-segmentada</shortDescription>
      </mediaDescription>
      <!-- Enlace RadioVIS regionalizado sobre MQTT -->
      <link uri="mqtt://${mqttPublicHost}:${mqttPublicPort}/${topicPrefix}" mimeValue="application/x-rt-topic"/>${stompLinkXml}
    </service>
  </services>
</serviceInformation>`;

    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  }
}
