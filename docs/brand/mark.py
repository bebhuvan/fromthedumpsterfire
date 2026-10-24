# Source of the brand mark (docs/DESIGN.md, Brand). mark(fill, size, cy) returns SVG for a 100-unit box;
# the app icon, favicon, Android foreground/monochrome, splash and notification icons and the header
# masks were rendered from it with headless Chrome on 2026-10-24.
# The G4 mark: one ember flame with the globe cut out of it. Drawn in a 100-unit box.
FLAME="M50 12C55.6 23 62 30.6 61 41.4 60.3 48 55.8 52.4 50 52.4 44.2 52.4 39.8 48 39.6 42 39.4 35.6 43.4 31 46.2 25.8c.9 4.4 2.4 6.8 4.8 7.6C52.6 26.8 52 19.6 50 12Z"
def mark(fill, size=1.0, cy=53, mid='g'):
    s=1.6*size
    G=f'translate(50 {cy}) scale({s}) translate(-50 -42)'
    globe='<g transform="translate(50 52)"><circle r="11" fill="none" stroke="#000" stroke-width="1.6"/><ellipse rx="4.8" ry="11" fill="none" stroke="#000" stroke-width="1.3"/><line x1="-11" x2="11" stroke="#000" stroke-width="1.3"/></g>'
    flame=f'<g transform="translate(50 56) scale(1.05) translate(-50 -56)"><path d="{FLAME}" transform="translate(0 4) scale(1 1.05)" fill="{fill}"/></g>'
    return (f'<defs><mask id="{mid}" maskUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200"><rect x="-50" y="-50" width="200" height="200" fill="#fff"/>'
            f'<g transform="{G}">{globe}</g></mask></defs><g mask="url(#{mid})"><g transform="{G}">{flame}</g></g>')
