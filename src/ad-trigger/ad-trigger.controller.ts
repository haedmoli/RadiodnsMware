import { Controller, Post, Body } from '@nestjs/common';
import { AdTriggerService } from './ad-trigger.service';
import { AdTriggerEventDto } from './dto/ad-trigger-event.dto';
import { AzuracastPayloadDto } from './dto/azuracast-payload.dto';

@Controller('ad-trigger')
export class AdTriggerController {
  constructor(private readonly adTriggerService: AdTriggerService) {}

  @Post('webhook')
  async handleAdTrigger(@Body() event: AdTriggerEventDto) {
    return this.adTriggerService.handleAdTrigger(event);
  }

  @Post('azuracast')
  async handleAzuracastWebhook(@Body() payload: AzuracastPayloadDto) {
    if (payload.event !== 'song_changed') {
      return { status: 'ignored', reason: `Evento no soportado: ${payload.event}` };
    }

    const serviceId = payload.station?.shortcode;
    const song = payload.now_playing?.song;
    const duration = payload.now_playing?.duration || 30;

    if (!serviceId || !song) {
      return { status: 'error', reason: 'Payload de AzuraCast incompleto.' };
    }

    // Resolver adId priorizando el custom_field "trigger_key" de AzuraCast
    const adId = song.custom_fields?.trigger_key || song.title;

    const mappedEvent: AdTriggerEventDto = {
      serviceId,
      adId,
      duration,
      bearer: payload.station?.bearer,
    };

    return this.adTriggerService.handleAdTrigger(mappedEvent);
  }
}
