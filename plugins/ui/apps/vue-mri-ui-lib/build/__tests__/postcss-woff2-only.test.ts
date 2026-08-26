import { describe, expect, it } from 'vitest'
import postcss from 'postcss'
import { postcssWoff2Only } from '../postcss-woff2-only'

const run = async (css: string): Promise<string> => {
  const result = await postcss([postcssWoff2Only()]).process(css, { from: undefined })
  return result.css
}

describe('postcssWoff2Only', () => {
  it('collapses the @mdi/font bulletproof syntax down to woff2', async () => {
    // @mdi/font names the EOT file in a src of its own, then names it a second
    // time together with woff2, woff and ttf. Both src declarations must go.
    const css = `@font-face {
  font-family: "Material Design Icons";
  src: url("../fonts/mdi.eot?v=7.4.47");
  src: url("../fonts/mdi.eot?#iefix&v=7.4.47") format("embedded-opentype"), url("../fonts/mdi.woff2?v=7.4.47") format("woff2"), url("../fonts/mdi.woff?v=7.4.47") format("woff"), url("../fonts/mdi.ttf?v=7.4.47") format("truetype");
  font-weight: normal;
}`
    const out = await run(css)

    expect(out).toContain('mdi.woff2')
    expect(out).not.toContain('.eot')
    expect(out).not.toContain('format("woff")')
    expect(out).not.toContain('truetype')
    expect(out.match(/src:/g)).toHaveLength(1)
    // Unrelated declarations survive.
    expect(out).toContain('font-weight: normal')
  })

  it('keeps local() sources, because they avoid a download', async () => {
    const css = `@font-face {
  font-family: 'app-more-icons';
  src: local('app-more-icons'), url('../assets/fonts/app-more-icons.woff2') format('woff2'), url('../assets/fonts/app-more-icons.woff') format('woff');
}`
    const out = await run(css)

    expect(out).toContain("local('app-more-icons')")
    expect(out).toContain('app-more-icons.woff2')
    expect(out).not.toContain('app-more-icons.woff)')
    expect(out).not.toContain("format('woff')")
  })

  it('leaves a rule alone when it offers no woff2', async () => {
    // app-FFH-icons ships woff and ttf only. Stripping those would break it.
    const css = `@font-face {
  font-family: 'app-FFH-icons';
  src: local('app-FFH-icons'), url('../assets/fonts/app-FFH-icons.woff') format('woff'), url('../assets/fonts/app-FFH-icons.ttf') format('truetype');
}`
    const out = await run(css)

    expect(out).toContain('app-FFH-icons.woff')
    expect(out).toContain('app-FFH-icons.ttf')
  })

  it('does not split on commas inside url() or format()', async () => {
    const css = `@font-face {
  font-family: 'inline';
  src: url("data:font/woff2;base64,AAAA,BBBB") format("woff2"), url("fallback.ttf") format("truetype");
}`
    const out = await run(css)

    expect(out).toContain('data:font/woff2;base64,AAAA,BBBB')
    expect(out).not.toContain('fallback.ttf')
  })

  it('recognises a woff2 url even when format() is absent', async () => {
    const css = `@font-face {
  font-family: 'no-format';
  src: url('../assets/fonts/thing.woff2'), url('../assets/fonts/thing.ttf');
}`
    const out = await run(css)

    expect(out).toContain('thing.woff2')
    expect(out).not.toContain('thing.ttf')
  })

  it('ignores src declarations outside @font-face', async () => {
    const css = `.thing { src: url('a.ttf'); }`
    const out = await run(css)

    expect(out).toContain("a.ttf")
  })
})
