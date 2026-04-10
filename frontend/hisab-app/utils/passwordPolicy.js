export const evaluatePasswordPolicy = (password, minLength = 8) => {
  const normalizedPassword = String(password || '');
  const issues = [];

  if (normalizedPassword.length < minLength) {
    issues.push(`at least ${minLength} characters`);
  }

  if (!/[A-Z]/.test(normalizedPassword)) {
    issues.push('one uppercase letter');
  }

  if (!/[a-z]/.test(normalizedPassword)) {
    issues.push('one lowercase letter');
  }

  if (!/[0-9]/.test(normalizedPassword)) {
    issues.push('one number');
  }

  if (!/[^A-Za-z0-9]/.test(normalizedPassword)) {
    issues.push('one special character');
  }

  if (!issues.length) {
    return { ok: true, message: '' };
  }

  return {
    ok: false,
    message: `Password must contain ${issues.join(', ')}.`,
  };
};
