import { useTheme, Theme } from "../../contexts/ThemeContext";

const THEME_CYCLE: Theme[] = ["system", "light", "dark"];
const THEME_ICONS: Record<Theme, string> = {
  system: "🌓",
  light: "☀️",
  dark: "🌙",
};
const THEME_LABELS: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  return (
    <button
      onClick={cycleTheme}
      className="px-2 py-1 rounded hover:bg-hover text-lg"
      title={`Theme: ${THEME_LABELS[theme]}`}
      aria-label={`Current theme: ${THEME_LABELS[theme]}. Click to change.`}
    >
      {THEME_ICONS[theme]}
    </button>
  );
}