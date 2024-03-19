document.addEventListener('alpine:init', () => {
    Alpine.store('theme', {
        // Tracks the current theme explicitly, including 'system'
        current: localStorage.getItem('theme') || 'system',

        // Determines if the theme is dark for applying styles
        dark() {
            return this.current === 'dark' || (this.current === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
        },

        // Updates the theme, handling 'system' as a dynamic state
        set(theme) {
            this.current = theme;
            localStorage.setItem('theme', theme);
            if (theme === 'system') {
                // Remove the theme from localStorage to follow the system theme
                localStorage.removeItem('theme');
                // Apply dark or light class based on system preference
                document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
            } else {
                // Apply theme directly
                document.documentElement.classList.toggle('dark', theme === 'dark');
            }
            // Notify the application of the theme change
            window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme: this.current } }));
        },

        // Toggles the theme between dark and light, not affecting the 'system' setting
        toggle() {
            this.set(this.dark() ? 'light' : 'dark');
        },
    });

    // Respond to system theme changes if 'system' is selected
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
        if (Alpine.store('theme').current === 'system') {
            document.documentElement.classList.toggle('dark', event.matches);
        }
    });
});
