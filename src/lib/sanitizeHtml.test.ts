import { describe, expect, it } from 'vitest';
import { buildEmailSrcDoc, EMAIL_IFRAME_SANDBOX, sanitizeEmailHtml } from './sanitizeHtml';

const dirty = [
  '<p>Hello</p>',
  '<script>alert(\'xss\')</script>',
  '<img src="https://images.example.com/banner.png" alt="Banner" onerror="alert(1)">',
  '<a href="javascript:alert(1)">bad</a>',
  '<a href="https://example.com/rome">ok</a>',
  '<p style="background-image:url(https://images.example.com/bg.png)">Come hungry.</p>',
  '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" alt="svg">',
].join('');

describe('sanitizeEmailHtml', () => {
  it('strips scripts, event handlers, javascript links, and remote images by default', () => {
    const html = sanitizeEmailHtml(dirty, false);
    expect(html.toLowerCase()).not.toContain('<script');
    expect(html).not.toContain('alert');
    expect(html).not.toContain('images.example.com');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:image/svg');
    expect(html).toContain('Remote image blocked');
    expect(html).toContain('https://example.com/rome');
    expect(html).toContain('noopener');
    expect(html).toContain('Hello');
  });

  it('keeps remote images only when asked', () => {
    const html = sanitizeEmailHtml('<img src="https://images.example.com/a.png" alt="Banner">', true);
    expect(html).toContain('https://images.example.com/a.png');
    expect(html).not.toContain('Remote image blocked');
  });

  it('wraps blockquotes so quoted HTML can collapse', () => {
    const html = sanitizeEmailHtml('<p>New</p><blockquote>Old reply</blockquote>', false);
    expect(html).toContain('<details class="quoted-reply">');
    expect(html).toContain('Quoted text');
  });
});

describe('email frame', () => {
  it('does not allow scripts in the sandbox', () => {
    const tokens = EMAIL_IFRAME_SANDBOX.split(' ');
    expect(tokens).not.toContain('allow-scripts');
    expect(tokens).not.toContain('allow-top-navigation');
    expect(tokens).toContain('allow-same-origin');
  });

  it('ships a locked-down document and omits remote URLs until enabled', () => {
    const blocked = buildEmailSrcDoc(dirty, { allowRemoteImages: false, theme: 'dark' });
    expect(blocked).toContain("default-src 'none'");
    expect(blocked).toContain('img-src data: blob:;');
    expect(blocked).toContain('color-scheme: dark');
    expect(blocked).not.toContain('https://images.example.com');
    expect(blocked.toLowerCase()).not.toContain('<script');

    const allowed = buildEmailSrcDoc('<img src="https://images.example.com/a.png" alt="">', {
      allowRemoteImages: true,
      theme: 'light',
    });
    expect(allowed).toContain('img-src data: blob: https: http:;');
    expect(allowed).toContain('https://images.example.com/a.png');
  });
});
