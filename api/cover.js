const TARGET = 'https://uploads.mangadex.org/covers';

export default async function handler(req, res) {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const file = Array.isArray(req.query.file) ? req.query.file[0] : req.query.file;

  if (!id || !file || id.includes('/') || file.includes('/')) {
    res.status(400).json({ error: 'Invalid cover request.' });
    return;
  }

  try {
    const upstream = await fetch(`${TARGET}/${encodeURIComponent(id)}/${encodeURIComponent(file)}`, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        referer: 'https://mangadex.org/',
        'user-agent': 'tory-reader/1.0',
      },
    });

    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    res.setHeader('content-type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ error: 'Cover proxy request failed.' });
  }
}
