import { hasRole } from './roles.js';
import { slugify, withSuffix } from './slug.js';

describe('slugify', () => {
  it('normalizes names', () => {
    expect(slugify('Acme Inc.')).toBe('acme-inc');
    expect(slugify('  Café Über  ')).toBe('cafe-uber');
    expect(slugify('!!!')).toBe('workspace');
    expect(withSuffix('acme')).toMatch(/^acme-[0-9a-f]{6}$/);
  });
});

describe('hasRole', () => {
  it('ranks roles', () => {
    expect(hasRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRole('MEMBER', 'MEMBER')).toBe(true);
    expect(hasRole('VIEWER', 'MEMBER')).toBe(false);
  });
});
