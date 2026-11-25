import * as React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "gold" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", size = "default", ...props }, ref) => {
    const variants: Record<string, string> = {
      default: "bg-slate-100 text-slate-950 hover:bg-white",
      gold: "bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-semibold shadow-[0_0_28px_rgba(245,158,11,0.35)] hover:shadow-[0_0_40px_rgba(245,158,11,0.55)]",
      outline:
        "border border-slate-700 bg-slate-900/60 text-slate-100 hover:border-amber-400/60 hover:bg-slate-900",
      ghost: "text-slate-300 hover:text-white hover:bg-white/5",
    };
    const sizes: Record<string, string> = {
      sm: "h-9 px-3.5 text-xs",
      default: "h-10 px-5 text-sm",
      lg: "h-12 px-7 text-sm",
    };

    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md font-medium transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
