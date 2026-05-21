/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes]
 * @returns {Promise<any>}
 */
export function parseBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c.toString();
      if (body.length > maxBytes) {
        req.destroy(new Error('Payload Too Large'));
        reject(new Error('Payload Too Large'));
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (err) { reject(err); }
    });
  });
}

export function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
