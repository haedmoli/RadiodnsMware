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

  const bloques = [
    {
      num: 1,
      bogota: { nombre: 'Carulla Bogotá Descuentos B1', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80', txt: '¡30% de descuento en vinos hoy en Carulla Bogotá!' },
      medellin: { nombre: 'Éxito Medellín Ofertas B1', img: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&q=80', txt: '¡Descuentos exclusivos en tecnología en Éxito Medellín!' },
      nacional: { nombre: 'Campaña Institucional Nacional B1', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80', txt: 'Escuchas la emisora oficial de Colombia - Radio Híbrida' },
    },
    {
      num: 2,
      bogota: { nombre: 'Carulla Bogotá Descuentos B2', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80', txt: '¡2x1 en toda la categoría de quesos madurados en Carulla Bogotá!' },
      medellin: { nombre: 'Éxito Medellín Ofertas B2', img: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&q=80', txt: '¡20% de devolución en tarjeta Éxito en electrohogar Medellín!' },
      nacional: { nombre: 'Campaña Institucional Nacional B2', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80', txt: 'Radio Híbrida: La mejor música e información nacional' },
    },
    {
      num: 3,
      bogota: { nombre: 'Carulla Bogotá Descuentos B3', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80', txt: '¡Frescura garantizada! 40% de descuento en frutas y verduras Carulla BOG!' },
      medellin: { nombre: 'Éxito Medellín Ofertas B3', img: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&q=80', txt: '¡30% de descuento en ropa deportiva de la marca Bronzini Medellín!' },
      nacional: { nombre: 'Campaña Institucional Nacional B3', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80', txt: 'Sintoniza con las regiones desde cualquier parte del país' },
    },
    {
      num: 4,
      bogota: { nombre: 'Carulla Bogotá Descuentos B4', img: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&q=80', txt: '¡Super jueves! 15% de descuento adicional con tarjeta Carulla BOG!' },
      medellin: { nombre: 'Éxito Medellín Ofertas B4', img: 'https://images.unsplash.com/photo-1573164713988-8665fc963095?w=800&q=80', txt: '¡Renueva tu colchón con hasta 50% de descuento en Éxito Medellín!' },
      nacional: { nombre: 'Campaña Institucional Nacional B4', img: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80', txt: 'Radio Híbrida: Una sola señal, todo un país conectado' },
    },
  ];

  for (const b of bloques) {
    const triggerKey = `comercial_bloque_${b.num}`;

    // Bogotá
    await prisma.campania.create({
      data: {
        nombre: b.bogota.nombre,
        clienteId: clienteCarulla.id,
        triggerKey,
        fechaInicio,
        fechaFin,
        activo: true,
        creatividades: {
          create: [
            { tipo: TipoCreatividad.SLIDE, urlImagen: b.bogota.img },
            { tipo: TipoCreatividad.TEXT, texto: b.bogota.txt },
          ],
        },
        campaniaRegiones: {
          create: { regionId: regionBogota.id },
        },
      },
    });

    // Medellín
    await prisma.campania.create({
      data: {
        nombre: b.medellin.nombre,
        clienteId: clienteExito.id,
        triggerKey,
        fechaInicio,
        fechaFin,
        activo: true,
        creatividades: {
          create: [
            { tipo: TipoCreatividad.SLIDE, urlImagen: b.medellin.img },
            { tipo: TipoCreatividad.TEXT, texto: b.medellin.txt },
          ],
        },
        campaniaRegiones: {
          create: { regionId: regionMedellin.id },
        },
      },
    });

    // Nacional
    await prisma.campania.create({
      data: {
        nombre: b.nacional.nombre,
        clienteId: clienteExito.id,
        triggerKey,
        fechaInicio,
        fechaFin,
        activo: true,
        creatividades: {
          create: [
            { tipo: TipoCreatividad.SLIDE, urlImagen: b.nacional.img },
            { tipo: TipoCreatividad.TEXT, texto: b.nacional.txt },
          ],
        },
        campaniaRegiones: {
          create: { regionId: regionNacional.id },
        },
      },
    });
  }

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
