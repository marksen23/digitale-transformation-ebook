import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/** Reads the `dark` class from <html> — syncs with our custom darkMode toggle. */
function useDarkClass(): "dark" | "light" {
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark ? "dark" : "light";
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDarkClass();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
