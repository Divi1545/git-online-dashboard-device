import type { Metadata } from 'next'
import { Barlow } from 'next/font/google'
import './globals.css'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
})

export const metadata: Metadata = {
  title: 'Kiyanna AI — Hardware Dashboard',
  description: 'Operator dashboard for Kiyanna AI hardware devices',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${barlow.variable} font-barlow antialiased bg-[#0A0A0A] text-white`}>
        {children}
      </body>
    </html>
  )
}
