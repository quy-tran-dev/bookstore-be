import { Injectable, NestInterceptor, ExecutionContext, CallHandler, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join, resolve, sep } from 'path';
import { v7 as uuidv7 } from 'uuid';
import * as fs from 'fs';
import { MediaFolder } from '../enums/media-folder.enum'; // Import Enum

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
]);

export function UploadMultipleImageInterceptor(fieldName: string = 'files', maxCount: number = 10) {
  @Injectable()
  class Interceptor implements NestInterceptor {
    fileInterceptor: NestInterceptor;

    constructor() {
      const absUploadRoot = resolve('./public/uploads');

      const multerOptions = {
        storage: diskStorage({
          destination: (req: any, file, cb) => {
            // 1. Kiểm tra Base Folder xem có khớp Enum không (chống gõ sai)
            const reqFolder = req.query.folder as string;
            const baseFolder = Object.values(MediaFolder).includes(reqFolder as MediaFolder) 
              ? reqFolder 
              : MediaFolder.GENERAL;

            // 2. Xử lý Sub Folder an toàn (Chống tấn công Path Traversal)
            let finalFolder = baseFolder;
            
            if (req.query.subFolder) {
              // Regex: Chỉ cho phép chữ cái, số, gạch ngang, gạch dưới. Xóa toàn bộ ký tự nguy hiểm (/, \, ., *, v.v.)
              const safeSubFolder = String(req.query.subFolder).replace(/[^a-zA-Z0-9_-]/g, '');
              
              if (safeSubFolder) {
                finalFolder = `${baseFolder}/${safeSubFolder}`; // VD: events/tet-2026
              }
            }

            // 3. Kiểm tra đường dẫn tuyệt đối luôn nằm trong absUploadRoot (chống Path Traversal)
            const uploadPath = resolve(absUploadRoot, finalFolder);
            if (
              uploadPath !== absUploadRoot &&
              !uploadPath.startsWith(absUploadRoot + sep)
            ) {
              return cb(
                new BadRequestException('Đường dẫn thư mục lưu trữ không hợp lệ!'),
                '',
              );
            }

            // 4. Truyền folder cuối cùng cho Controller xài thông qua req
            req.customUploadFolder = finalFolder;

            // 5. Tạo thư mục vật lý (chỉ lưu trữ dữ liệu tĩnh, không cấp quyền thực thi)
            if (!fs.existsSync(uploadPath)) {
              fs.mkdirSync(uploadPath, { recursive: true, mode: 0o755 });
            }
            
            cb(null, uploadPath);
          },
          filename: (req, file, cb) => {
            const safeExt = extname(file.originalname || '').toLowerCase();
            cb(null, `${uuidv7()}${safeExt}`);
          },
        }),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (req, file, cb) => {
          const ext = extname(file.originalname || '').toLowerCase();
          const isValidMime = /^image\/(jpg|jpeg|png|gif|webp)$/i.test(
            file.mimetype || '',
          );
          if (!isValidMime || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
            return cb(
              new BadRequestException(
                'Chỉ chấp nhận định dạng hình ảnh hợp lệ (.jpg, .jpeg, .png, .gif, .webp)!',
              ),
              false,
            );
          }
          cb(null, true);
        },
      };

      this.fileInterceptor = new (FilesInterceptor(fieldName, maxCount, multerOptions))();
    }

    intercept(context: ExecutionContext, next: CallHandler) {
      return this.fileInterceptor.intercept(context, next);
    }
  }

  return Interceptor;
}