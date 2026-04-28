const { digitsOnly } = require('./volunteerValidators');

// Constants
const DOB_DIGIT_LENGTH = 8;
const VERIFICATION_CODE_LENGTH = 6;

// To automatically format input as the user types their DOB
const formatDobInput = (value = "") => {
  const digits = digitsOnly(value).slice(0, DOB_DIGIT_LENGTH);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const validatePhoneNumber = (value) => {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 10 ? null : "Phone number must be 10 digits.";
};

const validateDateOfBirth = (value) => {
  const trimmed = String(value).trim();
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return "Enter a valid date (MM/DD/YYYY).";
  }
  return null;
};

const validateVerificationCode = (value) => {
  const trimmed = String(value).trim();
  const digits = digitsOnly(trimmed);
  if (digits.length !== VERIFICATION_CODE_LENGTH) {
    return "Verification code must be 6 digits.";
  }
  return null;
};

module.exports = {
  formatDobInput,
  validatePhoneNumber,
  validateDateOfBirth,
  validateVerificationCode,
  DOB_DIGIT_LENGTH,
  VERIFICATION_CODE_LENGTH,
};