import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import Logo from "./Logo";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  disabled?: boolean;
}

const navItems: NavItem[] = [
  { to: "/", label: "Search", end: true },
  { to: "/review-queue", label: "Review queue" },
  { to: "/category-mapping", label: "Category mapping", disabled: true },
];

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-canvas text-ink">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-line sticky top-0 z-30 shadow-2xs">
        <Logo size="sm" />
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="p-2 rounded-xl border border-line text-ink hover:bg-surface-subtle hover:border-brand transition-colors focus:outline-hidden"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile Backdrop Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar (Desktop Sticky + Mobile Slide Drawer) */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-72 md:w-64 shrink-0 border-r border-line bg-surface flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Logo & Space for Rounded Brand Logo */}
          <div className="px-5 py-5 border-b border-line/70 flex items-center justify-between">
            <Logo size="md" />
            {/* Close button on mobile drawer */}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-subtle transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="p-3 flex flex-col gap-1.5 mt-2">
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted/80">
              Menu
            </div>
            {navItems.map((item) =>
              item.disabled ? (
                <span
                  key={item.label}
                  className="px-3.5 py-2.5 rounded-xl text-sm text-muted/60 cursor-not-allowed flex items-center justify-between"
                  title="Coming soon"
                >
                  {item.label}
                  <span className="text-[10px] uppercase tracking-wide bg-surface-subtle border border-line px-1.5 py-0.5 rounded-md text-muted">
                    soon
                  </span>
                </span>
              ) : (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-between ${
                      isActive
                        ? "bg-brand-soft text-brand shadow-xs border border-brand/10 font-semibold"
                        : "text-ink/80 hover:bg-surface-subtle hover:text-ink"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span>{item.label}</span>
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>
                      )}
                    </>
                  )}
                </NavLink>
              ),
            )}
          </nav>
        </div>

        {/* User / Footer in Sidebar */}
        <div className="p-3.5 border-t border-line m-2.5 rounded-2xl bg-surface-subtle flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-brand/10 text-brand font-bold text-xs flex items-center justify-center border border-brand/20 shrink-0">
            AD
          </div>
          <div className="flex flex-col min-w-0">
            <p className="text-xs font-semibold text-ink truncate">Admin User</p>
            <p className="text-[11px] text-muted truncate">admin@redstore.am</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 bg-canvas">
        <Outlet />
      </main>
    </div>
  );
}