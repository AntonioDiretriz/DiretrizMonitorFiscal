import { useState } from "react";
import { getBankLogo } from "@/lib/bankLogos";

interface Props {
  banco: string;
  size?: number;
  className?: string;
}

export function BankLogo({ banco, size = 20, className = "" }: Props) {
  const [err, setErr] = useState(false);
  const url = getBankLogo(banco);

  if (!url || err) {
    return (
      <div
        className={`rounded-full flex items-center justify-center bg-muted font-semibold text-muted-foreground shrink-0 ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
      >
        {banco.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={banco}
      className={`rounded-full object-contain shrink-0 bg-white ${className}`}
      style={{ width: size, height: size }}
      onError={() => setErr(true)}
    />
  );
}
