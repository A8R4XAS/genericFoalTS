// std
import { ok, strictEqual } from 'assert';

// 3p
import { Context, createController, getHttpMethod, getPath, isHttpResponseOK } from '@foal/core';

// App
import { FileController } from './file.controller';

describe('FileController', () => {
  let controller: FileController;

  beforeEach(() => (controller = createController(FileController)));

  describe('has an "uploadFile" method that', () => {
    it('should handle requests at POST /upload.', () => {
      strictEqual(getHttpMethod(FileController, 'uploadFile'), 'POST');
      strictEqual(getPath(FileController, 'uploadFile'), '/upload');
    });

    it('should return an HttpResponseOK.', () => {
      const ctx = new Context({});
      ok(isHttpResponseOK(controller.uploadFile(ctx as any)));
    });
  });
});
