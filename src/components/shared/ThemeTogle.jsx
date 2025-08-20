import styles from "../../styles/Global.module.css";

/**
 * ThemeToggle
 * - Toggles :root `.dark` class and persists preference in localStorage
 * - Uses project button styling and accessible attributes
 * - Texts/logs in English
 */
export default function ThemeToggle() {
  function toggle() {
    try {
      const el = document.documentElement;
      const next = !el.classList.contains("dark");
      el.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch (err) {
      console.error("[Theme] Failed to toggle theme:", err);
    }
  }

  const isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <button
      className={styles.button}
      onClick={toggle}
      aria-pressed={isDark}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
