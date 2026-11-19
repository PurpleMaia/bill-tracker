import type { Config } from "tailwindcss";

export default {
    // darkMode removed — Food+ is light-only
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Calendar milestone colors are class strings defined in src/lib.
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			olive: {
  				DEFAULT: 'hsl(var(--olive))',
  				dark: 'hsl(var(--olive-dark))',
  				soft: 'hsl(var(--olive-soft))'
  			},
  			'teal-light': 'hsl(var(--teal-light))',
  			coral: 'hsl(var(--coral))',
  			ochre: {
  				DEFAULT: 'hsl(var(--ochre))',
  				soft: 'hsl(var(--ochre-soft))'
  			}
  		},
  		// App-wide stacking layers, lowest to highest. Use these names for
  		// anything fixed/sticky at page level; plain z-0/z-10/z-20 stay fine for
  		// local stacking inside a single component.
  		zIndex: {
  			floating: '20', // scroll-to-top: tucks under the chrome on phones
  			chrome: '30', // app header, mobile tab bar, fixed bottom action bars
  			fab: '40', // bill-info FAB, floats above the chrome
  			overlay: '50', // dialogs, sheets, popovers, menus, tooltips, skip link
  			tour: '60', // welcome tour
  			spotlight: '70', // tour/spotlight dimmer + highlight ring
  			'spotlight-card': '71', // the step card above the spotlight
  			toast: '100' // toasts sit above everything
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			// A fixed-width halo (box-shadow spread) instead of `ping`'s scale(2):
  			// scaling a wide pill doubles its width, while a spread grows the
  			// same few px on every side. The 40–100% hold is a rest between pulses.
  			'soft-ping': {
  				'0%': {
  					boxShadow: '0 0 0 0 rgb(250 204 21 / 0.6)'
  				},
  				'40%, 100%': {
  					boxShadow: '0 0 0 6px rgb(250 204 21 / 0)'
  				}
  			},
  			// One-shot expanding red halo for the failed card's "Why?" pill.
  			'why-ring': {
  				'0%': {
  					boxShadow: '0 0 0 0 hsl(var(--destructive) / 0.55)'
  				},
  				'70%, 100%': {
  					boxShadow: '0 0 0 8px hsl(var(--destructive) / 0)'
  				}
  			},
  			// "Here it is" halo for a card the board just scrolled to (View on
  			// board): a teal spread that grows and fades, like the guide's
  			// spotlight but without dimming the page. Spread stays within the
  			// column's 8px padding so the scroll area doesn't clip it.
  			'focus-pulse': {
  				'0%': {
  					boxShadow: '0 0 0 0 hsl(var(--primary) / 0.45)'
  				},
  				'70%, 100%': {
  					boxShadow: '0 0 0 8px hsl(var(--primary) / 0)'
  				}
  			},
  			// Opacity-only mount-in, for places where movement would distract
  			// (the bill dialog's tabs, the version diff).
  			'fade-in': {
  				from: {
  					opacity: '0'
  				},
  				to: {
  					opacity: '1'
  				}
  			},
  			// Mount-in for content: fade while rising a few px into place.
  			'rise-in': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(8px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'none'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'soft-ping': 'soft-ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite',
  			'why-ring': 'why-ring 2.4s cubic-bezier(0, 0, 0.2, 1) 1',
  			// Staggered by a `--stagger` index (set inline, capped by the caller).
  			// `backwards` (not `both`) holds the hidden frame through the delay but
  			// leaves NO transform once finished: a lingering transform would make
  			// the element a containing block and break dnd's position:fixed drag.
  			'rise-in': 'rise-in 320ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--stagger, 0) * 45ms) backwards',
  			// Three pulses, then done (the board clears the highlight after).
  			'focus-pulse': 'focus-pulse 1.6s cubic-bezier(0, 0, 0.2, 1) 3',
  			// Same timing and stagger as rise-in, minus the movement.
  			'fade-in': 'fade-in 320ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--stagger, 0) * 45ms) backwards'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
