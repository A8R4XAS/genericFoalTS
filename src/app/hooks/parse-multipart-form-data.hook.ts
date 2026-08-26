import { Context, File, Hook, HookDecorator } from '@foal/core';

/**
 * Hook that parses incoming `multipart/form-data` requests natively using Node.js buffers
 * and populates FoalTS `ctx.files`.
 *
 * Requires no external dependencies.
 */
export function ParseMultipartFormData(): HookDecorator {
  return Hook(async (ctx: Context) => {
    const contentType = ctx.request.get('content-type') || '';
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      return;
    }

    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!match) {
      return;
    }

    const boundary = match[1] || match[2];
    const boundaryBuffer = Buffer.from(`--${boundary}`);

    // Read full incoming HTTP request body stream
    const chunks: Buffer[] = [];
    for await (const chunk of ctx.request as any) {
      chunks.push(chunk as Buffer);
    }
    const rawBuffer = Buffer.concat(chunks);

    let start = 0;
    while (start < rawBuffer.length) {
      const boundaryIndex = rawBuffer.indexOf(boundaryBuffer, start);
      if (boundaryIndex === -1) break;

      const nextBoundaryIndex = rawBuffer.indexOf(
        boundaryBuffer,
        boundaryIndex + boundaryBuffer.length
      );
      if (nextBoundaryIndex === -1) break;

      const partBuffer = rawBuffer.subarray(
        boundaryIndex + boundaryBuffer.length + 2, // Skip boundary line + \r\n
        nextBoundaryIndex - 2 // Omit \r\n before next boundary
      );

      // Separate header section from body content (\r\n\r\n)
      const headerEndIndex = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEndIndex !== -1) {
        const headerText = partBuffer.subarray(0, headerEndIndex).toString('utf8');
        const fileContent = partBuffer.subarray(headerEndIndex + 4);

        const nameMatch = headerText.match(/name="([^"]+)"/);
        const filenameMatch = headerText.match(/filename="([^"]+)"/);
        const mimeMatch = headerText.match(/Content-Type:\s*([^\r\n]+)/i);

        if (nameMatch && filenameMatch) {
          const fieldName = nameMatch[1];
          const filename = filenameMatch[1];
          const mimeType = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream';

          const fileInstance = new File({
            filename,
            mimeType,
            encoding: '7bit',
            buffer: fileContent,
          });

          ctx.files.push(fieldName, fileInstance);
        }
      }

      start = nextBoundaryIndex;
    }
  });
}
