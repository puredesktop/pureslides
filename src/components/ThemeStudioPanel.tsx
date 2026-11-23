/**
 * Interactive Theme & Typography Studio (Design tab).
 *
 * Lets authors tune colors (Background, Ink, Accent, Surface, Inverse) with
 * live WCAG contrast ratio badges (AAA/AA/AA Large/Fail), pick from all
 * bundled OFL fonts in `src/fonts/registry.ts`, adjust base font size,
 * type scale ratio, and corner radius, invert Light/Dark, or reset to a stock
 * look — all writing cleanly through `customLook()` + `withCustomLook()`.
 */
import { useMemo } from 'react'
import { styled } from 'styled-components'
import { ACCENT } from '../constants'
import { BUNDLED_FAMILIES } from '../fonts/registry'
import {
  contrast,
  customLook,
  customLookFromHtml,
  isDark,
  mix,
  readableOn,
  type CustomLookSpec,
} from '../lib/customLook'
import { deckLook, lookFromHtml } from '../lib/deckLooks'
import { wcagBadge } from '../lib/deckHealth'

export interface ThemeStudioPanelProps {
  html: string
  look: string
  onApplyCustomLook: (spec: CustomLookSpec) => void
  onResetStockLook: (stockLookId: string) => void
}

function activeSpecFrom(html: string, lookId: string): CustomLookSpec {
  const existing = customLookFromHtml(html)
  if (existing) return existing
  const stock = deckLook(lookFromHtml(html) ?? lookId)
  return customLook({
    name: `${stock.label} Custom`,
    colors: {
      bg: stock.bg,
      ink: stock.ink,
      muted: stock.muted,
      accent: stock.accent,
      surface: stock.surface,
      line: stock.line,
      inverse: stock.inverse,
      onInverse: stock.onInverse,
      inverseMuted: stock.inverseMuted,
    },
    type: {
      heading: stock.type.heading,
      body: stock.type.body,
      mono: stock.type.mono,
      headingWeight: Number(stock.type.headingWeight) || 700,
      bodyWeight: Number(stock.type.bodyWeight) || 400,
      strongWeight: Number(stock.type.strongWeight) || 620,
      labelWeight: Number(stock.type.labelWeight) || 600,
      base: stock.type.base,
      ratio: stock.type.ratio,
      trackingDisplay: stock.type.tracking.display,
      trackingHeadline: stock.type.tracking.headline,
      trackingLabel: stock.type.tracking.label,
    },
    radius: 0,
  })
}

const HEADING_BODY_FONTS = BUNDLED_FAMILIES.filter(f => f.generic !== 'monospace')
const MONO_FONTS = BUNDLED_FAMILIES.filter(f => f.generic === 'monospace')

export function ThemeStudioPanel({
  html,
  look,
  onApplyCustomLook,
  onResetStockLook,
}: ThemeStudioPanelProps): React.ReactElement {
  const spec = useMemo(() => activeSpecFrom(html, look), [html, look])

  const inkContrast = useMemo(
    () => contrast(spec.colors.ink, spec.colors.bg),
    [spec.colors.ink, spec.colors.bg],
  )
  const accentContrast = useMemo(
    () => contrast(spec.colors.accent, spec.colors.bg),
    [spec.colors.accent, spec.colors.bg],
  )
  const inkRating = wcagBadge(inkContrast)
  const accentRating = wcagBadge(accentContrast)
  const darkTheme = isDark(spec.colors.bg)

  const commit = (
    patch: {
      colors?: Partial<CustomLookSpec['colors']>
      type?: Partial<CustomLookSpec['type']>
      radius?: number
    },
  ) => {
    try {
      const mergedColors = { ...spec.colors, ...(patch.colors ?? {}) }
      // Auto-recompute muted/line/onInverse when bg, ink, or inverse changes
      if (patch.colors?.bg || patch.colors?.ink) {
        const dark = isDark(mergedColors.bg)
        if (!patch.colors?.muted) {
          mergedColors.muted = mix(mergedColors.ink, mergedColors.bg, dark ? 0.32 : 0.38)
        }
        if (!patch.colors?.line) {
          mergedColors.line = mix(mergedColors.bg, mergedColors.ink, dark ? 0.18 : 0.16)
        }
      }
      if (patch.colors?.inverse && !patch.colors?.onInverse) {
        mergedColors.onInverse = readableOn(mergedColors.inverse)
        mergedColors.inverseMuted = mix(mergedColors.onInverse, mergedColors.inverse, 0.25)
      }
      const next = customLook({
        name: spec.name || 'Custom',
        colors: mergedColors,
        type: { ...spec.type, ...(patch.type ?? {}) },
        radius: patch.radius ?? spec.radius,
        motif: spec.motif ?? null,
        faces: spec.faces,
      })
      onApplyCustomLook(next)
    } catch {
      /* ignore invalid intermediate values */
    }
  }

  const toggleDarkLight = () => {
    const nextBg = darkTheme ? '#f8f9fc' : '#14191e'
    const nextInk = readableOn(nextBg)
    const nextSurface = mix(nextBg, nextInk, darkTheme ? 0.05 : 0.08)
    const nextLine = mix(nextBg, nextInk, darkTheme ? 0.16 : 0.18)
    const nextMuted = mix(nextInk, nextBg, darkTheme ? 0.38 : 0.32)
    commit({
      colors: {
        bg: nextBg,
        ink: nextInk,
        surface: nextSurface,
        line: nextLine,
        muted: nextMuted,
      },
    })
  }

  return (
    <StudioRoot aria-label="Theme & Typography Studio">
      <StudioHead>
        <StudioTitle>Theme Studio</StudioTitle>
        <HeadActions>
          <SmallBtn type="button" onClick={toggleDarkLight} title="Invert light and dark ground">
            {darkTheme ? 'Light' : 'Dark'}
          </SmallBtn>
          <SmallBtn
            type="button"
            onClick={() => onResetStockLook(look === 'custom' ? 'auto' : look)}
            title="Reset custom tokens back to stock look"
          >
            Reset
          </SmallBtn>
        </HeadActions>
      </StudioHead>

      <ContrastBar aria-label="WCAG contrast ratio">
        <ContrastItem>
          <ContrastLabel>Ink / Bg</ContrastLabel>
          <ContrastVal>{inkContrast.toFixed(1)}:1</ContrastVal>
          <WcagPill $rating={inkRating}>{inkRating}</WcagPill>
        </ContrastItem>
        <ContrastItem>
          <ContrastLabel>Accent / Bg</ContrastLabel>
          <ContrastVal>{accentContrast.toFixed(1)}:1</ContrastVal>
          <WcagPill $rating={accentRating}>{accentRating}</WcagPill>
        </ContrastItem>
      </ContrastBar>

      <SwatchGrid>
        {(
          [
            ['bg', 'Background'],
            ['ink', 'Ink'],
            ['accent', 'Accent'],
            ['surface', 'Surface'],
            ['inverse', 'Inverse'],
          ] as const
        ).map(([key, label]) => (
          <SwatchRow key={key}>
            <SwatchLabel htmlFor={`theme-color-${key}`}>{label}</SwatchLabel>
            <SwatchControl>
              <ColorInput
                id={`theme-color-${key}`}
                type="color"
                value={spec.colors[key]}
                aria-label={`${label} color`}
                onChange={event => commit({ colors: { [key]: event.currentTarget.value } })}
              />
              <HexCode>{spec.colors[key]}</HexCode>
            </SwatchControl>
          </SwatchRow>
        ))}
      </SwatchGrid>

      <SectionDivider />

      <SelectField>
        <label htmlFor="theme-font-heading">Heading font</label>
        <Select
          id="theme-font-heading"
          value={spec.type.heading}
          onChange={event => commit({ type: { heading: event.currentTarget.value } })}
        >
          {HEADING_BODY_FONTS.map(f => (
            <option key={f.family} value={f.family}>
              {f.family} ({f.generic})
            </option>
          ))}
        </Select>
      </SelectField>

      <SelectField>
        <label htmlFor="theme-font-body">Body font</label>
        <Select
          id="theme-font-body"
          value={spec.type.body}
          onChange={event => commit({ type: { body: event.currentTarget.value } })}
        >
          {HEADING_BODY_FONTS.map(f => (
            <option key={f.family} value={f.family}>
              {f.family} ({f.generic})
            </option>
          ))}
        </Select>
      </SelectField>

      <SelectField>
        <label htmlFor="theme-font-mono">Mono font</label>
        <Select
          id="theme-font-mono"
          value={spec.type.mono}
          onChange={event => commit({ type: { mono: event.currentTarget.value } })}
        >
          {MONO_FONTS.map(f => (
            <option key={f.family} value={f.family}>
              {f.family}
            </option>
          ))}
        </Select>
      </SelectField>

      <SectionDivider />

      <SliderField>
        <SliderHead>
          <label htmlFor="theme-base-size">Base size</label>
          <HexCode>{Math.round(spec.type.base)}px</HexCode>
        </SliderHead>
        <Range
          id="theme-base-size"
          type="range"
          min={18}
          max={32}
          step={1}
          value={Math.round(spec.type.base)}
          onChange={event => commit({ type: { base: Number(event.currentTarget.value) } })}
        />
      </SliderField>

      <SliderField>
        <SliderHead>
          <label htmlFor="theme-scale-ratio">Type scale</label>
          <HexCode>{spec.type.ratio.toFixed(2)}×</HexCode>
        </SliderHead>
        <Range
          id="theme-scale-ratio"
          type="range"
          min={1.15}
          max={1.55}
          step={0.01}
          value={spec.type.ratio}
          onChange={event => commit({ type: { ratio: Number(event.currentTarget.value) } })}
        />
      </SliderField>

      <SliderField>
        <SliderHead>
          <label htmlFor="theme-corner-radius">Corner radius</label>
          <HexCode>{Math.round(spec.radius)}px</HexCode>
        </SliderHead>
        <Range
          id="theme-corner-radius"
          type="range"
          min={0}
          max={24}
          step={1}
          value={Math.round(spec.radius)}
          onChange={event => commit({ radius: Number(event.currentTarget.value) })}
        />
      </SliderField>
    </StudioRoot>
  )
}

const StudioRoot = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--n-line, var(--pure-chrome-line));
`

const StudioHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

const StudioTitle = styled.span`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--n-ink, var(--platform-colors-text));
`

const HeadActions = styled.div`
  display: flex;
  gap: 4px;
`

const SmallBtn = styled.button`
  height: 22px;
  padding: 0 7px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: var(--n-ink, var(--platform-colors-text));
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: var(--n-hover, var(--pure-chrome-hover));
    border-color: ${ACCENT};
  }
`

const ContrastBar = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 7px 8px;
  border: 1px solid var(--n-fence, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-panel, var(--platform-colors-surface));
`

const ContrastItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const ContrastLabel = styled.span`
  font-size: 10px;
  color: var(--n-faint, var(--pure-chrome-soft));
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const ContrastVal = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--n-ink, var(--platform-colors-text));
`

const WcagPill = styled.span<{ $rating: string }>`
  align-self: flex-start;
  padding: 1px 5px;
  border-radius: 2px;
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: ${props =>
    props.$rating === 'Fail'
      ? 'var(--p-failed-text, #c62828)'
      : props.$rating === 'AA Large'
        ? 'var(--b-amber, #d99b00)'
        : 'var(--p-done-text, #2e7d32)'};
  color: ${props => (props.$rating === 'AA Large' ? '#1c1506' : '#ffffff')};
`

const SwatchGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const SwatchRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`

const SwatchLabel = styled.label`
  font-size: 12px;
  color: var(--n-soft, var(--pure-chrome-soft));
`

const SwatchControl = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`

const ColorInput = styled.input`
  width: 24px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
`

const HexCode = styled.span`
  font-family: var(--platform-typography-font-family-mono, monospace);
  font-size: 11px;
  color: var(--n-soft, var(--pure-chrome-soft));
  min-width: 56px;
  text-align: right;
`

const SectionDivider = styled.div`
  height: 1px;
  background: var(--n-fence, var(--pure-chrome-line));
`

const SelectField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  label {
    font-size: 11px;
    color: var(--n-soft, var(--pure-chrome-soft));
  }
`

const Select = styled.select`
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--n-line, var(--pure-chrome-line));
  border-radius: 3px;
  background: var(--n-sheet, var(--pure-chrome-surface));
  color: var(--n-ink, var(--platform-colors-text));
  font: inherit;
  font-size: 12px;
`

const SliderField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
`

const SliderHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  label {
    font-size: 11.5px;
    color: var(--n-soft, var(--pure-chrome-soft));
  }
`

const Range = styled.input`
  width: 100%;
  accent-color: ${ACCENT};
`
