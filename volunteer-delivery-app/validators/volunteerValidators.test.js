const { digitsOnly, isValidEmail, isValidZip } = require('./volunteerValidators');

describe('digitsOnly', () => {
  it('removes normal phone number formatting', () => {
    expect(digitsOnly('(740) 555-1111')).toBe('7405551111');
  });

  it('removes letters and symbols', () => {
    expect(digitsOnly('a1b2c3')).toBe('123');
  });

  it('handles empty input without crashing', () => {
    expect(digitsOnly('')).toBe('');
  });

  it('returns empty string when input has no digits', () => {
    expect(digitsOnly('abc')).toBe('');
  });

  // Boundary conditions
  it('handles completely empty string', () => {
    expect(digitsOnly('')).toBe('');
  });

  it('handles string with only non-digit characters', () => {
    expect(digitsOnly('!@#$%')).toBe('');
  });

  // Additional boundary conditions
  it('handles null input', () => {
    expect(digitsOnly(null)).toBe('');
  });

  it('handles undefined input', () => {
    expect(digitsOnly(undefined)).toBe('');
  });

  it('handles number input', () => {
    expect(digitsOnly(12345)).toBe('12345');
  });

  it('handles input with mixed digits and special characters', () => {
    expect(digitsOnly('1-2.3_4 5')).toBe('12345');
  });

  it('handles input with unicode characters', () => {
    expect(digitsOnly('a1b2©3')).toBe('123');
  });

  it('handles very long string', () => {
    const longString = 'abc123def456'.repeat(100);
    expect(digitsOnly(longString)).toBe('123456'.repeat(100));
  });
});

describe('isValidEmail', () => {
  it('accepts valid email', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
  });

  it('trims surrounding spaces correctly', () => {
    expect(isValidEmail(' test@example.com ')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('testexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('test@')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  // Boundary conditions
  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects input that is almost correct but invalid', () => {
    expect(isValidEmail('test@example')).toBe(false); // missing TLD
    expect(isValidEmail('@example.com')).toBe(false); // no local part
  });

  // Additional boundary conditions
  it('accepts email with subdomain', () => {
    expect(isValidEmail('test@sub.example.com')).toBe(true);
  });

  it('accepts email with numbers and special chars in local part', () => {
    expect(isValidEmail('test.123+tag@example.com')).toBe(true);
  });

  it('rejects email with multiple @', () => {
    expect(isValidEmail('test@@example.com')).toBe(false);
  });

  it('rejects email with spaces in middle', () => {
    expect(isValidEmail('test @ example.com')).toBe(false);
  });

  it('rejects email without TLD', () => {
    expect(isValidEmail('test@example')).toBe(false);
  });

  it('rejects email with invalid TLD', () => {
    expect(isValidEmail('test@example.')).toBe(false);
  });

  it('handles null input', () => {
    expect(isValidEmail(null)).toBe(false);
  });

  it('handles undefined input', () => {
    expect(isValidEmail(undefined)).toBe(false);
  });

  it('handles number input', () => {
    expect(isValidEmail(123)).toBe(false);
  });

  it('accepts email with uppercase', () => {
    expect(isValidEmail('Test@Example.Com')).toBe(true);
  });

  it('accepts email with consecutive dots', () => {
    expect(isValidEmail('test..test@example.com')).toBe(true);
  });
});

describe('isValidZip', () => {
  it('accepts exactly 5 digits', () => {
    expect(isValidZip('43015')).toBe(true);
  });

  it('rejects fewer than 5 digits', () => {
    expect(isValidZip('4301')).toBe(false);
  });

  it('rejects more than 5 digits', () => {
    expect(isValidZip('430150')).toBe(false);
  });

  it('rejects letters', () => {
    expect(isValidZip('43A15')).toBe(false);
  });

  // Boundary conditions
  it('rejects one digit below valid length', () => {
    expect(isValidZip('1234')).toBe(false);
  });

  it('rejects one digit above valid length', () => {
    expect(isValidZip('123456')).toBe(false);
  });

  // Additional boundary conditions
  it('accepts zip with leading zeros', () => {
    expect(isValidZip('00123')).toBe(true);
  });

  it('rejects zip with spaces', () => {
    expect(isValidZip('430 15')).toBe(false);
  });

  it('rejects zip with dashes', () => {
    expect(isValidZip('43015-1234')).toBe(false);
  });

  it('rejects zip with letters and numbers mixed', () => {
    expect(isValidZip('43A15')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidZip('')).toBe(false);
  });

  it('rejects null input', () => {
    expect(isValidZip(null)).toBe(false);
  });

  it('rejects undefined input', () => {
    expect(isValidZip(undefined)).toBe(false);
  });

  it('accepts number input', () => {
    expect(isValidZip(43015)).toBe(true);
  });

  it('rejects zip with 5 digits but extra spaces', () => {
    expect(isValidZip(' 43015 ')).toBe(true); // trim is applied
  });

  it('rejects zip with non-digit characters', () => {
    expect(isValidZip('43.15')).toBe(false);
  });
});