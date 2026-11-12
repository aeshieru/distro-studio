// Style reference from a social link. Reads only public preview data (title, caption,
// thumbnail URL); it never downloads the video. TikTok and YouTube use their official
// oEmbed endpoints; Instagram and Facebook expose Open Graph tags on some public posts.
type Result = { status: number; json: unknown };

const HOSTS = /(^|\.)(instagram\.com|facebook\.com|fb\.watch|tiktok\.com|youtube\.com|youtu\.be)$/i;

function decode(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function meta(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re);
  return m ? decode(m[1] ?? m[2] ?? "").trim() : "";
}

export async function handleLink(body: string): Promise<Result> {
  let url: URL;
  try {
    url = new URL((JSON.parse(body) as { url: string }).url.trim());
  } catch {
    return { status: 400, json: { error: "bad_url", message: "That doesn't look like a link." } };
  }
  if (!/^https?:$/.test(url.protocol) || !HOSTS.test(url.hostname)) {
    return { status: 400, json: { error: "host", message: "Paste an Instagram, Facebook, TikTok or YouTube link." } };
  }
  const site = /tiktok/.test(url.hostname) ? "TikTok" : /youtu/.test(url.hostname) ? "YouTube" : /instagram/.test(url.hostname) ? "Instagram" : "Facebook";
  const headers = { "user-agent": "Mozilla/5.0 (compatible; BEAT link preview)", "accept-language": "en" };

  try {
    if (site === "TikTok" || site === "YouTube") {
      const endpoint = site === "TikTok" ? "https://www.tiktok.com/oembed?url=" : "https://www.youtube.com/oembed?format=json&url=";
      const r = await fetch(endpoint + encodeURIComponent(url.toString()), { headers });
      if (r.ok) {
        const j = (await r.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
        return { status: 200, json: { site, url: url.toString(), title: j.author_name ? `${j.author_name}` : "", caption: j.title ?? "", image: j.thumbnail_url ?? "", found: Boolean(j.title) } };
      }
    }
    const r = await fetch(url, { headers, redirect: "follow" });
    const html = r.ok ? (await r.text()).slice(0, 600_000) : "";
    const title = meta(html, "og:title") || meta(html, "twitter:title");
    const caption = meta(html, "og:description") || meta(html, "description");
    const image = meta(html, "og:image");
    const loginWall = /log ?in|sign ?up/i.test(title) && !caption;
    return { status: 200, json: { site, url: url.toString(), title: loginWall ? "" : title, caption: loginWall ? "" : caption, image, found: Boolean((title || caption) && !loginWall) } };
  } catch {
    return { status: 200, json: { site, url: url.toString(), title: "", caption: "", image: "", found: false } };
  }
}
