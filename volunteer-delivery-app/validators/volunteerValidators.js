export const digitsOnly = (value = "") => String(value).replace(/\D/g, "");

export const isValidEmail = (value = "") =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

export const isValidZip = (value = "") => /^\d{5}$/.test(String(value).trim());

export const buildInitialValues = (fields = []) =>
  Object.fromEntries(fields.map((field) => [field.key, ""]));

export const validateFieldSet = ({ fields = [], values = {}, keys }) => {
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
