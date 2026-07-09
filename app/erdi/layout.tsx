import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'ERDI Intelligence Hub',
}

// ADB Branding: Ideal Sans (primary typeface) is specified in the CSS font stack.
// For ADB-issued machines, it is installed by default.
// To support non-ADB devices, add the licensed web font here:
//   <link rel="stylesheet" href="<ADB TypeKit / CDN URL for Ideal Sans>" />
// Contact ADB IT / Brand Management for the licensed web font URL.

export default function ERDILayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
