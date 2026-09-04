import { describe, it, expect } from 'vitest'
import {
  buildXAxisTitle,
  INTERACTIVE_SELECTORS,
  stripInteractiveSVG,
  truncateTextToWidth,
  wrapTextByWidth,
  wrapTextToLineLimit,
} from '../ExportUtils'

const SVG_NS = 'http://www.w3.org/2000/svg'

function makeSvg(innerHTML: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
  svg.innerHTML = innerHTML
  document.body.appendChild(svg)
  return svg
}

describe('stripInteractiveSVG', () => {
  it('removes .draglayer elements', () => {
    const svg = makeSvg('<g class="draglayer"><rect/></g><g class="plot"></g>')
    stripInteractiveSVG(svg)
    expect(svg.querySelector('.draglayer')).toBeNull()
    expect(svg.querySelector('.plot')).not.toBeNull()
  })

  it('removes all modebar-related elements', () => {
    const svg = makeSvg(`
      <g class="modebar-container">
        <g class="modebar">
          <g class="modebar-group">
            <a class="modebar-btn"><svg/></a>
          </g>
        </g>
      </g>
    `)
    stripInteractiveSVG(svg)
    for (const sel of ['.modebar-container', '.modebar', '.modebar-group', '.modebar-btn']) {
      expect(svg.querySelector(sel)).toBeNull()
    }
  })

  it('removes .select-outline elements', () => {
    const svg = makeSvg('<path class="select-outline"/><g class="barlayer"></g>')
    stripInteractiveSVG(svg)
    expect(svg.querySelector('.select-outline')).toBeNull()
    expect(svg.querySelector('.barlayer')).not.toBeNull()
  })

  it('preserves axis-title groups (.g-ytitle and .g-xtitle)', () => {
    const svg = makeSvg(`
      <g class="infolayer">
        <g class="g-ytitle"><text class="ytitle">Y Label</text></g>
        <g class="g-xtitle"><text class="xtitle">X Label</text></g>
        <g class="modebar-container"><a class="modebar-btn"/></g>
        <g class="draglayer"><rect/></g>
      </g>
    `)
    stripInteractiveSVG(svg)
    expect(svg.querySelector('.g-ytitle')).not.toBeNull()
    expect(svg.querySelector('.g-xtitle')).not.toBeNull()
    expect(svg.querySelector('.ytitle')?.textContent).toBe('Y Label')
    expect(svg.querySelector('.xtitle')?.textContent).toBe('X Label')
  })

  it('strips interactive elements while preserving axis titles in the same infolayer', () => {
    const svg = makeSvg(`
      <g class="infolayer">
        <g class="g-ytitle"><text class="ytitle">Revenue</text></g>
        <g class="modebar-container"><a class="modebar-btn"/></g>
        <g class="draglayer"><rect/></g>
      </g>
    `)
    stripInteractiveSVG(svg)
    expect(svg.querySelector('.modebar-container')).toBeNull()
    expect(svg.querySelector('.draglayer')).toBeNull()
    expect(svg.querySelector('.g-ytitle')).not.toBeNull()
  })

  it('is a no-op when no interactive elements are present', () => {
    const svg = makeSvg('<g class="barlayer"><rect/></g><g class="infolayer"><g class="g-ytitle"/></g>')
    const before = svg.innerHTML
    stripInteractiveSVG(svg)
    expect(svg.innerHTML).toBe(before)
  })

  it('exports INTERACTIVE_SELECTORS with the expected classes', () => {
    expect(INTERACTIVE_SELECTORS).toContain('.draglayer')
    expect(INTERACTIVE_SELECTORS).toContain('.modebar-container')
    expect(INTERACTIVE_SELECTORS).toContain('.modebar-btn')
    expect(INTERACTIVE_SELECTORS).toContain('.select-outline')
    // axis-title classes must NOT be in the selector list
    expect(INTERACTIVE_SELECTORS).not.toContain('.g-ytitle')
    expect(INTERACTIVE_SELECTORS).not.toContain('.g-xtitle')
    expect(INTERACTIVE_SELECTORS).not.toContain('.ytitle')
  })
})

describe('buildXAxisTitle', () => {
  it('formats two x-axis categories as {x2}/{x1}', () => {
    const categories = [
      { id: 'patient.attributes.diagnosis', axis: 1, name: 'Diagnosis' },
      { id: 'patient.attributes.stage', axis: 1, name: 'Stage' },
    ]
    expect(buildXAxisTitle(categories)).toBe('Stage/Diagnosis')
  })

  it('returns the single x-axis name when only one x-axis category is present', () => {
    const categories = [{ id: 'patient.attributes.diagnosis', axis: 1, name: 'Diagnosis' }]
    expect(buildXAxisTitle(categories)).toBe('Diagnosis')
  })

  it('ignores y-axis categories', () => {
    const categories = [
      { id: 'patient.attributes.diagnosis', axis: 1, name: 'Diagnosis' },
      { id: 'patient.attributes.cohort', axis: 2, name: 'Cohort' },
    ]
    expect(buildXAxisTitle(categories)).toBe('Diagnosis')
  })

  it('ignores the dummy_category placeholder', () => {
    const categories = [
      { id: 'dummy_category', axis: 1, name: 'Current Cohort' },
      { id: 'patient.attributes.stage', axis: 1, name: 'Stage' },
    ]
    expect(buildXAxisTitle(categories)).toBe('Stage')
  })

  it('returns an empty string for missing or empty categories', () => {
    expect(buildXAxisTitle(undefined as any)).toBe('')
    expect(buildXAxisTitle([])).toBe('')
  })
})

// Stub context whose measured width equals the string's character count, so
// `maxWidth` behaves like a character limit and the assertions read naturally.
const charWidthCtx = {
  measureText: (s: string) => ({ width: s.length }),
} as unknown as CanvasRenderingContext2D

describe('wrapTextByWidth', () => {
  it('keeps short text on a single line', () => {
    expect(wrapTextByWidth(charWidthCtx, 'Short label', 80)).toEqual(['Short label'])
  })

  it('wraps on word boundaries so no line exceeds the width', () => {
    const lines = wrapTextByWidth(charWidthCtx, 'one two three four five', 8)
    expect(lines).toEqual(['one two', 'three', 'four', 'five'])
    lines.forEach(line => expect(line.length).toBeLessThanOrEqual(8))
  })

  it('wraps a long label at the given width', () => {
    const text = 'a '.repeat(60).trim() // 60 single-char words → 119 chars total
    const lines = wrapTextByWidth(charWidthCtx, text, 80)
    expect(lines.length).toBeGreaterThan(1)
    lines.forEach(line => expect(line.length).toBeLessThanOrEqual(80))
  })

  it('hard-breaks a single word wider than the limit', () => {
    const lines = wrapTextByWidth(charWidthCtx, 'x'.repeat(25), 10)
    expect(lines).toEqual(['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxx'])
  })

  it('hard-breaks a wide word while preserving surrounding words', () => {
    const lines = wrapTextByWidth(charWidthCtx, `start ${'y'.repeat(12)} end`, 10)
    expect(lines).toEqual(['start', 'yyyyyyyyyy', 'yy end'])
  })

  it('returns a single empty line for empty input', () => {
    expect(wrapTextByWidth(charWidthCtx, '', 80)).toEqual([''])
  })

  it('measures rendered width, not character count', () => {
    // Each glyph is 2px wide here, so a 10px limit fits at most 5 characters.
    const wideCtx = {
      measureText: (s: string) => ({ width: s.length * 2 }),
    } as unknown as CanvasRenderingContext2D
    const lines = wrapTextByWidth(wideCtx, 'aaa bbb ccc', 10)
    expect(lines).toEqual(['aaa', 'bbb', 'ccc'])
    lines.forEach(line => expect(line.length * 2).toBeLessThanOrEqual(10))
  })
})

describe('truncateTextToWidth', () => {
  it('shortens text until it fits alongside the ellipsis', () => {
    expect(truncateTextToWidth(charWidthCtx, 'abcdefgh', 5)).toBe('ab...')
  })

  it('marks text that already fits as cut off', () => {
    expect(truncateTextToWidth(charWidthCtx, 'ab', 10)).toBe('ab...')
  })

  it('drops the whitespace exposed by the cut', () => {
    expect(truncateTextToWidth(charWidthCtx, 'abc def', 7)).toBe('abc...')
  })

  it('returns just the ellipsis when nothing else fits', () => {
    expect(truncateTextToWidth(charWidthCtx, 'abc', 1)).toBe('...')
  })
})

describe('wrapTextToLineLimit', () => {
  it('leaves text that fits within the limit untouched', () => {
    expect(wrapTextToLineLimit(charWidthCtx, 'one two three', 10, 3)).toEqual(['one two', 'three'])
  })

  it('caps the line count and ellipsises the last kept line', () => {
    const lines = wrapTextToLineLimit(charWidthCtx, 'one two three four five six seven', 10, 3)
    expect(lines).toEqual(['one two', 'three four', 'five si...'])
    lines.forEach(line => expect(line.length).toBeLessThanOrEqual(10))
  })

  it('keeps a hard-broken long word within the line limit', () => {
    const lines = wrapTextToLineLimit(charWidthCtx, 'x'.repeat(50), 10, 3)
    expect(lines).toEqual(['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxxxx...'])
  })

  it('returns a single empty line for empty input', () => {
    expect(wrapTextToLineLimit(charWidthCtx, '', 10, 3)).toEqual([''])
  })
})
