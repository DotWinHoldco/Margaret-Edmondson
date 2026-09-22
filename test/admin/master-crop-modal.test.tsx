import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import MasterCropModal, { type MasterCropTarget } from '@/components/admin/MasterCropModal'

const h = vi.hoisted(() => ({ send: vi.fn(), toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/api/client', () => ({ apiSend: h.send, errorMessage: (e: Error) => e.message }))
vi.mock('@/components/shared/toast/ToastProvider', () => ({ useToast: () => h.toast }))

const requestStamp = '2026-09-22T18:32:00.000Z'
const master: MasterCropTarget = {
  id: 'master', title: 'Potential', proxyUrl: '/preview',
  sourceWidthPx: 1000, sourceHeightPx: 1000,
  crop_box: { x: 0, y: 0, w: 1, h: 1 }, print_status: 'ready', print_error: null,
  print_requested_at: '2026-09-22T12:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  h.send.mockResolvedValue({ print_status: 'pending', print_requested_at: requestStamp })
})
afterEach(cleanup)

function editor(initial = master) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const view = render(<MasterCropModal master={initial} onClose={onClose} onSaved={onSaved} />)
  const image = screen.getByRole('img', { name: 'Potential' })
  Object.defineProperties(image, { naturalWidth: { value: 1000 }, naturalHeight: { value: 1000 } })
  fireEvent.load(image)
  return { onClose, onSaved, update: (next: Partial<MasterCropTarget>) => view.rerender(
    <MasterCropModal master={{ ...initial, ...next }} onClose={onClose} onSaved={onSaved} />,
  ) }
}

async function submitCrop() {
  fireEvent.change(screen.getByRole('combobox', { name: 'Print shape' }), { target: { value: '0.8' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save crop' }))
  fireEvent.click(screen.getByRole('button', { name: 'Yes, apply crop' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled())
}

describe('crop save completion', () => {
  it('blocks a repeated save while preparing and confirms completion once with Done', async () => {
    const page = editor()
    await submitCrop()
    expect(h.toast.success).not.toHaveBeenCalled()
    expect(screen.getByText(/You don’t need to save again/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Preparing…' }))
    expect(h.send).toHaveBeenCalledTimes(1)
    // A previous ready response must not be mistaken for this crop finishing.
    page.update({ print_status: 'ready' })
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    page.update({ print_status: 'processing', print_requested_at: requestStamp })
    page.update({ print_status: 'ready', print_requested_at: requestStamp })
    expect(screen.getByText('✓ Crop saved — your print file is ready.')).toBeVisible()
    expect(h.toast.success).toHaveBeenCalledTimes(1)
    page.update({ print_status: 'ready', print_requested_at: requestStamp })
    expect(h.toast.success).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(page.onClose).toHaveBeenCalledTimes(1)
    expect(h.send).toHaveBeenCalledTimes(1)
  })

  it('allows a genuinely edited crop during preparation or after completion', async () => {
    const page = editor()
    await submitCrop()
    fireEvent.change(screen.getByRole('combobox', { name: 'Print shape' }), { target: { value: '1' } })
    expect(screen.getByRole('button', { name: 'Save crop' })).toBeEnabled()
    page.update({ print_status: 'ready', print_requested_at: requestStamp })
    expect(screen.getByText(/You’ve made more changes since saving/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save crop' })).toBeEnabled()
  })

  it('does not claim success when a failed crop restores the previous ready file', async () => {
    const page = editor()
    await submitCrop()
    page.update({ print_status: 'ready', print_requested_at: requestStamp, print_error: 'Saving the print file took too long.' })
    expect(h.toast.success).not.toHaveBeenCalled()
    expect(h.toast.error).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save crop' })).toBeEnabled()
  })

  it('tracks a crop already being prepared when the editor is reopened', () => {
    const page = editor({ ...master, print_status: 'processing', print_requested_at: requestStamp })
    expect(screen.getByRole('button', { name: 'Preparing…' })).toBeDisabled()
    page.update({ print_status: 'ready' })
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled()
    expect(h.toast.success).toHaveBeenCalledTimes(1)
  })
})
