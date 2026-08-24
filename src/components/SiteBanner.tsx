export function SiteBanner() {
  return (
    <site-info-banner
      position="bottom-left"
      size="sm"
      theme="dark"
      headline="© 2026 bobforgiarini"
      details="DWG → Geoportail · v0.1.3"
      href="https://github.com/bobforgiarini/dwg-to-geoportail"
      collapse-after={15000}
    />
  );
}
