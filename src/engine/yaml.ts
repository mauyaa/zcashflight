// A small YAML subset parser, enough for zcashflight.yml without pulling in a dependency.
// Supports: nested maps, block lists (including "- key: value" items), flow lists [a, b],
// flow maps {a: 1}, quoted/plain scalars, numbers, booleans, null, and # comments.

type Y = unknown;
interface Line { indent: number; text: string; no: number }

export class YamlError extends Error {}

export function parseYaml(src: string): Y {
  const lines: Line[] = [];
  src.split(/\r?\n/).forEach((raw, i) => {
    const text = stripComment(raw).replace(/\s+$/, '');
    if (!text.trim() || text.trim() === '---') return;
    if (/^\t/.test(raw)) throw new YamlError(`line ${i + 1}: tabs are not allowed for indentation`);
    lines.push({ indent: text.length - text.trimStart().length, text: text.trim(), no: i + 1 });
  });
  let pos = 0;

  function block(indent: number): Y {
    if (pos >= lines.length) return null;
    return lines[pos].text.startsWith('- ') || lines[pos].text === '-' ? list(lines[pos].indent) : map(indent);
  }

  function list(indent: number): Y[] {
    const out: Y[] = [];
    while (pos < lines.length && lines[pos].indent === indent && (lines[pos].text.startsWith('- ') || lines[pos].text === '-')) {
      const ln = lines[pos];
      const rest = ln.text.slice(1).trim();
      if (!rest) { pos++; out.push(pos < lines.length && lines[pos].indent > indent ? block(lines[pos].indent) : null); continue; }
      const kv = splitKey(rest);
      if (kv && !/^["'[{]/.test(rest)) {
        // "- key: value" opens a map whose further keys sit at the dash's content column
        const col = indent + (ln.text.length - rest.length);
        lines[pos] = { indent: col, text: rest, no: ln.no };
        out.push(map(col));
      } else { pos++; out.push(scalar(rest, ln.no)); }
    }
    return out;
  }

  function map(indent: number): Record<string, Y> {
    const out: Record<string, Y> = {};
    while (pos < lines.length && lines[pos].indent === indent) {
      const ln = lines[pos];
      if (ln.text.startsWith('- ')) break;
      const kv = splitKey(ln.text);
      if (!kv) throw new YamlError(`line ${ln.no}: expected "key: value"`);
      pos++;
      if (kv[1] !== '') out[kv[0]] = scalar(kv[1], ln.no);
      else if (pos < lines.length && (lines[pos].indent > indent || (lines[pos].indent === indent && lines[pos].text.startsWith('- ')))) out[kv[0]] = block(lines[pos].indent);
      else out[kv[0]] = null;
    }
    if (pos < lines.length && lines[pos].indent > indent) throw new YamlError(`line ${lines[pos].no}: unexpected indentation`);
    return out;
  }

  const v = block(lines[0]?.indent ?? 0);
  if (pos < lines.length) throw new YamlError(`line ${lines[pos].no}: could not parse`);
  return v;
}

function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

function splitKey(s: string): [string, string] | null {
  const m = /^("[^"]*"|'[^']*'|[^:[\]{}#"'][^:]*?)\s*:(?:\s+(.*)|$)/.exec(s);
  if (!m) return null;
  return [unquote(m[1].trim()), (m[2] ?? '').trim()];
}

function unquote(s: string): string {
  if (s.length >= 2 && s[0] === '"' && s.endsWith('"')) return JSON.parse(s);
  if (s.length >= 2 && s[0] === "'" && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function scalar(s: string, no: number): Y {
  if (s.startsWith('[') || s.startsWith('{')) return flow(s, no);
  if (/^"|^'/.test(s)) return unquote(s);
  if (s === 'true' || s === 'yes') return true;
  if (s === 'false' || s === 'no') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function flow(s: string, no: number): Y {
  let i = 0;
  const ws = () => { while (/\s/.test(s[i] ?? '')) i++; };
  function value(): Y {
    ws();
    if (s[i] === '[') { i++; const a: Y[] = []; ws(); if (s[i] === ']') { i++; return a; }
      for (;;) { a.push(value()); ws(); if (s[i] === ',') { i++; continue; } if (s[i] === ']') { i++; return a; } throw new YamlError(`line ${no}: bad flow list`); } }
    if (s[i] === '{') { i++; const o: Record<string, Y> = {}; ws(); if (s[i] === '}') { i++; return o; }
      for (;;) { ws(); const k = unquote(atom(':')); ws(); if (s[i++] !== ':') throw new YamlError(`line ${no}: bad flow map`); o[k] = value(); ws();
        if (s[i] === ',') { i++; continue; } if (s[i] === '}') { i++; return o; } throw new YamlError(`line ${no}: bad flow map`); } }
    return scalar(String(atom(',]}')), no);
  }
  function atom(stop: string): string {
    ws();
    const q = s[i];
    if (q === '"' || q === "'") { const j = s.indexOf(q, i + 1); const t = s.slice(i, j + 1); i = j + 1; return t; }
    const j0 = i; while (i < s.length && !stop.includes(s[i])) i++;
    return s.slice(j0, i).trim();
  }
  const v = value();
  return v;
}
