export function SiteBanner() {
  return (
    <site-info-banner
      position="bottom-right"
      size="md"
      theme="light"
      headline="Powered by bf.lu"
      details="© Map: geoportail.lu"
      logo-src="/assets/logo-transparent.png"
      logo-alt="bf.lu"
      href="https://geoportail.lu"
      collapse-after={30000}
    />
  );
}
