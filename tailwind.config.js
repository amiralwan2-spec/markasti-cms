/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/index.html'],
  safelist: [
    // Dynamic color classes used in JS (status badges, activity log type colours, role colours)
    {
      pattern:
        /^(bg|text|border)-(emerald|blue|amber|teal|red|violet|slate|orange|green|gray|indigo|yellow|pink|purple|rose|lime|cyan|sky|fuchsia|neutral|stone|zinc)-(50|100|200|300|400|500|600|700|800|900)$/,
      variants: ['hover', 'focus'],
    },
    // Opacity utilities used dynamically
    { pattern: /^opacity-(0|5|10|20|25|30|40|50|60|70|75|80|90|95|100)$/ },
    // Animate
    'animate-spin', 'animate-pulse',
    // Hidden / display toggling done by JS
    'hidden', 'block', 'flex', 'inline-flex', 'grid',
    // Ring utilities (focus states)
    { pattern: /^ring-(2|4|8)$/ },
    { pattern: /^ring-offset-(0|1|2|4)$/ },
    // Pointer events
    'pointer-events-none', 'pointer-events-auto',
    // Common layout toggles
    'overflow-hidden', 'overflow-x-auto',
    // Active/state classes applied by JS
    'stat-card-active',
  ],
  theme: { extend: {} },
  plugins: [],
};
