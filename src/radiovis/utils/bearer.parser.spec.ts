import { parseBearer } from './bearer.parser';

describe('parseBearer', () => {
  it('debería parsear un bearer FM válido y devolver los tópicos correctos', () => {
    const result = parseBearer('fm:2a3.2016.10540');
    expect(result).toEqual({
      imageTopic: '/topic/2a3/2016/image',
      textTopic: '/topic/2a3/2016/text',
    });
  });

  it('debería normalizar a minúsculas los caracteres hexadecimales del ecc y pi', () => {
    const result = parseBearer('fm:2A3.201A.10540');
    expect(result).toEqual({
      imageTopic: '/topic/2a3/201a/image',
      textTopic: '/topic/2a3/201a/text',
    });
  });

  it('debería recortar espacios en blanco al inicio o al final', () => {
    const result = parseBearer('  fm:2a3.2016.10540  ');
    expect(result).toEqual({
      imageTopic: '/topic/2a3/2016/image',
      textTopic: '/topic/2a3/2016/text',
    });
  });

  it('debería lanzar un error si el bearer está vacío', () => {
    expect(() => parseBearer('')).toThrow('El bearer no puede estar vacío');
  });

  it('debería lanzar un error si falta el prefijo fm:', () => {
    expect(() => parseBearer('2a3.2016.10540')).toThrow(
      'Formato de bearer no soportado o mal formado'
    );
  });

  it('debería lanzar un error si el ecc no tiene exactamente 3 caracteres hexadecimales', () => {
    expect(() => parseBearer('fm:2a.2016.10540')).toThrow(
      'Formato de bearer no soportado o mal formado'
    );
    expect(() => parseBearer('fm:2a3f.2016.10540')).toThrow(
      'Formato de bearer no soportado o mal formado'
    );
    expect(() => parseBearer('fm:2aG.2016.10540')).toThrow(
      'Formato de bearer no soportado o mal formado'
    ); // G no es hex
  });

  it('debería lanzar un error si el pi no tiene exactamente 4 caracteres hexadecimales', () => {
    expect(() => parseBearer('fm:2a3.201.10540')).toThrow(
      'Formato de bearer no soportado o mal formado'
    );
    expect(() => parseBearer('fm:2a3.2016a.10540')).toThrow(
      'Formato de bearer no soportado o mal formado'
    );
    expect(() => parseBearer('fm:2a3.201H.10540')).toThrow(
      'Formato de bearer no soportado o mal formado'
    ); // H no es hex
  });

  it('debería lanzar un error si la frecuencia no tiene exactamente 5 dígitos decimales', () => {
    expect(() => parseBearer('fm:2a3.2016.1054')).toThrow(
      'Formato de bearer no soportado o mal formado'
    );
    expect(() => parseBearer('fm:2a3.2016.105401')).toThrow(
      'Formato de bearer no soportado o mal formado'
    );
    expect(() => parseBearer('fm:2a3.2016.1054a')).toThrow(
      'Formato de bearer no soportado o mal formado'
    ); // tiene letras
  });
});
