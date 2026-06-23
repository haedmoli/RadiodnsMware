import { Controller, Post, UseInterceptors, UploadedFile, UseGuards, BadRequestException, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';
import type { Request } from 'express';

// Asegurar que exista la carpeta de cargas local
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads', { recursive: true });
}

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new BadRequestException('Solo se permiten archivos de imagen.'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadFile(@UploadedFile() file: any, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException('Archivo no proporcionado.');
    }

    const host = req.get('host');
    const protocol = req.protocol;
    const fileUrl = `${protocol}://${host}/uploads/${file.filename}`;

    return {
      filename: file.filename,
      url: fileUrl,
    };
  }
}
