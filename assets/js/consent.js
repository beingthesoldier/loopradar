// The consent tick at every sign-in form: unticked by default, required, separate from everything else,
// as the law on personal data asks (the consent itself is its own page: legal/consent.html).
// base: the path from the current page to the site root ('' on the site, '../' in the studio).
export function consentBox(base = '') {
  const label = document.createElement('label'); label.className = 'consent';
  const box = document.createElement('input'); box.type = 'checkbox'; box.required = true; box.name = 'pd-consent';
  const text = document.createElement('span');
  const a = (href, t) => { const l = document.createElement('a'); l.href = base + href; l.textContent = t; l.target = '_blank'; l.rel = 'noopener'; return l; };
  text.append('I agree to the ', a('legal/consent.html', 'processing of my personal data'), ' (', a('legal/privacy.html', 'privacy policy'), ')');
  label.append(box, text);
  return label;
}
