/**
 * Chrome flags + prefs for automation (local + Sauce).
 *
 * Chrome's "Change your password" / data-breach modal comes from Password Manager leak
 * detection — NOT from site popups. `--disable-popup-blocking` does not suppress it.
 * Aligns with webTv-temp/wdio.local.conf.js patterns.
 *
 * @param {string[]} [extraArgs] — appended after base args (e.g. headless, window size)
 * @returns {{ args: string[], prefs: Record<string, boolean> }}
 */
function getChromeAutomationOptions(extraArgs = []) {
  return {
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      /** Reduces password-store integration that can trigger breach UI */
      '--password-store=basic',
      /** Disable leak detection + related onboarding (Chrome 120+) */
      /** Match webTv-temp: turn off password manager + leak UI in automated Chrome */
      '--disable-features=PasswordLeakDetection,PasswordManagerOnboarding,PasswordManagerEnabled',
      ...extraArgs,
    ],
    prefs: {
      credentials_enable_service: false,
      'profile.password_manager_enabled': false,
      'profile.password_manager_leak_detection': false,
      'autofill.profile_enabled': false,
    },
  };
}

module.exports = {
  getChromeAutomationOptions,
};
