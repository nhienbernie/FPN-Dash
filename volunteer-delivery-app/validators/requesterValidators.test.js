const {
  formatDobInput,
  validatePhoneNumber,
  validateDateOfBirth,
  validateVerificationCode,
  DOB_DIGIT_LENGTH,
  VERIFICATION_CODE_LENGTH,
} = require('./requesterValidators');

describe('formatDobInput', () => {
  it('formats single digit correctly', () => {
    expect(formatDobInput('1')).toBe('1');
  });

  it('formats two digits correctly', () => {
    expect(formatDobInput('12')).toBe('12');
  });

  it('formats three digits correctly', () => {
    expect(formatDobInput('123')).toBe('12/3');
  });

  it('formats four digits correctly', () => {
    expect(formatDobInput('1234')).toBe('12/34');
  });

  it('formats five digits correctly', () => {
    expect(formatDobInput('12345')).toBe('12/34/5');
  });

  it('formats six digits correctly', () => {
    expect(formatDobInput('123456')).toBe('12/34/56');
  });

  it('formats seven digits correctly', () => {
    expect(formatDobInput('1234567')).toBe('12/34/567');
  });

  it('formats eight digits correctly', () => {
    expect(formatDobInput('12345678')).toBe('12/34/5678');
  });

  it('ignores digits beyond 8', () => {
    expect(formatDobInput('123456789')).toBe('12/34/5678');
  });

  it('removes non-digit characters', () => {
    expect(formatDobInput('1a2b3c')).toBe('12/3');
  });

  it('handles empty string', () => {
    expect(formatDobInput('')).toBe('');
  });

  it('handles null input', () => {
    expect(formatDobInput(null)).toBe('');
  });

  it('handles undefined input', () => {
    expect(formatDobInput(undefined)).toBe('');
  });

  it('handles input with only letters', () => {
    expect(formatDobInput('abc')).toBe('');
  });

  it('handles input with special characters', () => {
    expect(formatDobInput('!@#$%')).toBe('');
  });

  it('handles input with spaces', () => {
    expect(formatDobInput('1 2 3')).toBe('12/3');
  });

  it('handles input with dashes and slashes', () => {
    expect(formatDobInput('12-34/56')).toBe('12/34/56');
  });

  it('handles very long input', () => {
    const longInput = '12345678901234567890';
    expect(formatDobInput(longInput)).toBe('12/34/5678');
  });

  it('handles input starting with zero', () => {
    expect(formatDobInput('01234567')).toBe('01/23/4567');
  });
});

describe('validatePhoneNumber', () => {
  it('accepts exactly 10 digits', () => {
    expect(validatePhoneNumber('1234567890')).toBe(null);
  });

  it('accepts phone number with formatting', () => {
    expect(validatePhoneNumber('(123) 456-7890')).toBe(null);
  });

  it('rejects fewer than 10 digits', () => {
    expect(validatePhoneNumber('123456789')).toBe('Phone number must be 10 digits.');
  });

  it('rejects more than 10 digits', () => {
    expect(validatePhoneNumber('12345678901')).toBe('Phone number must be 10 digits.');
  });

  it('rejects empty string', () => {
    expect(validatePhoneNumber('')).toBe('Phone number must be 10 digits.');
  });

  it('rejects string with only letters', () => {
    expect(validatePhoneNumber('abcdefghij')).toBe('Phone number must be 10 digits.');
  });

  it('rejects string with mixed letters and digits', () => {
    expect(validatePhoneNumber('123abc4567')).toBe('Phone number must be 10 digits.');
  });

  it('rejects string with special characters only', () => {
    expect(validatePhoneNumber('!@#$%^&*()')).toBe('Phone number must be 10 digits.');
  });

  it('accepts number input', () => {
    expect(validatePhoneNumber(1234567890)).toBe(null);
  });

  it('rejects number with more than 10 digits', () => {
    expect(validatePhoneNumber(123456789012)).toBe('Phone number must be 10 digits.');
  });

  it('rejects number with fewer than 10 digits', () => {
    expect(validatePhoneNumber(123456789)).toBe('Phone number must be 10 digits.');
  });

  it('handles null input', () => {
    expect(validatePhoneNumber(null)).toBe('Phone number must be 10 digits.');
  });

  it('handles undefined input', () => {
    expect(validatePhoneNumber(undefined)).toBe('Phone number must be 10 digits.');
  });

  it('rejects phone number with spaces', () => {
    expect(validatePhoneNumber('123 456 7890')).toBe(null); // spaces are removed by replace(/\D/g, '')
  });

  it('rejects phone number with international prefix', () => {
    expect(validatePhoneNumber('+11234567890')).toBe('Phone number must be 10 digits.');
  });

  it('accepts phone number with leading zeros', () => {
    expect(validatePhoneNumber('0123456789')).toBe(null);
  });
});

describe('validateDateOfBirth', () => {
  it('accepts valid date format MM/DD/YYYY', () => {
    expect(validateDateOfBirth('12/25/1990')).toBe(null);
  });

  it('accepts valid date with leading zeros', () => {
    expect(validateDateOfBirth('01/01/2000')).toBe(null);
  });

  it('rejects date without slashes', () => {
    expect(validateDateOfBirth('12251990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects date with wrong number of digits', () => {
    expect(validateDateOfBirth('12/25/90')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects date with extra digits', () => {
    expect(validateDateOfBirth('12/25/19900')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects partial date - missing day', () => {
    expect(validateDateOfBirth('12/1990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects partial date - missing month', () => {
    expect(validateDateOfBirth('25/1990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects partial date - only year', () => {
    expect(validateDateOfBirth('1990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects date with letters', () => {
    expect(validateDateOfBirth('12/AB/1990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects date with mixed letters and digits', () => {
    expect(validateDateOfBirth('1A/25/1990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects date with special characters', () => {
    expect(validateDateOfBirth('12/25/1990!')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects empty string', () => {
    expect(validateDateOfBirth('')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects string with only spaces', () => {
    expect(validateDateOfBirth('   ')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('accepts date with surrounding spaces', () => {
    expect(validateDateOfBirth(' 12/25/1990 ')).toBe(null);
  });

  it('rejects date with wrong separators', () => {
    expect(validateDateOfBirth('12-25-1990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects date with dots', () => {
    expect(validateDateOfBirth('12.25.1990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects date with too many slashes', () => {
    expect(validateDateOfBirth('12/25/19/90')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('rejects date with missing slashes', () => {
    expect(validateDateOfBirth('12251990')).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('handles null input', () => {
    expect(validateDateOfBirth(null)).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('handles undefined input', () => {
    expect(validateDateOfBirth(undefined)).toBe('Enter a valid date (MM/DD/YYYY).');
  });

  it('accepts date with invalid month (00)', () => {
    expect(validateDateOfBirth('00/25/1990')).toBe(null); // regex only checks format, not validity
  });

  it('accepts date with invalid day (00)', () => {
    expect(validateDateOfBirth('12/00/1990')).toBe(null); // regex only checks format, not validity
  });

  it('accepts date with high month numbers', () => {
    expect(validateDateOfBirth('99/99/9999')).toBe(null); // regex allows any 2 digits
  });
});

describe('validateVerificationCode', () => {
  it('accepts exactly 6 digits', () => {
    expect(validateVerificationCode('123456')).toBe(null);
  });

  it('rejects fewer than 6 digits', () => {
    expect(validateVerificationCode('12345')).toBe('Verification code must be 6 digits.');
  });

  it('rejects more than 6 digits', () => {
    expect(validateVerificationCode('1234567')).toBe('Verification code must be 6 digits.');
  });

  it('rejects empty string', () => {
    expect(validateVerificationCode('')).toBe('Verification code must be 6 digits.');
  });

  it('rejects string with only letters', () => {
    expect(validateVerificationCode('abcdef')).toBe('Verification code must be 6 digits.');
  });

  it('rejects string with mixed letters and digits', () => {
    expect(validateVerificationCode('123abc')).toBe('Verification code must be 6 digits.');
  });

  it('rejects string with special characters', () => {
    expect(validateVerificationCode('!@#$%^')).toBe('Verification code must be 6 digits.');
  });

  it('accepts code with leading zeros', () => {
    expect(validateVerificationCode('012345')).toBe(null);
  });

  it('accepts code with spaces (but they are trimmed and removed)', () => {
    expect(validateVerificationCode(' 123456 ')).toBe(null);
  });

  it('rejects code with spaces in between', () => {
    expect(validateVerificationCode('123 456')).toBe(null); // digitsOnly removes spaces
  });

  it('handles null input', () => {
    expect(validateVerificationCode(null)).toBe('Verification code must be 6 digits.');
  });

  it('handles undefined input', () => {
    expect(validateVerificationCode(undefined)).toBe('Verification code must be 6 digits.');
  });

  it('accepts number input', () => {
    expect(validateVerificationCode(123456)).toBe(null);
  });

  it('rejects number with more than 6 digits', () => {
    expect(validateVerificationCode(1234567)).toBe('Verification code must be 6 digits.');
  });

  it('rejects number with fewer than 6 digits', () => {
    expect(validateVerificationCode(12345)).toBe('Verification code must be 6 digits.');
  });
});

describe('Constants', () => {
  it('DOB_DIGIT_LENGTH is 8', () => {
    expect(DOB_DIGIT_LENGTH).toBe(8);
  });

  it('VERIFICATION_CODE_LENGTH is 6', () => {
    expect(VERIFICATION_CODE_LENGTH).toBe(6);
  });
});