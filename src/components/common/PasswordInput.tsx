import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  iconClassName?: string;
  buttonClassName?: string;
  containerClassName?: string;
}

/**
 * Reusable PasswordInput with eye toggle (Lihat / Sembunyikan Kata Sandi).
 * - Default type is "password" (hidden).
 * - Clicking eye icon toggles to "text" (visible) and back.
 * - Uses type="button" to prevent accidental form submission.
 * - Preserves typed input value seamlessly on desktop and mobile.
 */
export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder = 'Masukkan kata sandi...',
  required = false,
  className = '',
  containerClassName = '',
  buttonClassName = '',
  iconClassName = '',
  disabled = false,
  autoComplete = 'current-password',
  ...rest
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible((prev) => !prev);
  };

  return (
    <div className={`relative flex items-center w-full ${containerClassName}`}>
      <input
        type={isVisible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className={`w-full pr-11 ${className}`}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={toggleVisibility}
        disabled={disabled}
        title={isVisible ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
        aria-label={isVisible ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'}
        className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 active:text-amber-400 hover:bg-slate-700/50 transition-colors cursor-pointer select-none focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed ${buttonClassName}`}
      >
        {isVisible ? (
          <EyeOff className={`w-4 h-4 ${iconClassName || 'text-amber-400'}`} />
        ) : (
          <Eye className={`w-4 h-4 ${iconClassName || 'text-slate-400'}`} />
        )}
      </button>
    </div>
  );
};
