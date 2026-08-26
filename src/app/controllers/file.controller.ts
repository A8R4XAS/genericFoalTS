/**
 * FileController mounted at /api/files
POST /upload protected by @JwtRequired() and @RateLimit
Returns 201 with file metadata on success; 400 on type/size violation

- HTTP und Multipart-Datei aus ctx.request.files lesen
 */
import { Context, Post, HttpResponseBadRequest, HttpResponseCreated } from '@foal/core';
import { ParseAndValidateFiles } from '@foal/storage';
import { JwtRequired, RateLimit } from '../hooks';
import { FileUploadService } from '../services';
import { User } from '../entities';
export class FileController {
  private readonly fileUploadService: FileUploadService = new FileUploadService();

  @JwtRequired()
  @RateLimit()
  @ParseAndValidateFiles({
    file: { required: true },
  })
  @Post('/upload')
  async uploadFile(ctx: Context<User>) {
    const file = ctx.files.get('file')?.[0]; // Assuming a single file upload with the field name 'file'
    if (!file) {
      return new HttpResponseBadRequest({ error: 'No file uploaded' });
    }

    const uploadedFile = await this.fileUploadService.upload(file, ctx.user); // Implement this service to handle file saving and metadata storage

    return new HttpResponseCreated({
      id: uploadedFile.id,
      originalName: uploadedFile.originalName,
      storedName: uploadedFile.storedName,
      mimeType: uploadedFile.mimeType,
      size: uploadedFile.size,
      uploadDate: uploadedFile.createdAt,
    });
  }
}
