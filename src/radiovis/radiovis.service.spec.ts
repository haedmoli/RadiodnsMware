import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RadioVisService } from './radiovis.service';
import * as stompit from 'stompit';

// Mock de Stompit
jest.mock('stompit', () => {
  return {
    connect: jest.fn((options, callback) => {
      // Devolver un cliente mockeado
      const client = {
        send: jest.fn(() => ({
          write: jest.fn(),
          end: jest.fn(),
        })),
        on: jest.fn(),
        disconnect: jest.fn(),
      };
      callback(null, client);
    }),
  };
});

describe('RadioVisService', () => {
  let service: RadioVisService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        RadioVisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: any) => {
              if (key === 'STOMP_HOST') return 'localhost';
              if (key === 'STOMP_PORT') return 61613;
              if (key === 'STOMP_USE_TLS') return 'false';
              if (key === 'STOMP_USER') return 'admin';
              if (key === 'STOMP_PASSWORD') return 'adminpassword';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RadioVisService>(RadioVisService);
    configService = module.get<ConfigService>(ConfigService);
    
    // Forzar inicialización de conexión
    await service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('debería inicializar y conectar el cliente STOMP con los valores de configuración', () => {
    expect(stompit.connect).toHaveBeenCalled();
  });

  it('debería enviar mensajes válidos a los tópicos adecuados', async () => {
    const mockSend = (service as any).client.send;
    
    const creatividades = [
      { tipo: 'SLIDE', urlImagen: 'https://ejemplo.com/imagen.jpg' },
      { tipo: 'TEXT', texto: 'Mensaje de prueba corto' },
    ];

    await service.publish('fm:2a3.2016.10540', creatividades);

    // Verificar publicaciones
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ destination: '/topic/2a3/2016/image' })
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ destination: '/topic/2a3/2016/text' })
    );
  });

  it('debería truncar mensajes de texto de más de 128 caracteres y emitir una advertencia', async () => {
    const mockSend = (service as any).client.send;
    const mockWrite = jest.fn();
    mockSend.mockReturnValue({
      write: mockWrite,
      end: jest.fn(),
    });

    const textoLargo = 'a'.repeat(150);
    const creatividades = [{ tipo: 'TEXT', texto: textoLargo }];

    await service.publish('fm:2a3.2016.10540', creatividades);

    // Debe recortarse a 128 caracteres
    const expectedText = 'TEXT ' + 'a'.repeat(128);
    expect(mockWrite).toHaveBeenCalledWith(expectedText);
  });

  it('debería rechazar imágenes con URLs de más de 512 caracteres y emitir una advertencia', async () => {
    const mockSend = (service as any).client.send;
    
    const urlLarga = 'https://ejemplo.com/' + 'b'.repeat(500); // > 512 total chars
    const creatividades = [{ tipo: 'SLIDE', urlImagen: urlLarga }];

    await service.publish('fm:2a3.2016.10540', creatividades);

    // No debería llamarse al método send para la diapositiva rechazada
    expect(mockSend).not.toHaveBeenCalled();
  });
});
