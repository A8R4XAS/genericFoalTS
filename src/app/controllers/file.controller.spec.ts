// std
import { ok, strictEqual } from 'assert';

// 3p
import {
  Context,
  createController,
  getHttpMethod,
  getPath,
  isHttpResponseBadRequest,
  isHttpResponseCreated,
  isHttpResponseOK,
  File,
} from '@foal/core';

// App
import { FileController } from './file.controller';

describe('FileController', () => {
  let controller: FileController;

  beforeEach(() => (controller = createController(FileController)));

  describe('has a "getMyFiles" method that', () => {
    it('should handle requests at GET /my-files.', () => {
      strictEqual(getHttpMethod(FileController, 'getMyFiles'), 'GET');
      strictEqual(getPath(FileController, 'getMyFiles'), '/my-files');
    });

    it('should return HttpResponseOK with user files.', async () => {
      const ctx = new Context({});
      ctx.user = { id: 1 } as any;

      (controller as any).fileUploadService = {
        getUserFiles: async () => [
          {
            id: 1,
            originalName: 'doc.pdf',
            storedName: 'uuid-doc.pdf',
            mimeType: 'application/pdf',
            size: 2048,
            createdAt: new Date(),
          },
        ],
      };

      const response = await controller.getMyFiles(ctx as any);
      ok(isHttpResponseOK(response));
      strictEqual(Array.isArray(response.body), true);
      strictEqual((response.body as any[])[0].originalName, 'doc.pdf');
    });
  });

  describe('has an "uploadFile" method that', () => {
    it('should handle requests at POST /upload.', () => {
      strictEqual(getHttpMethod(FileController, 'uploadFile'), 'POST');
      strictEqual(getPath(FileController, 'uploadFile'), '/upload');
    });

    it('should return HttpResponseBadRequest when no file is uploaded.', async () => {
      const ctx = new Context({});
      const response = await controller.uploadFile(ctx as any);
      ok(isHttpResponseBadRequest(response));
    });

    it('should return HttpResponseCreated when a valid file is uploaded.', async () => {
      const ctx = new Context({});
      const mockFile = new File({
        filename: 'test.png',
        mimeType: 'image/png',
        encoding: '7bit',
        buffer: Buffer.from('fake-png-content'),
      });
      ctx.files.push('file', mockFile);
      ctx.user = { id: 1 } as any;

      (controller as any).fileUploadService = {
        upload: async () => ({
          id: 1,
          originalName: 'test.png',
          storedName: 'uuid-test.png',
          mimeType: 'image/png',
          size: 16,
          createdAt: new Date(),
        }),
      };

      const response = await controller.uploadFile(ctx as any);
      ok(isHttpResponseCreated(response));
      strictEqual((response.body as any).originalName, 'test.png');
    });
  });
});
