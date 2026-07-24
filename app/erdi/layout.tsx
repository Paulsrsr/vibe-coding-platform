import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  title: 'ERDI Intelligence Hub',
}

export default function ERDILayout({ children }: { children: ReactNode }) {
  // className makes Inter available as a loaded font; the page-level font stack
  // keeps "Ideal Sans" first so ADB machines with the licensed font use it.
  return <div className={inter.className}>{children}</div>
}
