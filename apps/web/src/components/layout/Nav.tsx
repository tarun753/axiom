import Link from 'next/link'

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-fog2 bg-void/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-between">
        <Link href="/" className="font-serif text-sm tracking-widest text-paper">
          AXIOM
        </Link>
        <div className="flex items-center gap-6">
          {[
            { href: '/',        label: 'Dashboard' },
            { href: '/runs',    label: 'Runs'      },
          ].map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-[11px] uppercase tracking-[0.2em] text-mist hover:text-paper transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
