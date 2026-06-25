const TARGET = 'https://api.mangadex.org';

export default async function handler(req, res) {
  const endpoint = Array.isArray(req.query.endpoint) ? req.query.endpoint[0] : req.query.endpoint;
  const safeEndpoint = endpoint && endpoint.startsWith('/') ? endpoint : `/${endpoint || ''}`;
  const url = new URL(`${TARGET}${safeEndpoint}`);

  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'endpoint') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => url.searchParams.append(key, item));
    } else if (value !== undefined) {
      url.searchParams.append(key, value);
    }
  }

  try {
    const upstream = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'tory-reader/1.0',
      },
    });

    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.setHeader('cache-control', upstream.headers.get('cache-control') || 's-maxage=60, stale-while-revalidate=300');
    res.send(await upstream.text());
  } catch {
    res.status(502).json({ result: 'error', errors: [{ detail: 'MangaDex proxy request failed.' }] });
  }
}
