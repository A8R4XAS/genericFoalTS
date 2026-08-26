// std
import { ok, strictEqual } from 'assert';

// 3p
import { Context, getHookFunctions, ServiceManager } from '@foal/core';

// App
import { ParseMultipartFormData } from './parse-multipart-form-data.hook';

describe('ParseMultipartFormData hook', () => {
  it('should not parse non-multipart requests.', async () => {
    const hook = getHookFunctions(ParseMultipartFormData())[0];
    const ctx = new Context({
      get: () => 'application/json',
    });

    await hook(ctx, new ServiceManager());

    strictEqual(ctx.files.getAll().length, 0);
  });

  it('should parse multipart/form-data boundary and populate ctx.files.', async () => {
    const hook = getHookFunctions(ParseMultipartFormData())[0];

    const boundary = '----WebKitFormBoundaryTest123';
    const bodyString =
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="test.png"\r\n' +
      'Content-Type: image/png\r\n\r\n' +
      'fake-png-content\r\n' +
      `--${boundary}--\r\n`;

    const bodyBuffer = Buffer.from(bodyString, 'utf-8');

    // Mock async iterable stream on request
    const mockRequest = {
      get: (header: string) => {
        if (header.toLowerCase() === 'content-type') {
          return `multipart/form-data; boundary=${boundary}`;
        }
        return undefined;
      },
      [Symbol.asyncIterator]: async function* () {
        yield bodyBuffer;
      },
    };

    const ctx = new Context(mockRequest);

    await hook(ctx, new ServiceManager());

    const files = ctx.files.get('file');
    strictEqual(files.length, 1);
    strictEqual(files[0].filename, 'test.png');
    strictEqual(files[0].mimeType, 'image/png');
    ok(files[0].buffer.equals(Buffer.from('fake-png-content')));
  });
});
