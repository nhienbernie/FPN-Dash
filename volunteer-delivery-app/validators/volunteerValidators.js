const digitsOnly = (value = "") => String(value).replace(/\D/g, "");

const isValidEmail = (value = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

const isValidZip = (value = "") => /^\d{5}$/.test(String(value).trim());

const buildInitialValues = (fields = []) =>
  Object.fromEntries(fields.map((field) => [field.key, ""]));

const validateFieldSet = ({ fields = [], values = {}, keys }) => {
  const nextErrors = {};
  const allowedKeys = keys ? new Set(keys) : null;

  fields.forEach((field) => {
    if (allowedKeys && !allowedKeys.has(field.key)) {
      return;
    }

    const value = String(values[field.key] ?? "");
    const trimmedValue = value.trim();

    if (field.required && !trimmedValue) {
      nextErrors[field.key] = `${field.label} is required.`;
      return;
    }

    if (trimmedValue && typeof field.validate === "function") {
      const validationError = field.validate(value, values);
      if (validationError) {
        nextErrors[field.key] = validationError;
      }
    }
  });

  return nextErrors;
};

module.exports = { digitsOnly, isValidEmail, isValidZip, buildInitialValues, validateFieldSet };
