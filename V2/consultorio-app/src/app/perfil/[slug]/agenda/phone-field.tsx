"use client";

import { useState } from "react";

import {
  COUNTRIES,
  NATIONAL_NUMBER_LENGTH,
  isValidNationalNumber,
  onlyDigits
} from "../../../../lib/phone";

type PhoneFieldProps = {
  label: string;
  countryCode: string;
  national: string;
  required?: boolean;
  placeholder?: string;
  onCountryChange: (code: string) => void;
  onNationalChange: (digits: string) => void;
};

export function PhoneField({
  label,
  countryCode,
  national,
  required,
  placeholder,
  onCountryChange,
  onNationalChange
}: PhoneFieldProps) {
  const [touched, setTouched] = useState(false);

  const digits = onlyDigits(national);
  const isEmpty = digits.length === 0;
  const valid = isValidNationalNumber(digits);
  const showError = touched && (isEmpty ? Boolean(required) : !valid);

  return (
    <label className="field">
      <span>{label}</span>
      <div className={`phone-input ${showError ? "phone-input-error" : ""}`}>
        <select
          className="phone-dial"
          aria-label="Clave de país"
          value={countryCode}
          onChange={(event) => onCountryChange(event.target.value)}
        >
          {COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.code} {country.dial}
            </option>
          ))}
        </select>
        <input
          className="phone-number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          required={required}
          placeholder={placeholder ?? "10 dígitos"}
          value={digits}
          maxLength={NATIONAL_NUMBER_LENGTH}
          onChange={(event) => onNationalChange(onlyDigits(event.target.value).slice(0, NATIONAL_NUMBER_LENGTH))}
          onBlur={() => setTouched(true)}
          aria-invalid={showError || undefined}
        />
      </div>
      {showError ? (
        <span className="phone-hint" role="alert">
          {isEmpty
            ? "Ingresa un teléfono de 10 dígitos."
            : `El teléfono debe tener ${NATIONAL_NUMBER_LENGTH} dígitos.`}
        </span>
      ) : null}
    </label>
  );
}
