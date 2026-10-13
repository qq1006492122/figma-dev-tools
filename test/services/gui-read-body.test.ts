import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';

import { readBody } from '../../src/services/gui-server.js';

function fakeRequest(): EventEmitter {
  return new EventEmitter();
}

describe('GUI readBody lifecycle', () => {
  it('请求在 body 完成前断开时 Promise 会拒绝，不永久悬挂', async () => {
    const req = fakeRequest();
    const pending = readBody(req as unknown as IncomingMessage);
    req.emit('close');

    await expect(pending).rejects.toThrow(/closed before body completion/);
  });

  it('正常 end 返回 body', async () => {
    const req = fakeRequest();
    const pending = readBody(req as unknown as IncomingMessage);
    req.emit('data', Buffer.from('hello'));
    req.emit('end');

    await expect(pending).resolves.toBe('hello');
  });
});
