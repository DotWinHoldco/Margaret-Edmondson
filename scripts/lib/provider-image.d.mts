export const MAX_PROVIDER_IMAGE_BYTES: number
export function providerImageProblem(input: { bytes: number; mimeType: string; path?: string }): string | null
export function prepareProviderImage(inputPath: string, jpegPath: string, maxBytes?: number): Promise<{
  path: string; bytes: number; format: string; mimeType: string; converted: boolean; jpegQuality?: number; quality?: { psnrDb: number; comparedChannels: number; meanAbsoluteDifference: number; maxDifference: number }
}>
