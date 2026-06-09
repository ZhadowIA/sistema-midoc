export type PasswordPolicyResult =
  | { ok: true }
  | {
      ok: false
      message: string
    }

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < 10) {
    return { ok: false, message: 'La contraseña debe tener al menos 10 caracteres' }
  }

  const hasLowercase = /[a-z]/.test(password)
  const hasUppercase = /[A-Z]/.test(password)
  const hasNumber = /\d/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)

  if (!hasLowercase || !hasUppercase || !hasNumber || !hasSymbol) {
    return {
      ok: false,
      message: 'La contraseña debe incluir mayúscula, minúscula, número y símbolo',
    }
  }

  return { ok: true }
}
