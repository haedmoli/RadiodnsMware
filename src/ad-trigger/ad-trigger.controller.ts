import { Controller, Post, Body, Logger } from '@nestjs/common';
import { AdTriggerService } from './ad-trigger.service';
import { AdTriggerEventDto } from './dto/ad-trigger-event.dto';
import { AzuracastPayloadDto } from './dto/azuracast-payload.dto';

@Controller('ad-trigger')
export class AdTriggerController {
  private readonly logger = new Logger(AdTriggerController.name);

  constructor(private readonly adTriggerService: AdTriggerService) {}

  @Post('webhook')
  async handleAdTrigger(@Body() event: AdTriggerEventDto) {
    return this.adTriggerService.handleAdTrigger(event);
  }

  @Post('azuracast')
  async handleAzuracastWebhook(@Body() payload: AzuracastPayloadDto) {
    // Si viene envuelto en un objeto "np" (como en el Test Webhook de AzuraCast)
    const np = payload.np?.['App\\Entity\\Api\\NowPlaying\\NowPlaying'] || payload.np || payload;

    const station = np.station;
    const nowPlaying = np.now_playing;
    const song = nowPlaying?.song;
    const songHistory = np.song_history || payload.song_history;

    const isTest = !payload.event && (!!payload.np || !!payload.now_playing);

    this.logger.log(
      `Recibido webhook de AzuraCast. Evento original: ${payload.event || 'test/np'} (isTest: ${isTest})`,
    );

    if (payload.event !== 'song_changed' && !isTest) {
      this.logger.warn(`Webhook ignorado: Evento "${payload.event}" no soportado.`);
      return { status: 'ignored', reason: `Evento no soportado: ${payload.event}` };
    }

    const serviceId = station?.shortcode;
    const duration = nowPlaying?.duration || 30;

    if (!serviceId || !song) {
      this.logger.error('Payload de AzuraCast incompleto (sin estación o canción actual).');
      return { status: 'error', reason: 'Payload de AzuraCast incompleto (sin estación o canción actual).' };
    }

    // Resolver adId priorizando el custom_field "trigger_key" de la canción actual
    let adId = song.custom_fields?.trigger_key;

    // Si no tiene trigger_key directa, buscar en el historial de canciones
    // para encontrar si alguna canción recientemente reproducida tenía un trigger_key
    if (!adId && songHistory && Array.isArray(songHistory)) {
      this.logger.log('Canción actual sin trigger_key. Buscando en el historial...');
      const historicSongWithTrigger = songHistory.find(
        (historyItem) => historyItem.song?.custom_fields?.trigger_key,
      );
      if (historicSongWithTrigger) {
        adId = historicSongWithTrigger.song.custom_fields.trigger_key;
        this.logger.log(`Encontrado trigger_key en historial: "${adId}"`);
      }
    }

    // Si sigue sin haber trigger_key, usamos el título o el texto como fallback
    if (!adId) {
      adId = song.title || song.text;
      this.logger.log(`Usando fallback de título/texto para trigger_key: "${adId}"`);
    }

    const bearer = station?.bearer || 
                   process.env[`BEARER_${serviceId}`] || 
                   process.env[`BEARER_${serviceId.toUpperCase()}`] || 
                   process.env[`BEARER_${serviceId.toLowerCase()}`];

    const mappedEvent: AdTriggerEventDto = {
      serviceId,
      adId,
      duration,
      bearer,
    };

    this.logger.log(
      `Mapeado a trigger event: serviceId=${serviceId}, adId=${adId}, duration=${duration}, bearer=${bearer}`,
    );

    return this.adTriggerService.handleAdTrigger(mappedEvent);
  }
}
