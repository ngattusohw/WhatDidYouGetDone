interface LinearIconProps {
  className?: string;
}

export function LinearIcon({ className = "h-5 w-5" }: LinearIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.357 2.612a.5.5 0 0 0-.732.542l1.537 7.686a.5.5 0 0 0 .39.39l7.686 1.537a.5.5 0 0 0 .542-.732L3.357 2.612z" />
      <path d="M20.643 21.388a.5.5 0 0 0 .732-.542l-1.537-7.686a.5.5 0 0 0-.39-.39l-7.686-1.537a.5.5 0 0 0-.542.732l9.423 9.423z" />
    </svg>
  );
}
