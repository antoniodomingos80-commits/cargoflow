'use client';

import * as React from 'react';
import { Input, type InputProps } from './input';

/** Insere espaços a cada 3 dígitos: "500000" -> "500 000" */
function formatarMilhares(valor: string): string {
  const digitos = valor.replace(/\D/g, '');
  if (!digitos) return '';
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Campo de valor monetário com separador de milhares em tempo real.
 *
 * Um <input type="number"> nativo não permite mostrar espaços a cada 3
 * dígitos (o browser rejeita), por isso um preço como 500000 aparecia
 * sempre em bloco, difícil de ler rapidamente. Este componente usa texto
 * simples, formata visualmente enquanto o utilizador escreve, e envia o
 * valor formatado no submit — o servidor (parseAmount) já sabe limpar os
 * espaços, por isso não precisa de nenhuma mudança do lado da Server Action.
 */
export const InputMoeda = React.forwardRef<HTMLInputElement, Omit<InputProps, 'type'>>(
  ({ defaultValue, onChange, ...props }, ref) => {
    const [valor, setValor] = React.useState(() =>
      defaultValue != null && defaultValue !== '' ? formatarMilhares(String(defaultValue)) : '',
    );

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={valor}
        onChange={(e) => {
          const formatado = formatarMilhares(e.target.value);
          setValor(formatado);
          onChange?.(e);
        }}
      />
    );
  },
);
InputMoeda.displayName = 'InputMoeda';
