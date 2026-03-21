/**
 * Smoke step definitions - WSTE-44 VOD playback (based on webTv-temp)
 * Uses MAST API to find VOD carousels like webTv-temp contentPlayback.
 */
const { Given, When, Then } = require('@wdio/cucumber-framework');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { baseUrl } = require('../../config/env');
const loginPage = require('../pageobjects/loginPage.object');
const commonPage = require('../pageobjects/commonPage.object');
const playerPage = require('../pageobjects/player.object');
const contentPageObject = require('../pageobjects/content.object');
const { qaTestUsers } = require('../../testUsers');

const PLAYLIST_API_QA = 'https://mastapi.mobileqa.mlbinfra.com/api/video/v1/playlist';
const PLAYLIST_API_BETA = 'https://mastapi.mobilebeta.mlbinfra.com/api/video/v1/playlist';

const email = process.env.TEST_EMAIL || qaTestUsers['Yearly User'];
const password = process.env.TEST_PASSWORD || qaTestUsers.Password;

async function handleBetaPreAuthIfPresent() {
  const usernameEl = await loginPage.betaUsername();
  const exists = await usernameEl.isExisting().catch(() => false);
  if (!exists || !(await usernameEl.isDisplayed().catch(() => false))) return;

  const betaUser = process.env.BETA_USERNAME || qaTestUsers['Yearly User'];
  const betaPass = process.env.BETA_PASSWORD || qaTestUsers.Password;

  await usernameEl.waitForDisplayed({ timeout: 5000 }).catch(() => {});
  await usernameEl.setValue(betaUser);
  await (await loginPage.betaPassword()).setValue(betaPass);
  await (await loginPage.betaLoginButton()).click();
  await browser.waitUntil(
    async () => !(await loginPage.betaUsername().isDisplayed().catch(() => false)),
    { timeout: 5000 }
  );
}

async function handleCookieConsentIfPresent() {
  const acceptSelectors = [
    'button#onetrust-accept-btn-handler',
    '[data-testid="consent-banner"] button',
    'button[class*="accept"], button[class*="Accept"]',
    '.onetrust-close-btn-handler',
    '[aria-label*="accept" i], [aria-label*="agree" i]',
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const sel of acceptSelectors) {
      try {
        const btn = await $(sel);
        if (await btn.isExisting() && (await btn.isDisplayed())) {
          await btn.waitForClickable({ timeout: 2000 }).catch(() => {});
          await btn.click();
          await browser.waitUntil(
            async () => !(await $(sel).isDisplayed().catch(() => true)),
            { timeout: 3000 }
          ).catch(() => {});
          return;
        }
      } catch (_) {}
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function isVodLink(href) {
  if (!href || typeof href !== 'string') return false;
  const h = href.toLowerCase();
  if (!h.includes('/video/')) return false;
  if (h.includes('/watch/mlbn') || h.includes('/tv/watch/mlbn')) return false;
  if (h.includes('/watch/live') || h.includes('/live-stream-games/')) return false;
  return true;
}

function escapeXPathText(text) {
  const s = String(text || '');
  if (!s.includes("'")) return `'${s}'`;
  const parts = s.split("'");
  return `concat(${parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(`, "'", `)})`;
}

Given(/^a user is logged into mlb\.com\/tv \(any user\)$/, async function () {
  await browser.url(baseUrl);
  await browser.waitUntil(
    async () => (await browser.getUrl()).includes('mlb.com') || (await browser.getUrl()).includes('okta'),
    { timeout: 10000 }
  );
  if (baseUrl.includes('beta-gcp')) await handleBetaPreAuthIfPresent();
  await handleCookieConsentIfPresent();

  const accountDropdown = await commonPage.accountDropdown();
  if (await accountDropdown.isExisting() && (await accountDropdown.isDisplayed())) {
    return;
  }

  const url = await browser.getUrl();
  if (!url.includes('login') && !url.includes('okta') && !url.includes('auth')) {
    const loginBtn = await $('[data-testid="header-profile-button"], [data-testid="headerLink-Log In"]');
    if (await loginBtn.isDisplayed().catch(() => false)) {
      await loginBtn.click();
      await browser.waitUntil(
        async () => {
          const u = await browser.getUrl();
          return u.includes('login') || u.includes('okta') || (await loginPage.emailInput().isDisplayed().catch(() => false));
        },
        { timeout: 10000 }
      );
    }
  }

  await handleCookieConsentIfPresent();
  const emailInput = await loginPage.emailInput();
  await emailInput.waitForDisplayed({ timeout: 15000 });
  await emailInput.setValue(email);

  await handleCookieConsentIfPresent();
  const continueBtn = await loginPage.continueButton();
  await continueBtn.waitForClickable({ timeout: 15000 });
  await continueBtn.click();
  await browser.waitUntil(
    async () => {
      const verify = await loginPage.verifyWithPasswordButton();
      const pass = await loginPage.passwordInput();
      return (await verify.isDisplayed().catch(() => false)) || (await pass.isDisplayed().catch(() => false));
    },
    { timeout: 10000 }
  );

  const verifyPassword = await loginPage.verifyWithPasswordButton();
  if (await verifyPassword.isExisting()) await verifyPassword.click();
  await (await loginPage.passwordInput()).waitForDisplayed({ timeout: 5000 });
  await (await loginPage.passwordInput()).setValue(password);

  const loginBtn = await loginPage.loginButton();
  await loginBtn.click();

  await browser.waitUntil(
    async () => {
      const acct = await commonPage.accountDropdown();
      return (await acct.isExisting()) && (await acct.isDisplayed());
    },
    { timeout: 30000, timeoutMsg: 'Login did not succeed' }
  );
});

When('the user navigates down to select a VOD video', async function () {
  await handleCookieConsentIfPresent();

  await browser.waitUntil(
    async () => (await browser.execute(() => document.readyState)) === 'complete',
    { timeout: 15000, timeoutMsg: 'Page did not load' }
  );

  const apiUrl = baseUrl.includes('beta-gcp') ? PLAYLIST_API_BETA : PLAYLIST_API_QA;

  let playlistData = null;
  try {
    playlistData = await browser.execute(async (url) => {
      const res = await fetch(url);
      return await res.json();
    }, apiUrl);
  } catch (e) {
    console.log(`API call failed: ${e.message}, falling back to DOM search`);
  }

  let vodTile = null;

  if (playlistData?.items?.length > 0) {
    const vodPlaylists = playlistData.items.filter(
      (item) => item.type === 'vod' && item.url && item.title && item.hideSpoilers !== true
    );

    if (vodPlaylists.length > 0) {
      const firstVod = vodPlaylists[0];
      const carouselTitle = firstVod.title;
      await browser.execute(() => window.scrollTo(0, 0));

      for (let scrollAttempt = 0; scrollAttempt < 25; scrollAttempt++) {
        const headings = await contentPageObject['Carousel Headings']();
        const headingsArr = Array.isArray(headings) ? headings : Array.from(headings);
        let found = false;
        for (const el of headingsArr) {
          try {
            const title = (typeof el.getText === 'function' ? await el.getText() : null) || '';
            const t = String(title || '').trim();
            if (t && (t === carouselTitle || t.includes(carouselTitle) || carouselTitle.includes(t))) {
              found = true;
              break;
            }
          } catch (_) {}
        }
        if (!found) {
          try {
            const altHeadings = await contentPageObject['Content Headings']();
            const altArr = Array.isArray(altHeadings) ? altHeadings : Array.from(altHeadings);
            for (const el of altArr) {
              try {
                const title = (typeof el.getText === 'function' ? await el.getText() : null) || '';
                const t = String(title || '').trim();
                if (t && (t === carouselTitle || t.includes(carouselTitle) || carouselTitle.includes(t))) {
                  found = true;
                  break;
                }
              } catch (_) {}
            }
          } catch (_) {}
        }

        if (found) {
          const escapedTitle = escapeXPathText(carouselTitle);
          const xpaths = [
            `//h2[contains(text(), ${escapedTitle})]/following-sibling::*//a[@href] | //h3[contains(text(), ${escapedTitle})]/following-sibling::*//a[@href]`,
            `//h2[contains(text(), ${escapedTitle})]/..//ul/li//a[@href] | //h3[contains(text(), ${escapedTitle})]/..//ul/li//a[@href]`,
          ];
          for (const xpath of xpaths) {
            try {
              const tiles = await browser.$$(xpath);
              for (const tile of tiles) {
                try {
                  const href = await tile.getAttribute('href').catch(() => null);
                  if (href && isVodLink(href) && (await tile.isDisplayed().catch(() => false))) {
                    vodTile = tile;
                    break;
                  }
                } catch (_) {}
              }
              if (vodTile) break;
            } catch (_) {}
          }
          if (vodTile) break;
        }

        await browser.execute(() => window.scrollBy(0, window.innerHeight * 0.5));
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }

  if (!vodTile) {
    for (let scrollAttempt = 0; scrollAttempt < 8; scrollAttempt++) {
      const candidates = await browser.$$('a[href*="/video/"]');
      for (const el of candidates) {
        try {
          const href = await el.getAttribute('href').catch(() => null);
          if (href && isVodLink(href) && (await el.isDisplayed().catch(() => false))) {
            vodTile = el;
            break;
          }
        } catch (_) {}
      }
      if (vodTile) break;
      await browser.execute(() => window.scrollBy(0, window.innerHeight * 0.5));
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  if (!vodTile) {
    throw new Error('No VOD video tile found on homepage after scrolling');
  }

  await vodTile.scrollIntoView({ block: 'center' });
  await vodTile.waitForClickable({ timeout: 10000 });
  const handlesBefore = await browser.getWindowHandles();
  await vodTile.click();

  await browser.waitUntil(
    async () => {
      const handles = await browser.getWindowHandles();
      if (handles.length > handlesBefore.length) return true;
      const url = await browser.getUrl();
      return url.includes('/video/') || url.includes('/watch/') || url.includes('/shows/');
    },
    { timeout: 15000, timeoutMsg: 'Did not navigate to video page after clicking VOD tile', interval: 800 }
  );

  const handles = await browser.getWindowHandles();
  if (handles.length > handlesBefore.length) {
    await browser.switchToWindow(handles[handles.length - 1]);
  }
  const url = await browser.getUrl();
  if (!url.includes('/video/') && !url.includes('/watch/')) {
    throw new Error(`Expected video page, got: ${url}`);
  }
});

/**
 * Then the user is able to play the VOD Video successfully
 * Ported from webTv-temp contentPlayback.steps.js: playback should start successfully + I validate playback position for VOD
 */
Then('the user is able to play the VOD Video successfully', async function () {
  console.log('   🎬 Validating VOD playback started...');

  // Wait for video element to appear
  await browser.waitUntil(
    async () => {
      const videoExists = await browser.execute(() => document.querySelector('video') !== null);
      return videoExists;
    },
    { timeout: 15000, timeoutMsg: 'Video element did not appear after 15 seconds', interval: 500 }
  );
  console.log('   ✅ Video element found');

  // Simulate user interaction for autoplay
  await browser.execute(() => document.body.click());

  const videoPlayer = await playerPage.videoPlayer();
  const videoPlayerExists = await videoPlayer.isExisting();
  if (!videoPlayerExists) throw new Error('Video player should be present');
  console.log('   ✓ Video player present');

  // Ad detection (from webTv-temp)
  let hasAd = await browser.execute(() => {
    const video = document.querySelector('video');
    if (!video) return false;
    const title = video.getAttribute('title') || '';
    return title.toLowerCase().includes('advertisement') || title.toLowerCase().includes('ad');
  });

  const waitForVodAd = process.env.WAIT_FOR_VOD_AD === 'true' || process.env.WAIT_FOR_VOD_AD === '1';

  if (hasAd) {
    console.log('   📺 Advertisement detected - looking for skip button...');
    const adSkipSelectors = [
      '[class*="skip"]',
      '[id*="skip"]',
      'button[aria-label*="skip" i]',
      '.ad-skip-button',
      '#ad-skip',
      '[class*="Skip"]',
    ];
    let adSkipped = false;
    for (const selector of adSkipSelectors) {
      try {
        const skipButton = await $(selector);
        if (await skipButton.isExisting() && (await skipButton.isDisplayed())) {
          await skipButton.click();
          console.log(`   ✅ Clicked ad skip button (${selector})`);
          adSkipped = true;
          break;
        }
      } catch (e) {
        /* continue */
      }
    }
    if (!adSkipped && waitForVodAd) {
      console.log('   ⏳ No skip button found, waiting up to 60s for ad to finish...');
      await browser.waitUntil(
        async () => {
          const adStatus = await browser.execute(() => {
            const video = document.querySelector('video');
            if (!video) return { ended: true };
            const title = video.getAttribute('title') || '';
            const isAd = title.toLowerCase().includes('advertisement') || title.toLowerCase().includes('ad');
            if (!isAd || video.readyState >= 2) return { ended: true };
            return { ended: false };
          });
          return adStatus.ended;
        },
        { timeout: 60000, interval: 500 }
      ).catch(() => {
        console.log('   ⚠️  Ad wait timeout after 60s, continuing...');
      });
    }
  } else if (waitForVodAd) {
    await browser.waitUntil(
      async () => {
        const s = await browser.execute(() => {
          const v = document.querySelector('video');
          if (!v) return { done: false };
          const title = (v.getAttribute('title') || '').toLowerCase();
          if (title.includes('advertisement') || title.includes(' ad ')) return { done: false };
          return { done: v.readyState >= 2 };
        });
        return s.done;
      },
      { timeout: 60000, interval: 1000 }
    ).catch(() => {});
  }

  // Blocking iframe check (from webTv-temp)
  await browser.waitUntil(
    async () => {
      const blocking = await browser.execute(() => {
        const video = document.querySelector('video');
        if (!video) return false;
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const ir = iframe.getBoundingClientRect();
            const vr = video.getBoundingClientRect();
            const overlaps = !(ir.right < vr.left || ir.left > vr.right || ir.bottom < vr.top || ir.top > vr.bottom);
            if (overlaps && iframe.style.display !== 'none' && iframe.style.visibility !== 'hidden') return true;
          } catch (e) {}
        }
        return false;
      });
      return !blocking;
    },
    { timeout: 10000, timeoutMsg: 'Blocking iframe still present', interval: 500 }
  ).catch(() => {});

  // Click video container + video.play() (from webTv-temp)
  await browser.execute(() => {
    const video = document.querySelector('video');
    if (video) {
      const container = video.closest('[class*="player"], [class*="Player"], [id*="player"], [id*="Player"]') || video.parentElement;
      if (container) container.click();
      video.play().catch(() => {});
    }
  });

  // Wait for content video loaded (readyState >= 2, not ad)
  await browser.waitUntil(
    async () => {
      const state = await browser.execute(() => {
        const video = document.querySelector('video');
        if (!video) return { ready: false };
        const title = (video.getAttribute('title') || '').toLowerCase();
        const isAd = title.includes('advertisement') || title.includes(' ad ');
        return { ready: video.readyState >= 2 && !isAd };
      });
      return state.ready;
    },
    { timeout: 15000, timeoutMsg: 'Content video did not load', interval: 500 }
  );

  // If paused, click player and play
  const initialState = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? { paused: v.paused } : { paused: true };
  });
  if (initialState.paused) {
    try {
      await videoPlayer.click();
    } catch (e) {
      /* ignore */
    }
    await browser.execute(() => {
      const v = document.querySelector('video');
      if (v) v.play().catch(() => {});
    });
  }

  // Verify video is playing (from webTv-temp: expect finalState to be false i.e. not paused)
  await browser.waitUntil(
    async () => {
      const v = await browser.execute(() => {
        const el = document.querySelector('video');
        return el ? !el.paused && !el.ended && el.readyState > 2 : false;
      });
      return v;
    },
    { timeout: 10000, timeoutMsg: 'Video did not start playing' }
  );
  const finalState = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? { paused: v.paused, ended: v.ended, readyState: v.readyState } : null;
  });
  if (finalState && (finalState.paused || finalState.ended)) {
    throw new Error('Video should be playing (not paused)');
  }
  console.log('   ✓ Video is playing');

  // Validate duration (from webTv-temp playback should start successfully)
  const duration = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.duration : 0;
  });
  if (!(duration > 0)) throw new Error('Video should have valid duration');
  console.log(`   ✓ Video duration: ${duration.toFixed(2)}s`);

  // VOD position validation (from webTv-temp I validate playback position for VOD)
  const currentTime = await browser.execute(() => {
    const v = document.querySelector('video');
    return v ? v.currentTime : 0;
  });
  await browser.waitUntil(
    async () => {
      const time = await browser.execute(() => {
        const v = document.querySelector('video');
        return v ? v.currentTime : 0;
      });
      return time > currentTime;
    },
    { timeout: 10000, timeoutMsg: 'Video time did not progress within 10 seconds' }
  );
  console.log('   ✓ Video time progressing');

  // I verify video content player functionality (from webTv-temp playerControls.steps.js)
  // Test pause and resume to validate player controls
  console.log('   ⏸️  Testing pause functionality...');
  await browser.execute(() => {
    const video = document.querySelector('video');
    if (video) video.pause();
  });
  await browser.waitUntil(
    async () => {
      const paused = await browser.execute(() => {
        const v = document.querySelector('video');
        return v ? v.paused : false;
      });
      return paused;
    },
    { timeout: 5000, timeoutMsg: 'Video should be paused' }
  );
  console.log('   ✓ Pause verified');

  console.log('   ▶️  Testing resume functionality...');
  await browser.execute(() => {
    const video = document.querySelector('video');
    if (video) video.play().catch(() => {});
  });
  await browser.waitUntil(
    async () => {
      const playing = await browser.execute(() => {
        const v = document.querySelector('video');
        return v ? !v.paused : false;
      });
      return playing;
    },
    { timeout: 5000, timeoutMsg: 'Video should resume playing' }
  );
  console.log('   ✓ Resume verified');

  console.log('   ✅ VOD playback validated - start, position, pause, resume');
});
