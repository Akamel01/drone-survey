import styles from "./Wordmark.module.css";

// Papyrus AI / Mission Control: the quiet brand link to the company site (#342).
export default function Wordmark() {
  return (
    <a className={styles.wordmark} href="https://papyrus-ai.net" aria-label="Papyrus AI, Mission Control. Opens papyrus-ai.net">
      <svg className={styles.mark} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="6" aria-hidden="true">
        <path d="M25.1 40L8.6 30.5M28 37.1L18.5 20.6M32 36V17M36 37.1l9.5-16.5M38.9 40l16.5-9.5M32 44v15" />
        <g fill="currentColor" strokeWidth="0">
          <circle cx="8.6" cy="30.5" r="3.2" /><circle cx="18.5" cy="20.6" r="3.2" /><circle cx="32" cy="17" r="3.2" />
          <circle cx="45.5" cy="20.6" r="3.2" /><circle cx="55.4" cy="30.5" r="3.2" />
        </g>
      </svg>
      <span className={styles.name}>Papyrus <span className={styles.ai}>AI</span></span>
      <span className={styles.divider} aria-hidden="true" />
      <span className={styles.product}>Mission Control</span>
    </a>
  );
}
