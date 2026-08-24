export function SiteBanner() {
  return (
    <site-info-banner
      position="bottom-left"
      size="md"
      theme="light"
      headline="Powered by BF.lu"
      details="Geoportail Luxembourg · v0.1.4"
      logo-src="/assets/logo-transparent.png"
      logo-alt="BF.lu"
      href="https://geoportail.lu"
      collapse-after={30000}
    />
  );
}
