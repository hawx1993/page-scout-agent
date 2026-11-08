import { describe, expect, it } from 'vitest';
import { isPublicIp, normalizeUrl, publicAddress } from '../server/network.js';

describe('URL and network boundaries', () => {
  it.each([
    '127.0.0.1',
    '0.0.0.0',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
    '2001:db8::1',
  ])('rejects private or reserved IP %s', (ip) => expect(isPublicIp(ip)).toBe(false));
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public unicast %s', (ip) =>
    expect(isPublicIp(ip)).toBe(true),
  );
  it('normalizes protocol, removes fragments and preserves content query', () =>
    expect(normalizeUrl('example.com/docs?a=1#top').href).toBe('https://example.com/docs?a=1'));
  it.each([
    'https://user:password@example.com',
    'https://example.com:8080',
    'http://example.com:22',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'ftp://example.com',
  ])('rejects credentials / unsupported schemes or ports: %s', (url) =>
    expect(() => normalizeUrl(url)).toThrow(),
  );
  it.each(['localhost', 'service.local', 'service.internal', '127.0.0.1', '::ffff:127.0.0.1'])(
    'rejects non-public host %s before opening a socket',
    async (host) => await expect(publicAddress(host)).rejects.toThrow(),
  );
});
