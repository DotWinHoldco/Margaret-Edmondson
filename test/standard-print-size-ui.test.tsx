import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/shared/toast/ToastProvider', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
import VariantsTab, { builderPrintGeometry, type MasterPrintInfo } from '@/components/admin/VariantsTab'
import { centeredAspectCrop } from '@/components/admin/MasterCropModal'
import { partnerDimension, validateCustomSize } from '@/lib/pricing/size-tiers'
afterEach(() => cleanup())
const master: MasterPrintInfo = { width_px: 6400, height_px: 8000, print_width_px: 6400, print_height_px: 7800, print_status: 'ready', border_mode: 'full_bleed' }
const catalog = [{ medium: 'canvas' as const, name: 'Canvas', subcategory_id: 101002, option_ids: [2], sizes: [], enabled: true, last_synced_at: null }]
const renderBuilder = (value = master, crop = vi.fn()) => render(<VariantsTab productId="fixture" productDefaultMargin={100} variants={[]} mediumCatalog={catalog} master={value} onEditCrop={crop} />)

describe('standard print size choice', () => {
  it('keeps 16×20 exactly selected and asks for a crop instead of silently creating 16×19.5', () => {
    const crop = vi.fn()
    renderBuilder(master, crop)
    fireEvent.click(screen.getByRole('button', { name: '+ Add print size' }))
    expect(screen.getByLabelText('Print size')).toHaveValue('16x20')
    expect(screen.getByLabelText('Height (in)')).toHaveValue(20)
    expect(screen.getByLabelText('Width (in)')).toHaveValue(16)
    expect(screen.getByLabelText('Height (in)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save as Draft' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare crop for 16 × 20' }))
    expect(crop).toHaveBeenCalledWith(0.8)
  })
  it('only uses proportional 19.5 when the owner explicitly chooses custom shape', () => {
    renderBuilder()
    fireEvent.click(screen.getByRole('button', { name: '+ Add print size' }))
    fireEvent.change(screen.getByLabelText('Print size'), { target: { value: 'custom' } })
    expect(screen.getByLabelText('Height (in)')).toHaveValue(19.5)
    expect(screen.getByLabelText('Variant name')).toHaveValue('16 × 19.5 in')
    fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '8' } })
    expect(screen.getByLabelText('Variant name')).toHaveValue('8 × 9.75 in')
    fireEvent.change(screen.getByLabelText('Variant name'), { target: { value: 'My custom print' } })
    fireEvent.change(screen.getByLabelText('Width (in)'), { target: { value: '16' } })
    expect(screen.getByLabelText('Variant name')).toHaveValue('My custom print')
    expect(screen.getByLabelText('Width (in)')).toBeEnabled()
  })
  it('uses raw geometry during a pending crop and disables adding sizes until processing finishes', () => {
    const pending = { ...master, print_status: 'pending' }
    expect(builderPrintGeometry(pending)).toEqual({ printW: 6400, printH: 8000, hasPrintMaster: false })
    renderBuilder(pending)
    expect(screen.getByRole('button', { name: '+ Add print size' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Generate S/M/L' })).toBeDisabled()
  })
})

describe('standard crop geometry', () => {
  it('converts source proportions into the preview without stretching or trusting preview rounding', () => {
    const box = centeredAspectCrop(427, 520, 16 / 20, 6400 / 7800)
    const sourceWidth = box.w / 427 * 6400
    const sourceHeight = box.h / 520 * 7800
    expect(sourceWidth / sourceHeight).toBeCloseTo(0.8, 10)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.w).toBeLessThanOrEqual(427)
    expect(box.y + box.h).toBeLessThanOrEqual(520)
  })
  it('accepts a real 4:5 print file at16×20 but rejects the old mismatched file', () => {
    const ctx = { bounds: { minW: 1, minH: 1, maxW: 50, maxH: 50 }, dpi: 200 }
    expect(partnerDimension(16, 'width', 6400 / 7800)).toBe(19.5)
    expect(validateCustomSize({ widthIn: 16, heightIn: 20 }, { ...ctx, ratio: 6400 / 7800, printPx: { width: 6400, height: 7800 } }).ok).toBe(false)
    expect(validateCustomSize({ widthIn: 16, heightIn: 20 }, { ...ctx, ratio: 0.8, printPx: { width: 6240, height: 7800 } }).ok).toBe(true)
  })
})
