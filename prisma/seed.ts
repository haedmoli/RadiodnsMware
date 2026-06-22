import { PrismaClient, TipoCreatividad } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando poblamiento de la base de datos...');

  // 1. Limpiar base de datos
  await prisma.campaniaRegion.deleteMany({});
  await prisma.creatividad.deleteMany({});
  await prisma.mapeoRegionTopic.deleteMany({});
  await prisma.campania.deleteMany({});
  await prisma.cliente.deleteMany({});
  await prisma.region.deleteMany({});

  console.log('Base de datos limpiada.');

  // 2. Crear Regiones
  const regionBogota = await prisma.region.create({
    data: { nombre: 'bogota', codigo: 'BOG' },
  });

  const regionMedellin = await prisma.region.create({
    data: { nombre: 'medellin', codigo: 'MDE' },
  });

  const regionNacional = await prisma.region.create({
    data: { nombre: 'nacional', codigo: 'NAC' },
  });

  console.log('Regiones creadas:', [regionBogota.nombre, regionMedellin.nombre, regionNacional.nombre]);

  // 3. Crear Mapeos de Topic para cada Región
  await prisma.mapeoRegionTopic.create({
    data: {
      regionId: regionBogota.id,
      topicImage: '<servicio>/region/bogota/image',
      topicText: '<servicio>/region/bogota/text',
      esFallback: false,
    },
  });

  await prisma.mapeoRegionTopic.create({
    data: {
      regionId: regionMedellin.id,
      topicImage: '<servicio>/region/medellin/image',
      topicText: '<servicio>/region/medellin/text',
      esFallback: false,
    },
  });

  await prisma.mapeoRegionTopic.create({
    data: {
      regionId: regionNacional.id,
      topicImage: '<servicio>/region/nacional/image',
      topicText: '<servicio>/region/nacional/text',
      esFallback: true,
    },
  });

  console.log('Mapeos de topic creados.');

  // 4. Crear Clientes
  const clienteCarulla = await prisma.cliente.create({
    data: { nombre: 'Supermercados Carulla', email: 'contacto@carulla.com' },
  });

  const clienteExito = await prisma.cliente.create({
    data: { nombre: 'Almacenes Éxito', email: 'contacto@exito.com' },
  });

  console.log('Clientes creados.');

  // 5. Crear Campañas y sus Creatividades
  const unDia = 24 * 60 * 60 * 1000;
  const fechaInicio = new Date(Date.now() - unDia);
  const fechaFin = new Date(Date.now() + 10 * unDia);

  // Campaña 1: Bogotá (Carulla)
  const campaniaBogota = await prisma.campania.create({
    data: {
      nombre: 'Carulla Bogotá Descuentos',
      clienteId: clienteCarulla.id,
      triggerKey: 'comercial_bloque_1',
      fechaInicio,
      fechaFin,
      activo: true,
      creatividades: {
        create: [
          {
            tipo: TipoCreatividad.SLIDE,
            urlImagen: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80',
          },
          {
            tipo: TipoCreatividad.TEXT,
            texto: '¡30% de descuento en vinos hoy en Carulla Bogotá!',
          },
        ],
      },
      campaniaRegiones: {
        create: {
          regionId: regionBogota.id,
        },
      },
    },
  });

  // Campaña 2: Medellín (Éxito)
  const campaniaMedellin = await prisma.campania.create({
    data: {
      nombre: 'Éxito Medellín Ofertas',
      clienteId: clienteExito.id,
      triggerKey: 'comercial_bloque_1',
      fechaInicio,
      fechaFin,
      activo: true,
      creatividades: {
        create: [
          {
            tipo: TipoCreatividad.SLIDE,
            urlImagen: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&q=80',
          },
          {
            tipo: TipoCreatividad.TEXT,
            texto: '¡Descuentos exclusivos en tecnología en Éxito Medellín!',
          },
        ],
      },
      campaniaRegiones: {
        create: {
          regionId: regionMedellin.id,
        },
      },
    },
  });

  // Campaña 3: Nacional Fallback (Institucional)
  const campaniaNacional = await prisma.campania.create({
    data: {
      nombre: 'Campaña Institucional Nacional',
      clienteId: clienteExito.id,
      triggerKey: 'comercial_bloque_1',
      fechaInicio,
      fechaFin,
      activo: true,
      creatividades: {
        create: [
          {
            tipo: TipoCreatividad.SLIDE,
            urlImagen: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
          },
          {
            tipo: TipoCreatividad.TEXT,
            texto: 'Escuchas la emisora oficial de Colombia - Radio Híbrida',
          },
        ],
      },
      campaniaRegiones: {
        create: {
          regionId: regionNacional.id,
        },
      },
    },
  });

  console.log('Campañas y creatividades creadas con éxito.');
  console.log('Poblamiento finalizado.');
}

main()
  .catch((e) => {
    console.error('Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
