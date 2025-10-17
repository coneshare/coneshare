export function Badge({ children, className, variant = 'outline', ...props }) {
  const baseClasses = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors';

  const variants = {
    outline: 'text-foreground'
  };

  const combinedClasses = `${baseClasses} ${variants[variant]} ${className || ''}`;

  return (
    <div className={combinedClasses} {...props}>
      {children}
    </div>
  );
}
