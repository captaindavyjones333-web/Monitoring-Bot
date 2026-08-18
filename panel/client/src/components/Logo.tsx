import logo from "../assets/logo.svg";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
}

export default function Logo({ size = "md", showText = true }: LogoProps) {
  const sizeClasses = {
    sm: "h-12 w-12",
    md: "h-14 w-14",
    lg: "h-16 w-16",
  };

  return (
    <div className="flex items-center gap-3">
      {/* Rounded Logo Emblem */}
      <div
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center  shadow-sm shrink-0 select-none overflow-hidden transition-transform hover:scale-105`}
        title="REDstore"
      >
        <img src={logo} alt="REDstore logo" className="h-full w-full object-cover" />
      </div>

      {showText && (
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-0.5">
            <span className="font-display text-lg font-black tracking-tight text-brand">RED</span>
            <span className="font-display text-lg font-extrabold tracking-tight text-ink">store</span>
          </div>
          <span className="text-[11px] font-medium tracking-wide uppercase text-muted -mt-1">
            Monitoring Bot
          </span>
        </div>
      )}
    </div>
  );
}
