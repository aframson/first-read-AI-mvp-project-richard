import './globals.css'

export const metadata = {
  title: 'FirstRead - AI-powered contract drafting',
  description: 'AI-powered contract drafting. Create first drafts in seconds, then customize and finalize with your own edits.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
