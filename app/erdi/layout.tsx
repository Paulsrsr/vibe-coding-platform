import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'ERDI Data Portal',
}

export default function ERDILayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
