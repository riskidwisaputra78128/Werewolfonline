// Ubah build satu-file menjadi script klasik di akhir <body> (kompatibel Google Apps Script),
// lalu salin hasilnya ke folder deploy/ untuk Netlify, Vercel, GitHub Pages & Apps Script.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'client/dist-static/index.html');
let html = fs.readFileSync(src, 'utf8');
const open = html.indexOf('<script type="module" crossorigin>');
if (open < 0) throw new Error('script module tidak ditemukan');
const close = html.indexOf('</script>', open);
const code = html.slice(open + '<script type="module" crossorigin>'.length, close);
html = html.slice(0, open) + html.slice(close + '</script>'.length);
html = html.replace("</body>", () => `<script>\n${code}\n</script>\n</body>`);
fs.writeFileSync(src, html);

const out = path.join(root, 'deploy');
fs.mkdirSync(path.join(out, 'web'), { recursive: true });
fs.mkdirSync(path.join(out, 'apps-script'), { recursive: true });
fs.writeFileSync(path.join(out, 'web/index.html'), html);
fs.writeFileSync(path.join(out, 'apps-script/index.html'), html);
console.log('OK deploy/web/index.html & deploy/apps-script/index.html', (html.length / 1024).toFixed(0) + ' KB');
