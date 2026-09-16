const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export function publicAssetPath(assetPath: `/${string}`): string {
  return `${publicBasePath}${assetPath}`
}
