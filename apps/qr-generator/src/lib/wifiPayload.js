// Builds the payload string a phone camera's native QR/Wi-Fi handler parses
// to auto-join a network: WIFI:T:<sec>;S:<ssid>;P:<pass>;H:<bool>;;
//
// Per the (informal but widely-implemented) spec, the characters
// \ ; , : " are meta-characters inside S:/P: and must be backslash-escaped
// wherever they appear in the actual SSID/password — otherwise a network
// name or password containing e.g. a semicolon silently truncates the
// payload on scan. The backslash itself must be escaped first, or a
// password like `a\;b` would double-escape into `a\\;b` (semicolon still
// literal) instead of the correct `a\\\;b`.
const ESCAPE_CHARS = /[\\;,:"]/g;

export function escapeWifiField(value) {
  return String(value).replace(ESCAPE_CHARS, (ch) => `\\${ch}`);
}

// security: 'WPA' | 'WEP' | 'nopass'
export function buildWifiPayload({ ssid, password = '', security = 'WPA', hidden = false }) {
  const parts = [
    'WIFI:',
    `T:${security};`,
    `S:${escapeWifiField(ssid)};`,
  ];

  if (security !== 'nopass') {
    parts.push(`P:${escapeWifiField(password)};`);
  }

  parts.push(`H:${hidden ? 'true' : 'false'};`);
  parts.push(';');

  return parts.join('');
}
