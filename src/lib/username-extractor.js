/**
 * Extract username from Claude API key name
 * Format: claude_code_key_{username}_{suffix}
 * Example: claude_code_key_hiep.dh_ggfy → hiep.dh
 */
export function extractUsername(keyName) {
  if (!keyName || typeof keyName !== 'string') return null;

  const parts = keyName.split('_');

  // Expected: ['claude', 'code', 'key', '{username}', '{suffix}']
  if (parts.length < 5 || parts[0] !== 'claude' || parts[1] !== 'code' || parts[2] !== 'key') {
    return null;
  }

  // Username is everything between 'key_' and last '_suffix'
  // Handle usernames with underscores (e.g., first_last)
  const usernameParts = parts.slice(3, -1);
  return usernameParts.join('_');
}

/**
 * Build keyId → username mapping from API keys array
 */
export function buildKeyUserMap(apiKeys) {
  const map = new Map();

  for (const key of apiKeys) {
    const username = extractUsername(key.name);
    if (username) {
      map.set(key.id, username);
    }
  }

  return map;
}
