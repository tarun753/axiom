import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title:       'Axiom — AI Evaluation Dashboard',
  description: 'Behavioral testing infrastructure for AI applications',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
