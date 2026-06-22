import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { TipoCreatividad } from '@prisma/client';

@Injectable()
export class CampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll() {
    return this.prisma.campania.findMany({
      include: {
        cliente: true,
        creatividades: true,
        campaniaRegiones: {
          include: {
            region: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campania.findUnique({
      where: { id },
      include: {
        cliente: true,
        creatividades: true,
        campaniaRegiones: {
          include: {
            region: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaña con ID ${id} no encontrada.`);
    }

    return campaign;
  }

  async create(dto: any) {
    const { nombre, clienteId, triggerKey, fechaInicio, fechaFin, activo = true, regionIds, creatividades } = dto;

    const campaign = await this.prisma.campania.create({
      data: {
        nombre,
        clienteId,
        triggerKey,
        fechaInicio: new Date(fechaInicio),
        fechaFin: new Date(fechaFin),
        activo,
        creatividades: {
          create: creatividades.map((c: any) => ({
            tipo: c.tipo,
            urlImagen: c.tipo === TipoCreatividad.SLIDE ? c.urlImagen : null,
            texto: c.tipo === TipoCreatividad.TEXT ? c.texto : null,
          })),
        },
        campaniaRegiones: {
          create: regionIds.map((rId: string) => ({
            regionId: rId,
          })),
        },
      },
      include: {
        creatividades: true,
        campaniaRegiones: true,
      },
    });

    await this.clearCampaignCache(triggerKey);
    return campaign;
  }

  async update(id: string, dto: any) {
    const { nombre, clienteId, triggerKey, fechaInicio, fechaFin, activo, regionIds, creatividades } = dto;

    // Verificar existencia
    const existing = await this.findOne(id);

    // 1. Limpiar relaciones previas de región
    await this.prisma.campaniaRegion.deleteMany({
      where: { campaniaId: id },
    });

    // 2. Limpiar creatividades previas
    await this.prisma.creatividad.deleteMany({
      where: { campaniaId: id },
    });

    // 3. Actualizar campaña y recrear relaciones
    const updated = await this.prisma.campania.update({
      where: { id },
      data: {
        nombre: nombre ?? existing.nombre,
        clienteId: clienteId ?? existing.clienteId,
        triggerKey: triggerKey ?? existing.triggerKey,
        fechaInicio: fechaInicio ? new Date(fechaInicio) : existing.fechaInicio,
        fechaFin: fechaFin ? new Date(fechaFin) : existing.fechaFin,
        activo: activo !== undefined ? activo : existing.activo,
        creatividades: {
          create: creatividades
            ? creatividades.map((c: any) => ({
                tipo: c.tipo,
                urlImagen: c.tipo === TipoCreatividad.SLIDE ? c.urlImagen : null,
                texto: c.tipo === TipoCreatividad.TEXT ? c.texto : null,
              }))
            : [],
        },
        campaniaRegiones: {
          create: regionIds
            ? regionIds.map((rId: string) => ({
                regionId: rId,
              }))
            : [],
        },
      },
      include: {
        creatividades: true,
        campaniaRegiones: true,
      },
    });

    // Invalidar caché del triggerKey anterior y del nuevo
    await this.clearCampaignCache(existing.triggerKey);
    if (triggerKey && triggerKey !== existing.triggerKey) {
      await this.clearCampaignCache(triggerKey);
    }

    return updated;
  }

  async remove(id: string) {
    const campaign = await this.findOne(id);
    await this.prisma.campania.delete({
      where: { id },
    });

    await this.clearCampaignCache(campaign.triggerKey);
    return { deleted: true, id };
  }

  private async clearCampaignCache(triggerKey: string) {
    try {
      const regions = await this.prisma.region.findMany();
      for (const region of regions) {
        const serviceIds = ['emisora_colombia', 'colombia_fm'];
        for (const serviceId of serviceIds) {
          const key = `active_campania:${serviceId}:${region.nombre}:${triggerKey}`;
          await this.redis.del(key);
        }
      }
    } catch (e) {
      console.error('Error al limpiar caché de campañas:', e);
    }
  }
}
