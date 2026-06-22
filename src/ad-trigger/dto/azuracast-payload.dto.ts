export class AzuracastSongDto {
  id: string;
  text: string;
  artist: string;
  title: string;
  custom_fields?: Record<string, any>;
}

export class AzuracastNowPlayingDto {
  duration: number;
  song: AzuracastSongDto;
}

export class AzuracastStationDto {
  id: number;
  name: string;
  shortcode: string;
  bearer?: string;
}

export class AzuracastPayloadDto {
  event: string;
  station: AzuracastStationDto;
  now_playing: AzuracastNowPlayingDto;
}
