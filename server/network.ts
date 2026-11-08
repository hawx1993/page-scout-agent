import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { Transform } from 'node:stream';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import ipaddr from 'ipaddr.js';

export function normalizeUrl(input: string): URL {
  if (/^[a-z][a-z\d+.-]*:/i.test(input) && !/^https?:\/\//i.test(input))
    throw new Error('仅支持 HTTP / HTTPS 网址。');
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('仅支持不含账号密码的 HTTP / HTTPS 网址。');
  if (url.port && !['80', '443'].includes(url.port))
    throw new Error('仅支持公开网站的 80 / 443 端口。');
  url.hash = '';
  return url;
}

export function isPublicIp(address: string) {
  try {
    const parsed = ipaddr.process(address.replace(/^\[|\]$/g, ''));
    return parsed.range() === 'unicast';
  } catch {
    return false;
  }
}

export async function publicAddress(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal|test|invalid)$/.test(host))
    throw new Error('不能访问本机、内网或保留域名。');
  const records = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await dns.lookup(host, { all: true });
  if (!records.length || records.some((r) => !isPublicIp(r.address)))
    throw new Error('该网址解析到非公开网络地址，已阻止访问。');
  return records.find((record) => record.family === 4) ?? records[0]!;
}

export type SafeResponse = {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
};
export async function safeFetch(
  input: string,
  signal?: AbortSignal,
  redirects = 0,
): Promise<SafeResponse> {
  if (redirects > 5) throw new Error('网页重定向次数过多。');
  const url = normalizeUrl(input);
  const address = await publicAddress(url.hostname);
  const response = await new Promise<SafeResponse>((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.get(
      url,
      {
        // Pin the validated address to the socket; no second DNS lookup / rebinding window.
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        headers: {
          'user-agent': 'SiteLens/0.1 (+open-source website inspector)',
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
          'accept-encoding': 'gzip, deflate, br',
        },
        signal,
        timeout: 20_000,
        rejectUnauthorized: true,
        family: address.family,
      },
      (res) => {
        const headers = Object.fromEntries(
          Object.entries(res.headers).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.join(', ') : (v ?? ''),
          ]),
        );
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && headers.location) {
          res.resume();
          resolve({ url: url.href, status: res.statusCode, headers, body: '' });
          return;
        }
        const limit = 3 * 1024 * 1024;
        let bytes = 0;
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, cb) {
            bytes += chunk.length;
            cb(bytes > limit ? new Error('页面超过 3 MB 抓取限制。') : null, chunk);
          },
        });
        const encoding = headers['content-encoding'];
        const decompressor =
          encoding === 'gzip'
            ? createGunzip()
            : encoding === 'deflate'
              ? createInflate()
              : encoding === 'br'
                ? createBrotliDecompress()
                : undefined;
        const stream = decompressor ? res.pipe(decompressor).pipe(limiter) : res.pipe(limiter);
        const chunks: Buffer[] = [];
        res.on('error', reject);
        decompressor?.on('error', reject);
        stream.on('error', (e) => {
          request.destroy();
          reject(e);
        });
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () =>
          resolve({
            url: url.href,
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    request.on('timeout', () => request.destroy(new Error('网页连接超时，请稍后重试。')));
    request.on('error', reject);
  });
  if (response.status >= 300 && response.status < 400 && response.headers.location)
    return safeFetch(new URL(response.headers.location, url).href, signal, redirects + 1);
  if (response.status >= 400) throw new Error(`目标网页返回 HTTP ${response.status}。`);
  if (!/text\/|application\/xhtml\+xml/i.test(response.headers['content-type'] ?? ''))
    throw new Error('该地址不是可分析的网页。');
  return response;
}

/** Browser traffic uses this proxy; each connection is DNS-validated and pinned. */
export async function createSafeProxy() {
  const sockets = new Set<net.Socket>();
  const server = http.createServer(async (req, res) => {
    try {
      const url = normalizeUrl(req.url ?? '');
      const addr = await publicAddress(url.hostname);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      const headers: http.OutgoingHttpHeaders = { ...req.headers, host: url.host };
      delete headers['proxy-connection'];
      delete headers['proxy-authorization'];
      const upstream = http.request(
        url,
        {
          method: req.method,
          headers,
          family: addr.family,
          lookup: (_h, _o, cb) => cb(null, addr.address, addr.family),
          timeout: 20_000,
        },
        (remote) => {
          res.writeHead(remote.statusCode ?? 502, remote.headers);
          remote.pipe(res);
        },
      );
      upstream.on('timeout', () => upstream.destroy());
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch {
      res.writeHead(403).end('SiteLens: non-public network blocked');
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  server.on('connect', async (req, client, head) => {
    try {
      const url = new URL(`https://${req.url}`);
      if ((url.port || '443') !== '443') throw new Error('Blocked port');
      const addr = await publicAddress(url.hostname);
      const remote = net.connect({ host: addr.address, port: 443, family: addr.family });
      sockets.add(remote);
      remote.on('close', () => sockets.delete(remote));
      remote.setTimeout(30_000, () => remote.destroy());
      remote.on('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) remote.write(head);
        client.pipe(remote);
        remote.pipe(client);
      });
      remote.on('error', () => client.destroy());
      client.on('error', () => remote.destroy());
      client.on('close', () => remote.destroy());
    } catch {
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => {
      for (const socket of sockets) socket.destroy();
      server.close();
    },
  };
}
