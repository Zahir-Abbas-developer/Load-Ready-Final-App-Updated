import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

/**
 * The application chrome.
 *
 * Phone-first, because a pilot uses this on the road. On a desktop the screens
 * are still the phone-width layouts the design provides, so the shell centres
 * them rather than stretching designs that do not exist — but it drops the
 * device-emulator look and puts the navigation in a sidebar, where a desktop
 * user expects it. Real desktop layouts are derived per screen in later phases.
 *
 * Screens own their own tab state, so navigation is published upward through
 * context instead of being passed down through every screen.
 */

/**
 * Any lucide icon, or anything else that takes a className. Screens used to
 * type these as `any`, which lost every guarantee at the boundary.
 */
export type IconComponent = ComponentType<{ className?: string }>;

export interface NavItem {
  id: string;
  label: string;
  icon: IconComponent;
}

export interface NavConfig {
  items: NavItem[];
  active: string;
  onSelect: (id: string) => void;
}

interface ShellContext {
  nav: NavConfig | null;
  setNav: (nav: NavConfig | null) => void;
}

const Ctx = createContext<ShellContext | null>(null);

/**
 * Registers this screen's navigation with the shell.
 *
 * Takes the values the screen already holds, so nothing has to be lifted.
 */
export function useAppNav(nav: NavConfig | null) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppNav must be used inside AppShell");
  const { setNav } = ctx;

  const { items, active, onSelect } = nav ?? {};

  /*
   * Screens pass an inline arrow for onSelect, so its identity changes on every
   * render. Depending on it directly would re-register the navigation, which
   * sets state on the shell, which re-renders the screen — an endless loop.
   * The latest callback is kept in a ref and invoked through a stable wrapper.
   */
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const stableSelect = useCallback((id: string) => onSelectRef.current?.(id), []);

  // `items` is usually a literal too; compare by id list rather than identity.
  const key = items?.map((i) => i.id).join(",");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    if (!itemsRef.current || active === undefined) {
      setNav(null);
      return;
    }
    setNav({ items: itemsRef.current, active, onSelect: stableSelect });
    // Leaving the screen takes its navigation with it.
    return () => setNav(null);
  }, [key, active, stableSelect, setNav]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<NavConfig | null>(null);
  const ctx = useMemo(() => ({ nav, setNav }), [nav]);

  return (
    <Ctx.Provider value={ctx}>
      <div className="min-h-dvh w-full bg-surface-alt lg:flex lg:justify-center lg:gap-0">
        {nav && <DesktopSidebar nav={nav} />}

        <div
          className={[
            "relative flex min-h-dvh w-full flex-col bg-background",
            "lg:max-w-[480px] lg:border-x lg:border-border",
            // Room for the fixed bottom bar on phones only.
            nav ? "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0" : "",
          ].join(" ")}
        >
          {children}
        </div>
      </div>

      {nav && <MobileNav nav={nav} />}
    </Ctx.Provider>
  );
}

function DesktopSidebar({ nav }: { nav: NavConfig }) {
  return (
    <nav
      aria-label="Main"
      className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-background p-3 lg:flex"
    >
      {nav.items.map((item) => {
        const Icon = item.icon;
        const active = nav.active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => nav.onSelect(item.id)}
            aria-current={active ? "page" : undefined}
            className={[
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-surface hover:text-foreground",
            ].join(" ")}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function MobileNav({ nav }: { nav: NavConfig }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {nav.items.map((item) => {
        const Icon = item.icon;
        const active = nav.active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => nav.onSelect(item.id)}
            aria-current={active ? "page" : undefined}
            // 44px minimum target (WCAG 2.1 AA / CLAUDE.md rule 11).
            className={[
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 py-2 transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            ].join(" ")}
          >
            <Icon className="h-5 w-5" />
            <span className="text-[11px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
