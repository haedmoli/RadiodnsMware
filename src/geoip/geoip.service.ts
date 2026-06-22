import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reader, ReaderModel } from '@maxmind/geoip2-node';
import * as fs from 'fs';

@Injectable()
export class GeoIpService implements OnModuleInit {
  private readonly logger = new Logger(GeoIpService.name);
  private reader: ReaderModel | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const dbPath = this.configService.get<string>('GEOIP_DB_PATH');

    if (!dbPath) {
      this.logger.warn('GEOIP_DB_PATH no está configurado. Usando fallback nacional para todas las consultas.');
      return;
    }

    if (fs.existsSync(dbPath)) {
      try {
        this.reader = await Reader.open(dbPath);
        this.logger.log(`Base de datos GeoIP cargada correctamente desde: ${dbPath}`);
      } catch (error) {
        this.logger.error(`Error al cargar la base de datos GeoIP: ${error.message}`);
      }
    } else {
      this.logger.warn(`No se encontró el archivo de base de datos GeoIP en la ruta: ${dbPath}. Usando fallback nacional.`);
    }
  }

  resolveCityFromIp(ip: string): string | null {
    if (!this.reader) {
      return null;
    }

    // Ignorar IPs locales y de bucle
    if (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === 'localhost' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.20.') ||
      ip.startsWith('172.21.') ||
      ip.startsWith('172.22.') ||
      ip.startsWith('172.23.') ||
      ip.startsWith('172.24.') ||
      ip.startsWith('172.25.') ||
      ip.startsWith('172.26.') ||
      ip.startsWith('172.27.') ||
      ip.startsWith('172.28.') ||
      ip.startsWith('172.29.') ||
      ip.startsWith('172.30.') ||
      ip.startsWith('172.31.')
    ) {
      this.logger.debug(`IP local/privada detectada (${ip}). Retornando null para usar fallback nacional.`);
      return null;
    }

    try {
      const response = this.reader.city(ip);
      // Intentar obtener el nombre de la ciudad en español, si no en inglés
      const cityName = response.city?.names?.es || response.city?.names?.en || null;
      
      this.logger.log(`IP ${ip} resuelta a la ciudad: ${cityName}`);
      return cityName;
    } catch (error) {
      this.logger.warn(`No se pudo resolver la IP ${ip}: ${error.message}`);
      return null;
    }
  }
}
