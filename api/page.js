export default async function handler(req, res) {
  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;

  if (!rawUrl) {
    res.status(400).json({ error: 'Missing page URL.' });
    return;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: 'Invalid page URL.' });
    return;
  }

  if (url.protocol !== 'https:' || !url.hostname.endsWith('.mangadex.network')) {
    res.status(400).json({ error: 'Unsupported page host.' });
    return;
  }

  try {
    const upstream = await fetch(url, {
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
    res.status(502).json({ error: 'Page proxy request failed.' });
  }
}
