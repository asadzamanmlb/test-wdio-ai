/**
 * Hide Spoilers: player Settings → toggle (MLB.TV web).
 * Call after a step that already opened a game — use { skipOpenGame: true } (default) so we do not navigate twice.
 */
const playerPage = require('../pageobjects/player.object');
const { openGamePlaybackFromMediaCenter } = require('./mediaCenterOpenGame');

/**
 * Show player chrome without clicking <video> — WebDriver click on video often hits
 * "element click intercepted" because `.mlbtv-media-controls` sits on top.
 */
async function revealPlayerControls() {
  const video = await playerPage.videoPlayer();
  await video.waitForDisplayed({ timeout: 10000 }).catch(() => {});

  await browser.execute(() => {
    const wake = (el) => {
      if (!el || !(el instanceof HTMLElement)) return;
      const r = el.getBoundingClientRect();
      const cx = Math.floor(r.left + Math.min(r.width / 2, 200));
      const cy = Math.floor(r.top + Math.min(r.height / 2, 80));
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy }));
      el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: cx, clientY: cy }));
    };
    const bars = document.querySelectorAll(
      '.mlbtv-media-controls, .vjs-control-bar, [class*="MediaControls" i]'
    );
    bars.forEach((bar) => wake(bar));
  });

  const bar = await playerPage.playerMediaControlsBar();
  if (await bar.isExisting().catch(() => false) && (await bar.isDisplayed().catch(() => false))) {
    await bar.moveTo().catch(() => {});
  }
  await browser
    .execute(() => {
      const b =
        document.querySelector('.mlbtv-media-controls') ||
        document.querySelector('.vjs-control-bar') ||
        document.querySelector('[class*="MediaControls" i]');
      if (b && b instanceof HTMLElement) b.click();
    })
    .catch(() => {});

  await browser.waitUntil(
    async () => {
      const s = await playerPage.playerSettingsButton();
      return (await s.isExisting().catch(() => false)) && (await s.isDisplayed().catch(() => false));
    },
    { timeout: 6000, interval: 250 }
  ).catch(() => {});
}

/** Normal click; if intercepted or not clickable, use DOM click (still triggers handlers). */
async function clickReliably(el) {
  if (!el || !(await el.isExisting().catch(() => false))) return false;
  try {
    await el.scrollIntoView();
    await el.waitForClickable({ timeout: 3500 });
    await el.click();
    return true;
  } catch (_) {
    try {
      await browser.execute((node) => {
        if (node && typeof node.click === 'function') node.click();
      }, el);
      return true;
    } catch (_) {
      return false;
    }
  }
}

/** Click gear only if it lives under MLB / video.js control bar (never page-wide or on `<video>`). */
async function clickFirstVisibleSettingsGear() {
  const selectors = [
    'button.mlbtv-menu-right__item.user-settings',
    'button.user-settings[aria-label*="Settings menu" i]',
    'button[aria-label*="Settings menu" i]',
    '.mlbtv-media-controls button.mlbtv-menu-right__item.user-settings',
    '.mlbtv-media-controls button.user-settings',
    '.mlbtv-media-controls button[aria-label*="Settings menu" i]',
    '.mlbtv-media-controls button[aria-label*="Settings" i]',
    '.mlbtv-media-controls [data-testid*="player-settings" i]',
    '.mlbtv-media-controls [data-testid*="settings-menu" i]',
    '.vjs-control-bar button[aria-label*="Settings" i]',
    '.vjs-control-bar .vjs-icon-settings',
    '.vjs-menu-button-popup .vjs-icon-settings',
  ];
  for (const sel of selectors) {
    const list = await $$(sel);
    for (const btn of list) {
      if (await btn.isDisplayed().catch(() => false)) {
        if (await clickReliably(btn)) return true;
      }
    }
  }

  const domClicked = await browser.execute(() => {
    const tryClick = (b) => {
      if (!(b instanceof HTMLElement)) return false;
      const r = b.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      b.click();
      return true;
    };
    const direct =
      document.querySelector('button.mlbtv-menu-right__item.user-settings') ||
      document.querySelector('button.user-settings[aria-label*="Settings menu" i]');
    if (tryClick(direct)) return true;
    const roots = document.querySelectorAll('.mlbtv-media-controls, .vjs-control-bar, [class*="mlbtv-menu-right" i]');
    for (const root of roots) {
      const u = root.querySelector('button.user-settings, button.mlbtv-menu-right__item.user-settings');
      if (tryClick(u)) return true;
      const candidates = root.querySelectorAll(
        'button[aria-label*="Settings menu" i], button[aria-label*="Settings" i], button[title*="Settings" i], [data-testid*="player-settings" i], .vjs-icon-settings'
      );
      for (const b of candidates) {
        if (tryClick(b)) return true;
      }
    }
    return false;
  });
  if (domClicked) return true;

  const fallback = await playerPage.playerSettingsButton();
  if (await fallback.isDisplayed().catch(() => false)) {
    return clickReliably(fallback);
  }
  return false;
}

/** Hide Spoilers often lives under Settings → General. */
async function ensureGeneralTabIfPresent() {
  const clicked = await browser.execute(() => {
    const dialog = document.querySelector('[role="dialog"], [role="menu"], [class*="settings" i][class*="panel" i]');
    const root = dialog || document.body;
    const nodes = root.querySelectorAll('button, [role="tab"], [role="menuitem"], a');
    for (const n of nodes) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^general$/i.test(t) || /^general\s/i.test(t)) {
        n.click();
        return true;
      }
    }
    return false;
  });
  if (clicked) await new Promise((r) => setTimeout(r, 350));
}

async function controlIsOn(el) {
  const role = (await el.getAttribute('role').catch(() => '')) || '';
  /** MUI / MLB: button[type=button][role=checkbox][aria-checked] */
  if (role === 'switch' || role === 'checkbox') {
    const ac = await el.getAttribute('aria-checked').catch(() => '');
    if (ac === 'true') return true;
    if (ac === 'false' || ac === 'mixed') return false;
  }
  const type = await el.getAttribute('type').catch(() => '');
  if (type === 'checkbox') {
    const ac = await el.getAttribute('aria-checked').catch(() => '');
    if (ac === 'true') return true;
    if (ac === 'false') return false;
    const c = await el.getAttribute('checked').catch(() => null);
    if (c === 'true' || c === true) return true;
    return await el.isSelected().catch(() => false);
  }
  const aria = await el.getAttribute('aria-pressed').catch(() => '');
  if (aria === 'true') return true;
  return false;
}

async function findHideSpoilersControl() {
  const trySelectors = [
    '[role="switch"][aria-label*="poiler" i]',
    '[role="switch"][aria-label*="Hide" i]',
    '[aria-label*="Hide spoiler" i]',
    '[data-testid*="hide-spoiler" i]',
    '[data-testid*="hideSpoiler" i]',
    'input[type="checkbox"][name*="poiler" i]',
    'input[type="checkbox"][aria-label*="poiler" i]',
  ];
  for (const sel of trySelectors) {
    const el = await $(sel);
    if (await el.isExisting().catch(() => false) && (await el.isDisplayed().catch(() => false))) {
      return el;
    }
  }

  const switches = await $$('[role="switch"], [role="checkbox"][aria-label*="poiler" i], [role="checkbox"][aria-label*="Hide" i]');
  for (const el of switches) {
    const al = (await el.getAttribute('aria-label').catch(() => '')) || '';
    if (/hide/i.test(al) && /spoiler/i.test(al) && (await el.isDisplayed().catch(() => false))) {
      return el;
    }
  }

  const checks = await $$('input[type="checkbox"]');
  for (const el of checks) {
    const al = (await el.getAttribute('aria-label').catch(() => '')) || '';
    const nm = (await el.getAttribute('name').catch(() => '')) || '';
    const id = (await el.getAttribute('id').catch(() => '')) || '';
    let labelText = '';
    if (id) {
      const lab = await $(`label[for="${id.replace(/"/g, '\\"')}"]`);
      if (await lab.isExisting().catch(() => false)) {
        labelText = (await lab.getText().catch(() => '')) || '';
      }
    }
    const blob = `${al} ${nm} ${labelText}`.toLowerCase();
    if (blob.includes('hide') && blob.includes('spoiler') && (await el.isDisplayed().catch(() => false))) {
      return el;
    }
  }

  return null;
}

async function openPlayerSettingsMenu() {
  await revealPlayerControls();
  await clickFirstVisibleSettingsGear();

  await browser.waitUntil(
    async () => {
      const panel = await playerPage.playerSettingsPanel();
      const toggle = await findHideSpoilersControl();
      return (
        (await panel.isDisplayed().catch(() => false)) ||
        (toggle && (await toggle.isDisplayed().catch(() => false)))
      );
    },
    { timeout: 5000, interval: 300 }
  ).catch(() => {});

  if (await findHideSpoilersControl()) {
    return;
  }

  await ensureGeneralTabIfPresent();

  await browser.waitUntil(
    async () => {
      const t = await findHideSpoilersControl();
      return t && (await t.isDisplayed().catch(() => false));
    },
    { timeout: 4000, interval: 300 }
  ).catch(() => {});

  if (await findHideSpoilersControl()) {
    return;
  }

  const more = await playerPage.playerMoreButton();
  if (await more.isExisting().catch(() => false) && (await more.isDisplayed().catch(() => false))) {
    await clickReliably(more);
    await browser.waitUntil(
      async () => {
        const t = await findHideSpoilersControl();
        return t && (await t.isDisplayed().catch(() => false));
      },
      { timeout: 3000, interval: 250 }
    ).catch(() => {});
    if (await findHideSpoilersControl()) return;

    await revealPlayerControls();
    await clickFirstVisibleSettingsGear();
    await ensureGeneralTabIfPresent();
  }

  await browser.waitUntil(
    async () => {
      const t = await findHideSpoilersControl();
      return t && (await t.isDisplayed().catch(() => false));
    },
    { timeout: 8000, interval: 400, timeoutMsg: 'Hide Spoilers control not found after opening player settings' }
  ).catch(() => {});
}

/**
 * Ensure Hide Spoilers matches desired state via player UI.
 * @param {boolean} wantOn
 * @param {{ skipOpenGame?: boolean }} [options] - If false, opens a game first (legacy). If true (default), expects video already playing.
 */
async function ensureHideSpoilersState(wantOn, options = {}) {
  const { skipOpenGame = true } = options;
  if (!skipOpenGame) {
    await openGamePlaybackFromMediaCenter({ preferTodayLiveFirst: true });
  }

  /**
   * Open Settings once, then poll for the toggle. Second pass only if menu was empty (e.g. wrong tab).
   */
  async function resolveToggleAfterSingleMenuOpen() {
    await openPlayerSettingsMenu();

    await browser.waitUntil(
      async () => {
        const t = await findHideSpoilersControl();
        return t && (await t.isDisplayed().catch(() => false));
      },
      { timeout: 8000, interval: 350, timeoutMsg: 'Hide Spoilers toggle not visible after opening Settings' }
    ).catch(() => {});

    let t = await findHideSpoilersControl();
    if (t && (await t.isDisplayed().catch(() => false))) {
      return t;
    }

    await revealPlayerControls();
    await clickFirstVisibleSettingsGear();
    await ensureGeneralTabIfPresent();
    await browser.waitUntil(
      async () => {
        const el = await findHideSpoilersControl();
        return el && (await el.isDisplayed().catch(() => false));
      },
      { timeout: 6000, interval: 350 }
    ).catch(() => {});

    return await findHideSpoilersControl();
  }

  const toggle = await resolveToggleAfterSingleMenuOpen();

  if (!toggle || !(await toggle.isDisplayed().catch(() => false))) {
    throw new Error(
      'Could not find Hide Spoilers toggle in player Settings. Capture selectors from QA/BETA DOM and update player.object.js / hideSpoilersSettings.js'
    );
  }

  await toggle.scrollIntoView().catch(() => {});

  const already = await controlIsOn(toggle);
  if (already === wantOn) return;

  await clickReliably(toggle);

  await browser.waitUntil(
    async () => (await controlIsOn(toggle)) === wantOn,
    { timeout: 8000, interval: 400, timeoutMsg: `Hide Spoilers did not reach ${wantOn ? 'ON' : 'OFF'} after toggle click` }
  );
}

module.exports = {
  ensureHideSpoilersOn: (opts) => ensureHideSpoilersState(true, opts),
  ensureHideSpoilersOff: (opts) => ensureHideSpoilersState(false, opts),
  ensureHideSpoilersState,
};
