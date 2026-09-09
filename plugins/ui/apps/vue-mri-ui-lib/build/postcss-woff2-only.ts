import type { Plugin } from 'postcss'

/**
 * Keep only the WOFF2 source in each `@font-face` rule.
 *
 * Why this is necessary
 * --------------------
 * The build runs in Vite library mode. In library mode Vite ignores
 * `build.assetsInlineLimit` and inlines every asset as a base64 data URI,
 * whatever its size. Each font format named in a `@font-face` rule therefore
 * becomes part of `lifecycles.js`.
 *
 * `@mdi/font` uses the "bulletproof" `@font-face` syntax. That syntax names the
 * EOT file two times, then names WOFF2, WOFF and TTF. The result was 4.69 MiB of
 * icon font binary, which base64 expands to 6.25 MiB of the bundle, for a font
 * where browsers only ever read the 403 KiB WOFF2.
 *
 * Every browser that D2E supports reads WOFF2. WOFF2 shipped in Chrome 36,
 * Firefox 39, Safari 10 and Edge 14. Only IE11 needs the other formats, and this
 * application is Vue 3 on single-spa, which does not run on IE11.
 *
 * Behaviour
 * ---------
 * A rule is rewritten only when it already offers a WOFF2 source. `local()`
 * sources are kept, because they avoid a download altogether. A rule with no
 * WOFF2 source is left alone, so fonts that ship no WOFF2 file keep working.
 */

/** Split a comma separated `src` value, ignoring commas inside `()` or quotes. */
function splitSources(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ''

  for (const char of value) {
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

const isWoff2 = (source: string): boolean =>
  /format\(\s*['"]?woff2['"]?\s*\)/i.test(source) || /\.woff2(\?|#|['")]|$)/i.test(source)

const isLocal = (source: string): boolean => /^local\(/i.test(source)

export function postcssWoff2Only(): Plugin {
  return {
    postcssPlugin: 'woff2-only-font-src',
    AtRule: {
      'font-face': rule => {
        const declarations = rule.nodes?.filter(
          (node): node is typeof node & { prop: string; value: string } =>
            node.type === 'decl' && node.prop.toLowerCase() === 'src'
        )
        if (!declarations || declarations.length === 0) return

        const sources = declarations.flatMap(declaration => splitSources(declaration.value))
        const woff2 = sources.filter(isWoff2)
        if (woff2.length === 0) return

        const kept = [...sources.filter(isLocal), ...woff2]
        declarations[0].value = kept.join(', ')
        declarations.slice(1).forEach(declaration => declaration.remove())
      },
    },
  }
}

postcssWoff2Only.postcss = true
